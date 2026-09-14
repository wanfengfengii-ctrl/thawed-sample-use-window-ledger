import os
import tempfile

# Default to an isolated SQLite file when no DATABASE_URL is given
# (e.g. local runs outside Docker). The Compose verify service points this at
# the dedicated "thaw_verify" PostgreSQL database which pytest may reset freely;
# it must never point at the "thaw" database the API is serving live.
if "DATABASE_URL" not in os.environ:
    _tmp = tempfile.mkdtemp(prefix="thaw-test-")
    os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"

import pytest  # noqa: E402
from sqlalchemy.engine.url import make_url  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Evaluation  # noqa: E402

_db_name = make_url(settings.database_url).database or ""
ISOLATED_DB = (
    settings.database_url.startswith("sqlite") or _db_name.rstrip("/").endswith("verify")
)


@pytest.fixture(scope="session", autouse=True)
def _schema():
    if not ISOLATED_DB:
        raise RuntimeError(
            "Refusing to run destructive tests against non-dedicated database "
            f"{_db_name!r}; point DATABASE_URL at a *_verify database"
        )
    Base.metadata.create_all(bind=engine)
    yield
    # Safe here: this is either a throwaway SQLite file or the isolated
    # thaw_verify PostgreSQL database - never the API's live "thaw" database.
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clean_tables():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c


def count_rows() -> int:
    with SessionLocal() as db:
        return db.query(Evaluation).count()
