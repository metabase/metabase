"""Metabase integration module."""

from src.metabase.capabilities import MetabaseCapabilities
from src.metabase.client import BenchmarkMetabaseClient

__all__ = [
    "BenchmarkMetabaseClient",
    "MetabaseCapabilities",
]
