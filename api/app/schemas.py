from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_serializer


class EvaluationRequest(BaseModel):
    batch_code: str = Field(..., description="1-20 uppercase letters, digits or hyphens")
    category: str = Field(..., description="FAST or STANDARD")
    thaw_completed_at: str = Field(..., description="RFC3339 with UTC offset, whole seconds")
    planned_use_at: str = Field(..., description="RFC3339 with UTC offset, whole seconds")


class EvaluationResponse(BaseModel):
    id: int
    batch_code: str
    category: str
    thaw_completed_at: str
    planned_use_at: str
    thaw_completed_at_utc: datetime
    planned_use_at_utc: datetime
    elapsed_seconds: int
    window_lower_seconds: int
    window_upper_seconds: int
    result: str
    reason: str
    created_at: datetime

    @field_serializer("thaw_completed_at_utc", "planned_use_at_utc", "created_at")
    def _serialize_utc(self, value: datetime) -> datetime:
        # Some drivers (e.g. SQLite used in local tests) return naive values;
        # they are UTC by construction in the engine.
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class ErrorResponse(BaseModel):
    detail: str
