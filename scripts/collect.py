"""Collect source-linked reports; no API keys and no third-party model required.

GeoSentinel modules are vendored with their MIT notice and a documented regex fix. This adapter
preserves source excerpts and accumulates history rather than summing reports.
"""
from pathlib import Path
import argparse
import json
import os
import re
import sys
import io
import subprocess
import shutil
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "vendor" / "geosentinel"))
from collectors import Collector
from scanner_v2 import process_who, process_paho, process_news, plain_text
from signal_store import deduplicate_documents, parse_date
from signal_quality import geocode_text, _disease_mentions, _canonical_names, _norm, _geo_mentions, _status

COUNT_PATTERN = re.compile(r"\b(\d{1,3}(?:[,\u00a0\u202f]\d{3})+|\d+)\s+(?:(?:new|confirmed|suspected|probable|reported|human|laboratory-confirmed|associated)\s+){0,5}(cases?|deaths?)\b", re.I)


def scoped_counts(summary, location, year):
    """Only one unambiguous numeric case claim in a same-country sentence.

    Keep the literal passage for checking definitions. Never combine countries,
    case categories or periods; retain null when those cannot be distinguished.
    """
    if not location:
        return None
    for sentence in re.split(r"(?<=[.!?])\s+", summary):
        if _status(_norm(sentence), "who", year)[0] != "active":
            continue
        norm = _norm(sentence)
        hits = _geo_mentions(norm, _disease_mentions(norm))
        if any(h[2]["iso"] != location["iso"] for h in hits):
            continue
        matches = COUNT_PATTERN.findall(sentence)
        cases = [int(re.sub(r"\D", "", n)) for n, kind in matches if kind.lower().startswith("case")]
        deaths = [int(re.sub(r"\D", "", n)) for n, kind in matches if kind.lower().startswith("death")]
        if len(cases) == 1 and len(deaths) <= 1:
            if deaths and deaths[0] > cases[0]:
                continue
            return {"cases": cases[0], "deaths": deaths[0] if deaths else None, "evidence": sentence}
    return None


def normalize_who(item):
    """WHO-specific title binding supplements the conservative generic parser."""
    rows = process_who([item])
    title = plain_text(item.get("Title") or item.get("Name") or "")
    title_diseases = _canonical_names(_disease_mentions(_norm(title)))
    if re.search(r"middle east respiratory syndrome", title, re.I):
        title_diseases = ["mers"]
    if re.search(r"poliovirus", title, re.I):
        title_diseases = ["polio"]
    place_text = re.split(r"\s*[-–—]\s+", title)[-1] if re.search(r"[-–—]\s+", title) else ""
    title_location = geocode_text(place_text) if place_text else None
    if place_text.lower() in ("the russian federation", "russian federation", "russia"):
        title_location = {"name":"Russia","country":"Russia","iso":"RU","lat":61.52,"lng":105.32,"region":"Eurasia"}
    for row in rows:
        if len(title_diseases) == 1:
            row["disease"] = title_diseases[0]
        elif not title_diseases:
            # A disease mentioned only in the body may be a ruled-out cause.
            row["disease"] = "unknown illness"
            row["rationale"].append("Disease not identified in WHO headline; do not infer it from body mentions.")
        if title_location:
            row["location"] = title_location
        countries = {h[2]["iso"] for h in _geo_mentions(_norm(title), _disease_mentions(_norm(title)))}
        if len(countries) > 1:
            row["location"] = None
            row["rationale"].append("Multi-country headline kept in the evidence feed without one invented point.")
        description = item.get("Description", "")
        opening = re.split(r"(?<=[.!?])\s+", description)[0]
        year = (parse_date(row["published"]) or datetime.now(timezone.utc)).year
        if _status(_norm(opening), "who", year)[0] == "resolved":
            row["event_status"], row["triage"] = "resolved", "context"
            row["case_count"], row["death_count"] = None, None
            row["rationale"].append("WHO opening sentence explicitly announces outbreak closure.")
        if len(title_diseases) == 1 and row["event_status"] not in ("resolved", "negated", "context"):
            year = (parse_date(row["published"]) or datetime.now(timezone.utc)).year
            claim = scoped_counts(item.get("Description", ""), title_location, year)
            if claim:
                row["case_count"], row["death_count"] = claim["cases"], claim["deaths"]
                row["evidence"]["event_text"] = claim["evidence"]
                row["event_status"], row["triage"] = "active", "review"
                row["rationale"].append("WHO title-bound count sentence; numeric claims require human review.")
    return rows


