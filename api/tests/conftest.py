import os
import tempfile

# Default to an isolated SQLite file when no PostgreSQL DATABASE_URL is given
# (e.g. local runs outside Docker). The Compose verify service points this at
# the real PostgreSQL database.
if "DATABASE_URL" not in os.environ:
    _tmp = tempfile.mkdtemp(prefix="thaw-test-")
    os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"

import pytest  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Evaluation  # noqa: E402
from app.database import SessionLocal  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.create_all(bind=engine)
    yield
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
