from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import rules
from .database import get_db, init_db
from .models import Evaluation
from .rules import ValidationError
from .schemas import EvaluationRequest, EvaluationResponse


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Thaw Window Adjudication", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(ValidationError)
def _validation_error_handler(_request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": str(exc)},
    )


@app.exception_handler(RequestValidationError)
def _request_validation_handler(_request, exc: RequestValidationError) -> JSONResponse:
    # Flatten pydantic errors to the same single-detail shape as rule errors.
    first = exc.errors()[0] if exc.errors() else {"msg": "invalid request"}
    loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    msg = first.get("msg", "invalid request")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": f"{loc}: {msg}".strip(": ")},
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/evaluations", response_model=EvaluationResponse, status_code=201)
def create_evaluation(payload: EvaluationRequest, db: Session = Depends(get_db)) -> Evaluation:
    """Adjudicate one submission and append it as an independent record.

    Invalid batch codes, categories or illegal time ranges are rejected with
    422 and nothing is written.
    """
    outcome = rules.adjudicate(
        payload.batch_code,
        payload.category,
        payload.thaw_completed_at,
        payload.planned_use_at,
    )
    record = Evaluation(
        created_at=datetime.now(timezone.utc),
        **outcome,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/api/evaluations", response_model=list[EvaluationResponse])
def list_evaluations(
    batch_code: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[Evaluation]:
    stmt = select(Evaluation).order_by(Evaluation.id.desc())
    if batch_code is not None:
        stmt = stmt.where(Evaluation.batch_code == batch_code)
    return list(db.scalars(stmt))


@app.get("/api/evaluations/{evaluation_id}", response_model=EvaluationResponse)
def get_evaluation(evaluation_id: int, db: Session = Depends(get_db)) -> Evaluation:
    record = db.get(Evaluation, evaluation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="evaluation not found")
    return record
