# 🌐 HongShi-DoH (Token-aware, Netlify + Vercel)

> 🔒 支持可配置 TOKEN：设置后自动启用 `/<token>` DoH 端点，同时禁用 `/dns-query`。
>  💡 一份代码，兼容 Netlify 与 Vercel — 开箱即用，无需手动修改路径映射。

------

## 🚀 特性概览

- ✅ 支持 **DNS-over-HTTPS 二进制接口**
- ✅ 支持 **JSON 格式 DNS 查询 (`/resolve`)**
- ✅ 内置美观可视化界面 `/ui`
- ✅ 支持自定义上游 DoH（如 Cloudflare / Google）
- ✅ 支持自定义端点 `/<token>`
- 🚫 当设置 Token 后自动禁用 `/dns-query`
- ✅ 可直接部署于：
  - [Netlify Edge Functions](https://docs.netlify.com/edge-functions/overview/)
  - [Vercel Edge Runtime (Next.js 14)](https://vercel.com/docs/functions/edge-functions)

------

## ⚙️ 环境变量

| 变量名     | 用途                            | 默认值               | 示例                           |
| ---------- | ------------------------------- | -------------------- | ------------------------------ |
| `HSD_PATH` | 自定义 DoH 端点路径（推荐使用） | `dns-query`          | `mydns`                        |
| `TOKEN`    | 与 `HSD_PATH` 等价，用作兼容    | —                    | `secure123`                    |
| `DOH`      | 上游 DoH 服务地址（或主机名）   | `cloudflare-dns.com` | `https://dns.google/dns-query` |

> ⚠️ **不要使用 `PATH` 环境变量** —— 它是系统路径，设置会破坏构建。

------

## 🧱 路径行为逻辑

| 路径         | 功能                                                | 是否可禁用                                          |
| ------------ | --------------------------------------------------- | --------------------------------------------------- |
| `/`          | 根路径 DoH（GET `?dns=` / POST 二进制），或 UI 跳转 | 否                                                  |
| `/dns-query` | 默认二进制 DoH 端点                                 | ✅ 当设置 `HSD_PATH/TOKEN` 且值 ≠ `dns-query` 时禁用 |
| `/<token>`   | 自定义 DoH 端点（同 `/dns-query` 功能）             | ✅ 当设置 `HSD_PATH/TOKEN` 时启用                    |
| `/resolve`   | JSON 格式查询                                       | 否                                                  |
| `/ip`        | 返回请求来源 IP                                     | 否                                                  |
| `/ip-info`   | Cloudflare Trace 信息                               | 否                                                  |
| `/ui`        | 可视化界面（纯前端）                                | 否                                                  |

------

## 🌍 Netlify 部署指南

### 1️⃣ 文件结构

```
netlify.toml
netlify/
  └─ edge-functions/
       └─ dns.ts
public/
  ├─ index.html
  ├─ favicon.png
  └─ ui/
       └─ index.html
```

### 2️⃣ 配置说明

**`netlify.toml`**（已内置在仓库中）：

```toml
[build]
  publish = "public"

[[edge_functions]]
path = "/*"
function = "dns"
```

### 3️⃣ 环境变量设置

在 Netlify 控制台 → “Site Settings → Environment Variables”：

```bash
HSD_PATH=mydns
DOH=dns.google
```

部署后：

- `/mydns` 可作为 DoH 端点
- `/dns-query` 将返回 404（自动禁用）
- `/ui` 打开界面
- `/resolve?name=example.com&type=A` 返回 JSON

------

## ⚡️ Vercel 部署指南

### 1️⃣ 项目结构

```
vercel/
 ├─ app/
 │   ├─ route.ts
 │   ├─ resolve/route.ts
 │   ├─ dns-query/route.ts
 │   ├─ [token]/route.ts
 │   └─ ui/page.tsx
 ├─ public/
 │   └─ favicon.png
 ├─ next.config.js
 └─ package.json
```

### 2️⃣ 环境变量

在 Vercel 项目 → “Settings → Environment Variables”：

```
HSD_PATH=mydns
DOH=https://dns.google/dns-query
```

### 3️⃣ 访问路径行为

| 路径         | 说明                              |
| ------------ | --------------------------------- |
| `/dns-query` | 默认端点，若设置 token 则返回 404 |
| `/mydns`     | 有效端点（仅当 token=`mydns`）    |
| `/resolve`   | JSON 查询                         |
| `/ui`        | 图形界面                          |
| `/`          | 根路径可处理 DoH 或重定向 UI      |

------

## 💡 运行本地测试（Vercel）

```bash
cd vercel
npm install
npm run dev
```

访问：

- http://localhost:3000/ui
- http://localhost:3000/resolve?name=example.com&type=A

------

## 🧩 Token 逻辑图

```text
+-------------------+
| 环境变量 HSD_PATH |
+---------+---------+
          |
          v
    如果为空或=dns-query
         /dns-query 正常使用
          |
          +--> /<token> 不存在

    否则（设置为 mydns 等）
         /mydns 可用
         /dns-query 自动返回 404
```

------

## 🧰 示例

### 1️⃣ 默认（无 Token）

```
GET https://example.netlify.app/dns-query?dns=<base64>
GET https://example.netlify.app/resolve?name=example.com&type=A
```

### 2️⃣ 启用 Token = `mydns`

```
GET https://example.netlify.app/mydns?dns=<base64>     ✅ 可用
GET https://example.netlify.app/dns-query?dns=<base64> ❌ 404
```

------

## 🧪 上游兼容性

| 上游       | JSON API                             | 说明               |
| ---------- | ------------------------------------ | ------------------ |
| Cloudflare | `/dns-query?ct=application/dns-json` | 默认模式           |
| Google     | `/resolve`                           | 自动切换           |
| 其他       | `/dns-query`                         | 自动附带 Accept 头 |

------

## 🎨 UI 使用说明

UI 地址：`/ui`

- 下拉可选择：
  - 当前站点 `/dns-query`（或自定义 Token 端点）
  - Cloudflare / Google
  - 自定义 URL
- 输入域名 + 记录类型，点击「解析」
- 可查看 JSON 或简表格式结果

> 如果你使用了 Token 并禁用了 `/dns-query`，请将 UI 的默认路径改为：

```js
return location.origin + '/<你的token>'
```

------

## 📦 目录摘要

```
HongShi-DoH/
├─ README.md
├─ netlify.toml
├─ netlify/
│   └─ edge-functions/dns.ts
├─ public/
│   ├─ index.html
│   └─ ui/index.html
├─ vercel/
│   ├─ app/
│   │   ├─ route.ts
│   │   ├─ dns-query/route.ts
│   │   ├─ [token]/route.ts
│   │   ├─ resolve/route.ts
│   │   └─ ui/page.tsx
│   ├─ package.json
│   ├─ next.config.js
│   └─ public/favicon.png
```

------

## 🔧 调试建议

- 检查浏览器控制台请求日志（Network → /resolve 或 /dns-query）
- 确认请求中 `content-type` 为 `application/dns-message`
- 若上游返回 502：
  - 检查 `DOH` 环境变量
  - 测试 Cloudflare 与 Google 模式是否正常

------

## 🏁 License

MIT © HongShi — 2025
 基于 Edge Runtime & Next.js 14 构建
 专为高速、安全、免配置的 DoH 部署方案设计。
