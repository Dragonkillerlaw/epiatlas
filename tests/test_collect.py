import unittest
import sys
import subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from collect import merge_reports, adapt, scoped_counts, normalize_who
from signal_store import canonical_url
from scanner_v2 import process_who, process_paho

class CollectionTests(unittest.TestCase):
    def test_count_scope_excludes_other_country_and_ambiguous_categories(self):
        loc={'iso':'BR'}
        self.assertIsNone(scoped_counts('Peru reported 100 confirmed cases.',loc,2026))
        self.assertIsNone(scoped_counts('Brazil reported 100 suspected cases and 20 confirmed cases.',loc,2026))
        self.assertEqual(scoped_counts('Brazil reported 1,200 cases, including 10 deaths.',loc,2026)['cases'],1200)

    def test_who_title_binds_count_sentence(self):
        rows=normalize_who({'Title':'Dengue - Brazil','Description':'Brazil reported 1200 confirmed cases, including 10 deaths.','UrlName':'example','PublicationDate':'2025-01-01'})
        self.assertEqual(rows[0]['case_count'],1200)
        self.assertEqual(rows[0]['death_count'],10)
    def test_declared_sentence_does_not_hang(self):
        code = "import sys; sys.path.insert(0,'vendor/geosentinel'); from signal_quality import _status; assert _status('the ministry declared an outbreak of ebola in a remote community with several suspected cases', 'who', 2026)[0] == 'active'; assert _status('country declared malaria-free', 'who', 2026)[0] == 'resolved'"
        result = subprocess.run([sys.executable,'-c',code], cwd=Path(__file__).resolve().parents[1], timeout=4, capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
    def test_tracking_urls_deduplicate(self):
        self.assertEqual(canonical_url('https://example.org/a?utm_source=x'), 'https://example.org/a')

    def test_reports_are_updated_not_added(self):
        old={'id':'same','publishedAt':'2026-01-01','cases':10}
        new={**old,'cases':20}
        self.assertEqual(merge_reports([old],[new]),[new])

    def test_same_title_different_urls_survive(self):
        self.assertEqual(len(merge_reports([{'id':'a','title':'Cholera','publishedAt':None}],[{'id':'b','title':'Cholera','publishedAt':None}])),2)

    def test_unknown_date_stays_unknown(self):
        rows=process_paho([{'title':'Dengue outbreak in Brazil','description':'Dengue outbreak in Brazil has 100 cases.','url':'https://www.paho.org/test','published':''}])
        self.assertTrue(rows)
        self.assertIsNone(adapt(rows[0])['publishedAt'])

    def test_negation_is_not_active_outbreak(self):
        rows=process_who([{'Title':'No cholera cases in Brazil','Description':'No new cholera cases in Brazil.','UrlName':'test-no-cases','PublicationDate':'2025-01-01'}])
        self.assertTrue(rows)
        self.assertNotEqual(rows[0]['event_status'],'active')
        self.assertIsNone(rows[0]['case_count'])

if __name__=='__main__': unittest.main()
