# 冻存样本复苏窗口判定簿

技术员在换班后需要对“复苏后多久使用样本”作出**可复查、时区无关、不被口算分钟数干扰**的判定。
本系统把每次评估作为一条独立、不可覆盖的记录保存：

- **React** 表单提交批次代码、样本类别、复苏完成时间、计划使用时间（墙钟 + 显式 UTC 偏移）；
- **FastAPI** 先把时间换算为 UTC，再以**整秒**计算时间差并裁决；
- **PostgreSQL** 只持久化合法提交，原始墙钟字符串与 UTC 时刻同时保存。

## 裁决规则

| 项目 | 规则 |
| --- | --- |
| 批次代码 | 1–20 位大写字母 `A-Z`、数字 `0-9` 或连字符 `-` |
| 类别 | 仅 `FAST` / `STANDARD` |
| FAST 窗口 | 复苏后 **1200–2400 秒（20–40 分钟）**，两端点均合格 |
| STANDARD 窗口 | 复苏后 **2700–5400 秒（45–90 分钟）**，两端点均合格 |
| 时间格式 | 带 UTC 偏移、精确到整秒的 RFC3339（如 `2026-09-14T10:00:00+08:00` / `Z`） |
| 非法时间 | 计划时间早于复苏时间，或晚于复苏后 24 小时（整点 24h 合法）→ 422，**不落库** |
| 结论 | `ELIGIBLE` 或 `OUT_OF_WINDOW`；附带实际秒数、窗口上下限（秒）与原因：`WITHIN_WINDOW` / `BELOW_LOWER_BOUND` / `ABOVE_UPPER_BOUND` |

分钟数仅在页面上按**四舍五入保留两位**展示（如 1199 秒 → 19.98 分钟），
不提交、不参与任何裁决——差 1 秒落在端点外就是 `OUT_OF_WINDOW`。

## 目录结构

```
api/        FastAPI：app/rules.py 纯规则引擎，app/main.py HTTP，SQLAlchemy 模型
web/        React + Vite：表单 / 详情 / 历史；Vitest 与 Playwright 测试
verify/     一次性验收服务（pytest + Vitest + Playwright）镜像
docker-compose.yml
```

## 本地启动

```bash
cp .env.example .env        # 可选：修改 WEB_PORT / API_PORT
docker compose up --build
# 页面:  http://localhost:${WEB_PORT:-8080}
#  API:  http://localhost:${API_PORT:-8000}/health
```

宿主端口可用环境变量覆盖：

```bash
WEB_PORT=9090 API_PORT=9000 docker compose up
```

## 一次性验收（verify）

`verify` 是 one-shot 服务，对真实 Compose 栈跑全部测试：

- **pytest**：规则引擎单测 + FastAPI 联调（真实 PostgreSQL；验收库为专用库，逐例重建表）；
- **Vitest**：格式化/拼装与 React 组件交互；
- **Playwright**：真实 Chromium 经 `web(nginx) → api(FastAPI) → db(PostgreSQL)` 联调。

```bash
docker compose build verify
docker compose run --rm verify
```

退出码 0 即验收通过；HTML 报告写入 `pw-report` 卷（`web/playwright-report`）。

## 离线（无 Docker）开发

- 后端测试在未设置 `DATABASE_URL` 时回退到临时 SQLite；PostgreSQL 为部署/验收数据库：

  ```bash
  cd api && pip install -r requirements-dev.txt
  DATABASE_URL=postgresql+psycopg://thaw:thawpass@localhost:5432/thaw pytest
  ```

- 前端：

  ```bash
  cd web && npm install && npm test          # Vitest
  npm run build && npx playwright test       # 需先启动 web 与 api
  ```

## API 摘要

- `POST /api/evaluations` → 201 落库返回完整记录；非法输入 422 `{"detail": "..."}`
- `GET /api/evaluations?batch_code=...` → 新到旧的记录列表
- `GET /api/evaluations/{id}` → 单条记录（换班刷新复查用）

重复批次**插入新行**，旧结论原样保留；刷新详情会重新 GET，显示原始墙钟时间、UTC 差值（秒）与当时结论。
