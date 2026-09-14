"""HTTP + persistence integration (real FastAPI app and a real database).

Under Compose verify, DATABASE_URL points at PostgreSQL; locally it falls back
to an isolated SQLite file (see conftest.py).
"""
from __future__ import annotations

from app.database import SessionLocal
from app.models import Evaluation


def count_rows() -> int:
    with SessionLocal() as db:
        return db.query(Evaluation).count()


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_create_eligible_persists_full_record(client):
    res = client.post(
        "/api/evaluations",
        json={
            "batch_code": "BATCH-01",
            "category": "FAST",
            "thaw_completed_at": "2026-09-14T10:00:00+08:00",
            "planned_use_at": "2026-09-14T10:30:00+08:00",
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["id"] >= 1
    assert data["result"] == "ELIGIBLE"
    assert data["reason"] == "WITHIN_WINDOW"
    assert data["elapsed_seconds"] == 1800
    assert (data["window_lower_seconds"], data["window_upper_seconds"]) == (
        1200,
        2400,
    )
    # Original wall-clock strings survive alongside UTC normalization.
    assert data["thaw_completed_at"] == "2026-09-14T10:00:00+08:00"
    assert data["planned_use_at"] == "2026-09-14T10:30:00+08:00"
    assert data["thaw_completed_at_utc"].startswith("2026-09-14T02:00:00")
    assert data["planned_use_at_utc"].startswith("2026-09-14T02:30:00")


def test_endpoint_boundaries_are_eligible(client):
    for minutes in (20, 40):
        res = client.post(
            "/api/evaluations",
            json={
                "batch_code": f"E{minutes}",
                "category": "FAST",
                "thaw_completed_at": "2026-09-14T10:00:00Z",
                "planned_use_at": f"2026-09-14T10:{minutes:02d}:00Z",
            },
        )
        assert res.status_code == 201, res.text
        assert res.json()["result"] == "ELIGIBLE"


def test_out_of_window_returns_bounds_and_reason(client):
    res = client.post(
        "/api/evaluations",
        json={
            "batch_code": "BATCH-02",
            "category": "STANDARD",
            "thaw_completed_at": "2026-09-14T10:00:00Z",
            "planned_use_at": "2026-09-14T12:00:00Z",  # 7200s > 5400s
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["result"] == "OUT_OF_WINDOW"
    assert data["reason"] == "ABOVE_UPPER_BOUND"
    assert data["elapsed_seconds"] == 7200
    assert (data["window_lower_seconds"], data["window_upper_seconds"]) == (
        2700,
        5400,
    )


def test_illegal_inputs_are_rejected_and_not_persisted(client):
    before = count_rows()
    cases = [
        {  # planned earlier than thaw (same wall clock zone)
            "batch_code": "BAD-1",
            "category": "FAST",
            "thaw_completed_at": "2026-09-14T10:00:00+08:00",
            "planned_use_at": "2026-09-14T09:59:59+08:00",
        },
        {  # bad batch code (lowercase)
            "batch_code": "lowercase",
            "category": "FAST",
            "thaw_completed_at": "2026-09-14T10:00:00Z",
            "planned_use_at": "2026-09-14T10:30:00Z",
        },
        {  # missing UTC offset
            "batch_code": "BAD-3",
            "category": "FAST",
            "thaw_completed_at": "2026-09-14T10:00:00",
            "planned_use_at": "2026-09-14T10:30:00Z",
        },
        {  # fractional seconds
            "batch_code": "BAD-4",
            "category": "FAST",
            "thaw_completed_at": "2026-09-14T10:00:00.000Z",
            "planned_use_at": "2026-09-14T10:30:00Z",
        },
        {  # more than 24h apart
            "batch_code": "BAD-5",
            "category": "FAST",
            "thaw_completed_at": "2026-09-14T10:00:00Z",
            "planned_use_at": "2026-09-15T10:00:01Z",
        },
    ]

    for payload in cases:
        res = client.post("/api/evaluations", json=payload)
        assert res.status_code == 422, (payload, res.text)
        assert isinstance(res.json()["detail"], str)
        assert res.json()["detail"]

    assert count_rows() == before


def test_repeated_batch_inserts_separate_records(client):
    payload = {
        "batch_code": "DUP-1",
        "category": "FAST",
        "thaw_completed_at": "2026-09-14T10:00:00Z",
        "planned_use_at": "2026-09-14T10:30:00Z",
    }
    first = client.post("/api/evaluations", json=payload).json()
    second = client.post(
        "/api/evaluations",
        json={**payload, "planned_use_at": "2026-09-14T10:41:00Z"},
    ).json()

    assert first["id"] != second["id"]
    assert first["result"] == "ELIGIBLE"
    assert second["result"] == "OUT_OF_WINDOW"

    # The original record is untouched and retrievable (shift-change review).
    got = client.get(f"/api/evaluations/{first['id']}").json()
    assert got["planned_use_at"] == "2026-09-14T10:30:00Z"
    assert got["result"] == "ELIGIBLE"
    assert got["elapsed_seconds"] == 1800

    rows = client.get(
        "/api/evaluations", params={"batch_code": "DUP-1"}
    ).json()
    assert len(rows) == 2
    assert {r["id"] for r in rows} == {first["id"], second["id"]}


def test_listing_newest_first_and_detail_404(client):
    for planned, code in [
        ("2026-09-14T10:45:00Z", "L-1"),
        ("2026-09-14T10:50:00Z", "L-2"),
    ]:
        res = client.post(
            "/api/evaluations",
            json={
                "batch_code": code,
                "category": "STANDARD",
                "thaw_completed_at": "2026-09-14T10:00:00Z",
                "planned_use_at": planned,
            },
        )
        assert res.status_code == 201
    rows = client.get("/api/evaluations").json()
    ids = [r["id"] for r in rows]
    assert ids == sorted(ids, reverse=True)

    assert client.get("/api/evaluations/999999").status_code == 404
