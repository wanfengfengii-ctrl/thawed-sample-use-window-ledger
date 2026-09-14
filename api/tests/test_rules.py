"""Pure rule engine tests: all judgments use UTC seconds, never minutes."""
from __future__ import annotations

import pytest

from app import rules
from app.rules import ValidationError


def judge(thaw: str, planned: str, category: str = "FAST", code: str = "A-01") -> dict:
    return rules.adjudicate(code, category, thaw, planned)


# ---------- batch code ----------

@pytest.mark.parametrize("code", ["A", "A-01", "BATCH-99-X", "0", "A" * 20, "-"])
def test_valid_batch_codes(code):
    out = judge(
        "2026-09-14T10:00:00+08:00", "2026-09-14T10:30:00+08:00", code=code
    )
    assert out["batch_code"] == code


@pytest.mark.parametrize(
    "code", ["", "a-01", "A_01", "A 01", "A.1", "A 21", "A" * 21, " A-01", "A-01 "]
)
def test_invalid_batch_codes(code):
    with pytest.raises(ValidationError):
        judge(
            "2026-09-14T10:00:00+08:00", "2026-09-14T10:30:00+08:00", code=code
        )


def test_category_must_be_fast_or_standard():
    with pytest.raises(ValidationError):
        judge(
            "2026-09-14T10:00:00Z",
            "2026-09-14T10:30:00Z",
            category="slow",
        )


# ---------- RFC3339 parsing ----------

@pytest.mark.parametrize(
    "value,field",
    [
        ("2026-09-14 10:00:00+08:00", "thaw_completed_at"),
        ("2026-09-14T10:00:00", "thaw_completed_at"),
        ("2026-09-14T10:00+08:00", "thaw_completed_at"),
        ("2026-09-14T10:00:00.5+08:00", "thaw_completed_at"),
        ("not-a-time", "thaw_completed_at"),
        ("2026-02-30T10:00:00+08:00", "thaw_completed_at"),
    ],
)
def test_bad_timestamps(value, field):
    with pytest.raises(ValidationError):
        rules.parse_rfc3339(value, field)


def test_z_and_lowercase_accepted():
    out = judge("2026-09-14T10:00:00Z", "2026-09-14T10:20:00z")
    assert out["elapsed_seconds"] == 1200
    out2 = judge("2026-09-14t10:00:00+00:00", "2026-09-14t10:40:00+00:00")
    assert out2["elapsed_seconds"] == 2400


# ---------- UTC conversion beats wall-clock arithmetic ----------

def test_offset_conversion_to_utc():
    out = judge("2026-09-14T10:00:00+08:00", "2026-09-14T10:30:00+08:00")
    from datetime import datetime, timezone

    assert out["thaw_completed_at_utc"] == datetime(2026, 9, 14, 2, 0, tzinfo=timezone.utc)
    assert out["planned_use_at_utc"] == datetime(2026, 9, 14, 2, 30, tzinfo=timezone.utc)
    assert out["elapsed_seconds"] == 1800


def test_mixed_offsets_same_instant_is_zero_seconds():
    # 10:00 in +08:00 and 03:00 in +01:00 are the same UTC instant; a naive
    # wall-clock subtraction would wrongly yield -7 hours.
    out = judge("2026-09-14T10:00:00+08:00", "2026-09-14T03:00:00+01:00")
    assert out["elapsed_seconds"] == 0
    assert out["result"] == "OUT_OF_WINDOW"
    assert out["reason"] == "BELOW_LOWER_BOUND"


def test_wall_clock_earlier_but_utc_later_is_legal():
    # 05:00Z is later than 10:00+08:00 (02:00Z) although 05 < 10 on the wall.
    out = judge(
        "2026-09-14T10:00:00+08:00", "2026-09-14T05:00:00Z", category="STANDARD"
    )
    assert out["elapsed_seconds"] == 10800


