"""Database connection and session management."""

import os
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session as SessionType
from sqlalchemy.orm import declarative_base, sessionmaker

# Database connection settings
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "metabase")
DB_PASSWORD = os.getenv("DB_PASSWORD", "metabase")
DB_NAME = os.getenv("DB_NAME", "analytics")

# Construct database URL
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Create engine
engine = create_engine(DATABASE_URL, echo=False)

# Create session factory
Session = sessionmaker(bind=engine)

# Create declarative base
Base = declarative_base()


@contextmanager
def get_session() -> SessionType:
    """Get a database session with automatic cleanup.

    Usage:
        with get_session() as session:
            # Do work with session
            session.commit()
    """
    session = Session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
