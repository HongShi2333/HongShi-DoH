# 🌐 HongShi-DoH-Pro

一个支持 **DNS-over-HTTPS（DoH）**、**本地 IP 定位服务** 与 **自定义路径 / UI 界面** 的完整项目，  
可一键部署在 **Netlify** 或 **Vercel**，并附带 Python 高精度 IP 查询接口（FastAPI）。

---

## 🚀 功能概览

| 模块 | 描述 |
|------|------|
| `/dns-query` | 标准 DoH 接口，支持 GET / POST / application/dns-message |
| `/resolve` | JSON 模式 DNS 查询（聚合 A / AAAA / NS） |
| `/ui/` | 可视化前端界面，支持输入域名、选择 DoH、显示 JSON 与表格 |
| `/ip` | 返回请求方 IP、归属地、ASN、运营商、经纬度等信息 |
| `/host` | 显示部署平台主机名与实例信息 |
| `/meta` | 返回当前 DOH_PATH、DNS Query 启用状态 |
| `/` | 首页介绍，自动检测 /meta |

---

## 🏗️ 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DOH_PATH` | `dns-query` | 自定义 DoH 路径。设定后将禁用默认 `/dns-query` |
| `DOH` | `cloudflare-dns.com` | 上游 DoH 服务（可为 dns.google 等） |
| `IP_ENRICH` | `auto` | `local` / `ipwhois` / `ipapi` / `ipinfo` 自动优先使用本地数据库 |
| `IPINFO_TOKEN` | *(可选)* | 当 `IP_ENRICH=ipinfo` 时使用 |
| `TOKEN` / `HSD_PATH` | *(可选)* | 替代路径参数（历史兼容） |

---

## 💡 Netlify 部署

1. Fork 或上传仓库。
2. 根目录包含 `netlify.toml` 与 `netlify/edge-functions/`。
3. 部署时自动识别 Edge Function。
4. 可选上传 `.mmdb` 数据库至 `/python/` 目录（用于 Python 版 IP 查询）。

---

## 💡 Vercel 部署

1. 将 `/vercel` 目录作为根目录上传。
2. 可设置 `DOH_PATH` 环境变量自定义路径。
3. 自动路由 `/resolve`、`/dns-query`、`/[token]`、`/ip`、`/host`。

## ✨ UI 界面预览

UI 页面位于 `/ui/`

- 支持选择 DoH 服务器（本地 / Cloudflare / Google / 自定义）
- 实时展示解析结果
- 美观的玻璃拟态风格、暗亮自适应、可复制 JSON / 端点
- 可检测 `/resolve` 连通性

------

## 🧩 目录结构

```
HongShi-DoH-Pro/
├── netlify/            # Netlify Edge Function 逻辑
├── vercel/             # Vercel Edge Function 逻辑
├── public/ui/          # Web UI 界面
├── python/             # Python IP 查询服务
└── README.md
```

------

## ⚙️ 示例输出 `/ip`

```json
{
  "ip": "1.1.1.1",
  "addr": "1.1.1.0/24",
  "as": {
    "number": 13335,
    "name": "Cloudflare",
    "info": "Cloudflare"
  },
  "country": {
    "code": "AU",
    "name": "澳大利亚"
  },
  "registered_country": {
    "code": "US",
    "name": "美国"
  },
  "regions": ["新南威尔士州", "悉尼"],
  "location": {
    "latitude": -33.86,
    "longitude": 151.21
  },
  "type": "IDC",
  "source": {
    "provider": "mmdb",
    "enriched": true
  }
}
```