def test_quarter_hour_offset_nepal_converts_correctly():
    # Real zones live on quarter hours: 13:00 at +05:45 (Nepal) is 07:15Z,
    # and 08:00Z written in a different offset notation is still 2700s later.
    from datetime import datetime, timezone

    out = judge(
        "2026-09-14T13:00:00+05:45",
        "2026-09-14T08:00:00Z",
        category="STANDARD",
    )
    assert out["thaw_completed_at_utc"] == datetime(
        2026, 9, 14, 7, 15, tzinfo=timezone.utc
    )
    assert out["planned_use_at_utc"] == datetime(
        2026, 9, 14, 8, 0, tzinfo=timezone.utc
    )
    assert out["elapsed_seconds"] == 2700
    assert out["result"] == "ELIGIBLE"


# ---------- windows, closed endpoints ----------

@pytest.mark.parametrize(
    "seconds,expected,reason",
    [
        (1199, "OUT_OF_WINDOW", "BELOW_LOWER_BOUND"),
        (1200, "ELIGIBLE", "WITHIN_WINDOW"),       # 20 min, lower endpoint
        (2400, "ELIGIBLE", "WITHIN_WINDOW"),       # 40 min, upper endpoint
        (2401, "OUT_OF_WINDOW", "ABOVE_UPPER_BOUND"),
    ],
)
def test_fast_window_endpoints_included(seconds, expected, reason):
    base = "2026-09-14T10:00:00Z"
    out = judge(base, _offset(base, seconds))
    assert out["result"] == expected
    assert out["reason"] == reason
    assert out["window_lower_seconds"] == 1200
    assert out["window_upper_seconds"] == 2400


@pytest.mark.parametrize(
    "seconds,expected,reason",
    [
        (2699, "OUT_OF_WINDOW", "BELOW_LOWER_BOUND"),
        (2700, "ELIGIBLE", "WITHIN_WINDOW"),       # 45 min, lower endpoint
        (5400, "ELIGIBLE", "WITHIN_WINDOW"),       # 90 min, upper endpoint
        (5401, "OUT_OF_WINDOW", "ABOVE_UPPER_BOUND"),
    ],
)
def test_standard_window_endpoints_included(seconds, expected, reason):
    base = "2026-09-14T10:00:00Z"
    out = judge(base, _offset(base, seconds), category="STANDARD")
    assert out["result"] == expected
    assert out["reason"] == reason
    assert out["window_lower_seconds"] == 2700
    assert out["window_upper_seconds"] == 5400


def test_window_bounds_never_use_minutes():
    # One second short of the rounded-minute boundary must be out of window.
    out = judge(
        "2026-09-14T10:00:00Z",
        _offset("2026-09-14T10:00:00Z", 2699),
        category="STANDARD",
    )
    assert out["elapsed_seconds"] == 2699
    assert out["result"] == "OUT_OF_WINDOW"


# ---------- illegal ranges ----------

def test_planned_before_thaw_is_illegal():
    with pytest.raises(ValidationError, match="not be earlier"):
        judge("2026-09-14T10:30:00+08:00", "2026-09-14T10:00:00+08:00")


def test_equal_times_are_legal_input_but_out_of_window():
    out = judge("2026-09-14T10:00:00+08:00", "2026-09-14T10:00:00+08:00")
    assert out["elapsed_seconds"] == 0
    assert out["result"] == "OUT_OF_WINDOW"


def test_planned_more_than_24h_after_thaw_is_illegal():
    with pytest.raises(ValidationError, match="24 hours"):
        judge(
            "2026-09-14T10:00:00Z",
            _offset("2026-09-14T10:00:00Z", 24 * 3600 + 1),
        )


def test_exactly_24h_is_legal_input():
    out = judge(
        "2026-09-14T10:00:00Z",
        _offset("2026-09-14T10:00:00Z", 24 * 3600),
    )
    assert out["elapsed_seconds"] == 86400
    assert out["result"] == "OUT_OF_WINDOW"
    assert out["reason"] == "ABOVE_UPPER_BOUND"


def _offset(base_iso: str, seconds: int) -> str:
    from datetime import datetime, timedelta

    dt = datetime.fromisoformat(base_iso.replace("Z", "+00:00"))
    return (dt + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")
