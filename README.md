# EpiAtlas · Infectious Disease Map

[Open the public map](https://dragonkillerlaw.github.io/epiatlas) · [Chinese interface](https://dragonkillerlaw.github.io/epiatlas/zh.html)

EpiAtlas is an experimental map of infectious disease reports from public health sources. It connects map points with the report summaries, reported case and death counts when available, and links to the original publications. This prototype was built through AI-assisted “vibe coding”; its extraction and severity estimates need expert review.

**How to use it:** Open the map, choose a time range in the panel at the bottom of the map, then select a circle. If a circle has a number, zoom in to separate the grouped points. The event details open on the right. Select **Read original source** to check the report. Select **× Close details** or click an empty part of the map to return to the full map. **☰ Filters** opens disease, location, source, and severity filters. A collapsed section below the map contains all reports, including those without a reliable map location.

**Important limits:** Dates refer to when reports were published, not when infections began. Points are automatically grouped candidate events, not verified outbreak records. Missing case counts are shown as unknown; the color score is exploratory and does not represent personal infection risk. GitHub Actions collects new reports every six hours. A separate GitHub Pages workflow rebuilds and publishes the latest snapshot on a similar schedule. Its last collection time is shown on the page; scheduled runs can be delayed.

For data methods and reuse notices, see the Chinese documentation below and [third-party notices](THIRD_PARTY_NOTICES.md). The source code is MIT-licensed; external reports and map data retain their own terms.

---

# EpiAtlas · 传染病事件地图

把地图上的传染病事件与原始新闻证据连接起来。第一版结合 PulseMap 的地图交互思路，以及 GeoSentinel 的公开报告采集、文本判读与来源管理代码。

## 在线使用

[打开英文版 EpiAtlas](https://dragonkillerlaw.github.io/epiatlas) · [打开中文版](https://dragonkillerlaw.github.io/epiatlas/zh.html)

网站已通过 GitHub Pages 发布。英文首页包含简明介绍、大字号和可展开的筛选侧边栏；中文旧版保留。网站与代码仓库已公开，无需登录、下载代码或在本地启动服务器。

当前网站展示最近一次发布的数据快照，最新采集时间显示在页面上。GitHub 每六小时尝试采集，并按计划重新构建发布网站；定时运行可能延迟，以页面显示的时间为准。

## 运行

需要 Node.js 22+、pnpm 11、Python 3.12。无需 Mapbox、Supabase 或模型 API 密钥。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

打开终端打印的 `http://127.0.0.1:4173`。不要直接双击 HTML，浏览器需要通过 HTTP 读取数据文件。

仓库带有真实来源的最近一次报告快照。重新采集：

```sh
python scripts/collect.py
pnpm build
```

Windows 自动使用 PowerShell 的网络栈，Linux 使用 Python 标准库。采集优先 WHO Disease Outbreak News 与 PAHO。可选 `--include-news` 启用 GDELT 媒体发现，默认关闭；媒体报道不会因此成为已核实事件。

## 第一版功能

- 无需外部地图密钥的深色世界地图，本地打包 Natural Earth 国界。
- 地图、新闻、疾病、来源、严重性和日期筛选联动。
- 开始／结束日期、时间轴滑块、最近 7／30／90 天。
- 悬停查看摘要，点击查看同一候选事件的全部报告与原文链接。
- 病例数对数缩放；缺失人数明确显示“未知”。
- 来源状态、采集时间、发布日期、提取依据和筛选结果 JSON 导出。
- 每六小时 GitHub Actions 自动采集；独立 CI 验证并生成前端构建产物。

## 数据含义

一个点是按疾病、地点及相邻报告不超过 45 天组合的**候选事件组**，不是权威登记的暴发事件。相同国家不同城市不会被直接合并。对同一组只使用最近一份有数值的报告，不累加各篇文章中的累计病例数。地点规则匹配可能失败，无法定位的相关报道仍可在列表查看。

日期筛选按报告发布日期（UTC），不是发病日期。未提供日期的报告不会用采集时间冒充；选择“全部”时保留，限定日期时排除。首次采集不是历史完整回溯，之后在同一文件中积累记录。新闻摘要保留原文语言，不自动生成未经核对的翻译。

颜色使用**试验性严重分级**：病例对数分（最多 45）加死亡对数分（最多 55），25／50／75 为边界。未能确认当前事件或缺少人数时为灰色。缺失项不加分，分级可能低估。此分数未经流行病学验证；不计算口径不一致的病死率，不代表个人感染风险。方法可在界面“数据与方法”中查看。

原型用于查阅报告和人工核查。不是完整疫情监测，也不以报道数量推断发生率。

## 自动更新与隐私

仓库公开，工作流不会自动发布网站。CI 的 `epiatlas-preview` 构建产物会遵循仓库权限。GitHub Actions 定时任务可能延迟或受账户额度限制，以 Actions 的实际运行结果为准。

`Collect official reports` 支持手动运行。若所有来源失败，旧报告保留、来源失败状态写入，任务会明确失败。定时提交使用 `GITHUB_TOKEN`，这种提交不会再次触发另一个 push 工作流；需要最新前端构建时手动运行 `Check and build` 或本地重新构建。

## 测试

```sh
pnpm test
python -m unittest discover -s tests -p 'test_*.py'
pnpm build
```

## 代码结构

| 路径 | 用途 |
| --- | --- |
| `web/` | 英文／中文界面、地图、筛选及候选事件聚合 |
| `scripts/collect.py` | WHO / PAHO 适配、采集与持久化 |
| `data/reports.json` | 可追溯的报告快照与历史 |
| `vendor/geosentinel/` | 保留的上游 MIT 代码 |
| `licenses/` | 上游许可全文 |
| `.github/workflows/` | 自动采集与构建检查 |

## 后续方向

- 精确提取同一口径的新增／累计病例、死亡、时间范围，并支持人工订正。
- 接入 ECDC、CDC、国家公共卫生机构的正式数据源。
- 稳定事件 ID、跨来源报告关联与审核记录。
- 更完整的地点词典和多语种摘要。
- 专家审核的严重性模型，与来源可信度独立显示。
- 将 GitHub 定时采集与私有网站的数据同步接通。

## 复用与致谢

详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。复用部分保留原作者版权及许可；原始新闻内容及地理数据遵守各自来源条款。
