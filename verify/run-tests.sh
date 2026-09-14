#!/usr/bin/env bash
# One-shot acceptance: pytest (rules + real API/PostgreSQL), Vitest (UI logic)
# and Playwright (real browser through nginx -> API -> PostgreSQL).
set -euo pipefail

echo "==> pytest"
cd /workspace/api
python3 -m pytest -q

echo "==> Vitest"
cd /workspace/web
npx vitest run

echo "==> Playwright"
npx playwright test
