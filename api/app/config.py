from __future__ import annotations

import os


class Settings:
    """Runtime settings sourced from environment variables."""

    def __init__(self) -> None:
        # Defaults point at the Compose service name ``db``; tests may point
        # this at a separate database (or a local SQLite file).
        self.database_url: str = os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://thaw:thawpass@db:5432/thaw",
        )


settings = Settings()
