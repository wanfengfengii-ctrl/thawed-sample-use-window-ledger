#!/usr/bin/env bash
# One-shot acceptance: pytest (rules + FastAPI against a dedicated PostgreSQL
# database), Vitest (UI logic) and Playwright (real browser through
# nginx -> FastAPI -> PostgreSQL).
set -euo pipefail

# Provision the dedicated pytest database (idempotent). pytest owns this
# database and freely drops/recreates its tables; it must never touch the
# "thaw" database that the API keeps serving during the Playwright phase.
python3 - <<'PY'
import os

import psycopg

admin_url = os.environ.get(
    "PG_ADMIN_URL", "postgresql://thaw:thawpass@db:5432/postgres"
)
db_name = os.environ.get("TEST_DATABASE_NAME", "thaw_verify")

with psycopg.connect(admin_url, autocommit=True) as conn:
    exists = conn.execute(
        "SELECT 1 FROM pg_database WHERE datname = %s", (db_name,)
    ).fetchone()
    if exists is None:
        # The name comes from our own Compose environment, not user input.
        conn.execute(f'CREATE DATABASE "{db_name}"')
        print(f"created test database {db_name}")
    else:
        print(f"test database {db_name} already exists")
PY

echo "==> pytest (isolated ${TEST_DATABASE_NAME:-thaw_verify} database)"
cd /workspace/api
python3 -m pytest -q

echo "==> Vitest"
cd /workspace/web
npx vitest run

echo "==> Playwright"
npx playwright test
