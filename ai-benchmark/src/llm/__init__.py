"""LLM client functionality."""

from src.llm.models import AvailableModels

# Lazy import to avoid circular dependency with src/types/usage.py
# Import LLM directly from src.llm.client when needed
__all__ = ["AvailableModels"]


def __getattr__(name):
    """Lazy import for LLM to break circular import."""
    if name == "LLM":
        from src.llm.client import LLM

        return LLM
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
