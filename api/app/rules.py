"""Pure adjudication rules.

The rule engine never sees rounded minute values: every computation is done
on timezone-aware datetimes converted to UTC and compared in whole seconds.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from enum import Enum

# Batch code: 1-20 characters of uppercase letters, digits or hyphens.
BATCH_CODE_RE = re.compile(r"^[A-Z0-9-]{1,20}$")

# RFC 3339 with a mandatory UTC offset and whole-second precision.
# Date-time part accepts the common profile emitted by <input type="datetime-local">
# plus Z / numeric offsets. Fractional seconds are rejected.
_RFC3339_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}"
    r"(?:[Zz]|[+-]\d{2}:\d{2})$"
)

MAX_PLANNED_DELAY = timedelta(hours=24)


class SampleCategory(str, Enum):
    FAST = "FAST"
    STANDARD = "STANDARD"


class Adjudication(str, Enum):
    ELIGIBLE = "ELIGIBLE"
    OUT_OF_WINDOW = "OUT_OF_WINDOW"


# Windows are closed intervals: both endpoints count as eligible.
WINDOWS_SECONDS: dict[SampleCategory, tuple[int, int]] = {
    SampleCategory.FAST: (20 * 60, 40 * 60),
    SampleCategory.STANDARD: (45 * 60, 90 * 60),
}


class ValidationError(ValueError):
    """Raised when the request itself is invalid (HTTP 422)."""


def parse_rfc3339(value: str, field: str) -> datetime:
    """Parse an RFC 3339 timestamp with a mandatory offset, no fractional seconds."""
    if not isinstance(value, str) or not _RFC3339_RE.match(value):
        raise ValidationError(
            f"{field} must be an RFC3339 timestamp with a UTC offset and whole seconds"
        )
    normalized = value.replace("t", "T").replace("z", "Z")
    try:
        dt = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError(f"{field} is not a valid RFC3339 timestamp") from exc
    if dt.tzinfo is None:
        raise ValidationError(f"{field} must include a UTC offset")
    if dt.microsecond != 0:
        raise ValidationError(f"{field} must be precise to whole seconds")
    return dt


def validate_batch_code(value: str) -> str:
    if not isinstance(value, str) or not BATCH_CODE_RE.match(value):
        raise ValidationError(
            "batch_code must be 1-20 uppercase letters, digits or hyphens"
        )
    return value


def validate_category(value: str) -> SampleCategory:
    try:
        return SampleCategory(value)
    except ValueError as exc:
        raise ValidationError("category must be FAST or STANDARD") from exc


def to_utc(dt: datetime) -> datetime:
    """Convert an aware datetime to UTC with seconds precision (drop tz fold edge noise)."""
    return dt.astimezone(timezone.utc).replace(microsecond=0)


def adjudicate(
    batch_code: str,
    category: str,
    thaw_completed_at: str,
    planned_use_at: str,
) -> dict:
    """Validate inputs, compute the window verdict and return a serializable record.

    Illegal time ranges (planned at/before thaw, or more than 24h after) raise
    ValidationError and must never be persisted.
    """
    code = validate_batch_code(batch_code)
    cat = validate_category(category)
    # Preserve the submitted strings verbatim for the audit trail.
    thaw_text = thaw_completed_at
    planned_text = planned_use_at
    thaw_dt = parse_rfc3339(thaw_completed_at, "thaw_completed_at")
    planned_dt = parse_rfc3339(planned_use_at, "planned_use_at")

    thaw_utc = to_utc(thaw_dt)
    planned_utc = to_utc(planned_dt)

    delta = planned_utc - thaw_utc
    elapsed_seconds = int(delta.total_seconds())

    if elapsed_seconds < 0:
        raise ValidationError(
            "planned_use_at must not be earlier than thaw_completed_at"
        )
    if delta > MAX_PLANNED_DELAY:
        raise ValidationError(
            "planned_use_at must not be later than 24 hours after thaw_completed_at"
        )

    lower, upper = WINDOWS_SECONDS[cat]
    if elapsed_seconds < lower:
        result = Adjudication.OUT_OF_WINDOW
        reason = "BELOW_LOWER_BOUND"
    elif elapsed_seconds > upper:
        result = Adjudication.OUT_OF_WINDOW
        reason = "ABOVE_UPPER_BOUND"
    else:
        result = Adjudication.ELIGIBLE
        reason = "WITHIN_WINDOW"

    return {
        "batch_code": code,
        "category": cat.value,
        "thaw_completed_at": thaw_text,
        "planned_use_at": planned_text,
        # Timezone-aware datetimes bind directly to TIMESTAMP WITH TIME ZONE.
        "thaw_completed_at_utc": thaw_utc,
        "planned_use_at_utc": planned_utc,
        "elapsed_seconds": elapsed_seconds,
        "window_lower_seconds": lower,
        "window_upper_seconds": upper,
        "result": result.value,
        "reason": reason,
    }
