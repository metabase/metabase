"""Agent types for benchmark framework."""

from enum import Enum
from typing import Any

from pydantic import BaseModel


class ConversationState(BaseModel):
    """Minimal ConversationState for benchmark framework.

    This is a simplified version that captures the essential state data
    needed for benchmark validation. The full ConversationState in ai-service
    has additional fields for agent orchestration.
    """

    queries: dict[str, Any] | None = None

    def model_dump(self, **kwargs) -> dict[str, Any]:
        """Override to handle None queries gracefully."""
        data = super().model_dump(**kwargs)
        if data.get("queries") is None:
            data["queries"] = {}
        return data


class AgentProfileIDs(str, Enum):
    """Enum for agent profile IDs."""

    METABOT_EMBEDDING = "embedding"
    METABOT_INTERNAL = "internal"
    METABOT_NEXT = "metabot_next"
    METABOT_SQL = "sql"
    METABOT_NLQ = "nlq"
