from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Evaluation(Base):
    """One immutable adjudication record.

    Append-only: a repeated batch code inserts a new row, never overwriting a
    prior conclusion.
    """

    __tablename__ = "evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(8), nullable=False)

    # Original strings exactly as submitted, preserving the wall-clock offset.
    thaw_completed_at: Mapped[str] = mapped_column(String(40), nullable=False)
    planned_use_at: Mapped[str] = mapped_column(String(40), nullable=False)

    # UTC-normalized timestamps so a shift-change review is unambiguous.
    thaw_completed_at_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    planned_use_at_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    elapsed_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    window_lower_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    window_upper_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