def windows_opener(request, timeout=15):
    """Use the Windows HTTP stack when Python cannot use the host proxy.

    The URL is a separate process argument, never interpolated into shell code.
    Linux / GitHub Actions use the upstream urllib transport.
    """
    shell = shutil.which("pwsh") or shutil.which("powershell")
    if not shell:
        raise OSError("PowerShell transport unavailable")
    try:
        result = subprocess.run([shell, "-NoProfile", "-File", str(ROOT / "scripts" / "http-get.ps1"),
                                 "-Uri", request.full_url], capture_output=True, timeout=30)
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError("HTTP transport timed out") from exc
    if result.returncode:
        raise OSError("Windows HTTP request failed")
    return io.BytesIO(result.stdout.lstrip(b"\xef\xbb\xbf"))


def adapt(row):
    loc = row.get("location")
    published = row.get("published") or None
    return {
        "id": row["document_id"], "title": row["original_title"],
        "summary": row["summary"], "url": row["url"],
        "source": row["source"], "publisher": row["provenance"]["publisher"],
        "sourceType": row["evidence_level"], "publishedAt": published,
        "retrievedAt": row["retrieved_at"], "dateBasis": row["date_basis"],
        "disease": row["disease"], "location": loc,
        "status": row["event_status"], "triage": row["triage"],
        "cases": row.get("case_count"), "deaths": row.get("death_count"),
        "countBasis": "source_excerpt", "verification": "unreviewed",
        "countEvidence": row.get("evidence", {}).get("event_text", ""),
        "rationale": row.get("rationale", []),
    }


def merge_reports(previous, fresh):
    by_id = {r["id"]: r for r in previous}
    for row in fresh:
        by_id[row["id"]] = row
    return sorted(by_id.values(), key=lambda r: r.get("publishedAt") or "", reverse=True)


def collect(path, pages=3, include_news=False):
    old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    collector = Collector(opener=windows_opener if os.name == "nt" else None)
    fresh = []
    who_rows = []
    for page in range(pages):
        print(f"Collecting WHO page {page + 1}/{pages}…", flush=True)
        url = ("https://www.who.int/api/hubs/diseaseoutbreaknews"
               f"?$orderby=PublicationDate%20desc&$top=100&$skip={page * 100}")
        result = collector.request("who", url, expected=dict)
        if result is None:
            break
        rows = collector.records("who", result.get("value"))
        # WHO fields differ across versions; prefer the publisher's summary.
        for r in rows:
            r["Description"] = plain_text(r.get("Summary") or r.get("Description") or "")[:2400]
        who_rows.extend(rows)
        if len(rows) < 100:
            break
    print(f"Normalizing {len(who_rows)} WHO reports…", flush=True)
    for index, row in enumerate(who_rows):
        if index % 25 == 0:
            print(f"Processing WHO {index}/{len(who_rows)}", flush=True)
        fresh.extend(normalize_who(row))
    print("Collecting PAHO…", flush=True)
    fresh.extend(process_paho(collector.paho()))
    if include_news:
        fresh.extend(process_news(collector.news()))
    active_sources = ["who", "paho"] + (["news"] if include_news else [])
    health = [collector.health[s] for s in active_sources]
    now = datetime.now(timezone.utc).isoformat()
    for h in health:
        h["signals"] = sum(r["source"] == h["id"] for r in fresh)
    successful = any(h["successful_requests"] for h in health)
    reports = merge_reports(old.get("reports", []), [adapt(r) for r in deduplicate_documents(fresh)])
    data = {"schemaVersion": "1.0", "mode": "collected", "lastAttemptAt": now,
            "lastSuccessAt": now if successful else old.get("lastSuccessAt"),
            "sources": health, "reports": reports,
            "notes": {"dateFilter": "source publication date (UTC)",
                      "caseCounts": "source passage claims, not additive",
                      "grouping": "candidate clusters by disease/place and 45-day gaps"}}
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, path)
    print(json.dumps({"reports": len(reports), "fresh": len(fresh),
                      "mapped": sum(bool(r["location"]) for r in reports),
                      "sources": [{"id": h["id"], "status": h["status"], "items": h["items"], "errors": h["errors"]} for h in health]}, ensure_ascii=False))
    return successful


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", type=int, default=3)
    parser.add_argument("--include-news", action="store_true", help="Opt in to GDELT discovery (media, not official)")
    args = parser.parse_args()
    if not 1 <= args.pages <= 20:
        parser.error("--pages must be between 1 and 20")
    sys.exit(0 if collect(ROOT / "data" / "reports.json", args.pages, args.include_news) else 1)
