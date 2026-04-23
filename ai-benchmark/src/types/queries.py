"""Query types for Metabase MBQL queries."""

import json
import re
import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MODEL_ID_PREFIX = "card__"

# Regex pattern for matching Metabase model references in SQL
# Matches: {{#123}} or {{#123-model-name}}
# Capture groups: (1) model_id, (2) optional model-name suffix
MODEL_REFERENCE_PATTERN = r"\{\{#(\d+)(?:-([^}]*))?\}\}"


def extract_model_references_and_generate_template_tags(sql: str) -> dict:
    """Extract model references from SQL and generate template-tags metadata.

    Metabase requires template-tags metadata to expand model references like {{#125}}
    before executing queries. This function detects model references in SQL and
    generates the required template-tags structure.

    Args:
        sql: SQL string potentially containing model references like {{#125-model-name}}

    Returns:
        Dictionary of template-tags in Metabase format. Empty dict if no model references found.
    """
    matches = re.finditer(MODEL_REFERENCE_PATTERN, sql)

    template_tags = {}
    for match in matches:
        model_id = int(match.group(1))
        model_name_suffix = match.group(2) or ""

        if model_name_suffix:
            tag_name = f"#{model_id}-{model_name_suffix}"
        else:
            tag_name = f"#{model_id}"

        if model_name_suffix:
            display_name_suffix = " ".join(word.capitalize() for word in model_name_suffix.split("-"))
            display_name = f"#{model_id} {display_name_suffix}"
        else:
            display_name = f"#{model_id}"

        template_tags[tag_name] = {
            "type": "card",
            "name": tag_name,
            "display-name": display_name,
            "id": str(uuid.uuid4()),
            "card-id": model_id,
        }

    return template_tags


class MBQL4Query(BaseModel):
    database: int | None = None
    type: Literal["native", "query"]
    query: dict[str, Any] | None = None
    native: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_query_fields(self) -> "MBQL4Query":
        """Ensure that the appropriate query field is set based on the type."""
        if self.type == "native" and self.native is None:
            raise ValueError("native field must be set when type is 'native'")
        if self.type == "query" and self.query is None:
            raise ValueError("query field must be set when type is 'query'")
        return self

    @property
    def query_type(self) -> Literal["sql", "notebook", "unknown"]:
        """Get the type of the query based on its content."""
        if self.type == "native":
            return "sql"
        elif self.type == "query":
            return "notebook"
        return "unknown"

    @property
    def query_content(self) -> str:
        """Get the query content as a string."""
        if self.query_type == "sql":
            return self.native.get("query", "") if self.native else ""
        elif self.query_type == "notebook":
            return json.dumps(self.query or {})
        return ""

    @property
    def data_source(self) -> str | None:
        """Get the data source (model, table, etc.) of the query, if available."""
        if self.query and self.query_type == "notebook":
            return self.query.get("source-table")
        return None

    @property
    def has_query_source(self) -> bool:
        """Check if the query has a data source defined."""
        if self.query is None:
            return False
        return bool(self.query.get("source-table") or self.query.get("source-query"))

    def set_template_tags(self, template_tags: dict) -> None:
        """Set template-tags for SQL queries, merging with existing tags."""
        if self.type != "native":
            return

        if self.native is None:
            self.native = {}

        existing_tags = self.native.get("template-tags", {})
        self.native["template-tags"] = {**existing_tags, **template_tags}

    def extract_and_set_model_template_tags(self) -> None:
        """Detect model references in SQL and automatically populate template-tags."""
        if self.query_type != "sql":
            return

        sql = self.query_content
        if "{{#" not in sql:
            return

        template_tags = extract_model_references_and_generate_template_tags(sql)
        if template_tags:
            self.set_template_tags(template_tags)

    def to_mbql(self, auto_populate_template_tags: bool = False) -> dict[str, Any]:
        """Return the MBQL4 query as a dictionary for the Metabase API."""
        if auto_populate_template_tags:
            self.extract_and_set_model_template_tags()

        return self.model_dump(exclude_none=True)

    def _extract_clause_ids(self, clause_name: str) -> set[int]:
        """Extract all IDs for a given clause type from an MBQL4 query."""
        ids = set()

        def walk_structure(obj):
            if isinstance(obj, dict):
                for value in obj.values():
                    walk_structure(value)
            elif isinstance(obj, list):
                if len(obj) == 2 and obj[0] == clause_name and isinstance(obj[1], int):
                    ids.add(obj[1])
                else:
                    for item in obj:
                        walk_structure(item)

        walk_structure(self.to_mbql())
        return ids

    def extract_metric_ids(self) -> set[int]:
        """Extract all metric IDs from an MBQL4 query."""
        return self._extract_clause_ids("metric")

    def extract_measure_ids(self) -> set[int]:
        """Extract all measure IDs from an MBQL4 query."""
        return self._extract_clause_ids("measure")

    def extract_segment_ids(self) -> set[int]:
        """Extract all segment IDs from an MBQL4 query."""
        return self._extract_clause_ids("segment")


class MBQL5Query(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)
    lib_type: str = Field(default="mbql/query", alias="lib/type")
    stages: list[dict[str, Any]] = Field(default_factory=list)
    database: int | None = None

    @property
    def query_type(self) -> Literal["sql", "notebook", "unknown"]:
        """Get the type of the query based on its content."""
        if self.stages:
            if len(self.stages) == 1 and self.stages[0].get("lib/type") == "mbql.stage/native":
                return "sql"
            elif self.stages and self.stages[-1].get("lib/type") == "mbql.stage/mbql":
                return "notebook"
        return "unknown"

    @property
    def query_content(self) -> str:
        """Get the query content as a string."""
        if self.query_type == "sql":
            first_stage = self.stages[0]
            return first_stage.get("native", "")
        elif self.query_type == "notebook":
            return json.dumps(self.model_dump())
        return ""

    @query_content.setter
    def query_content(self, value: str) -> None:
        """Set the query content for SQL queries only."""
        if self.query_type == "sql" and self.stages and "native" in self.stages[0]:
            self.stages[0]["native"] = value
        else:
            raise ValueError("Cannot set query_content on non-SQL queries.")

    @property
    def data_source(self) -> str | None:
        """Get the data source (model, table, etc.) of the query, if available."""
        if self.query_type == "notebook":
            if self.stages:
                if self.stages[0].get("lib/type") == "mbql.stage/mbql":
                    if card_id := self.stages[0].get("source-card"):
                        return f"{MODEL_ID_PREFIX}{card_id}"
                    return self.stages[0].get("source-table")
        return None

    @property
    def has_query_source(self) -> bool:
        """Check if the query has a data source defined."""
        if self.query_type == "notebook":
            if self.stages:
                if self.stages[0].get("lib/type") == "mbql.stage/mbql":
                    return (
                        self.stages[0].get("source-card") is not None or self.stages[0].get("source-table") is not None
                    )
        return False

    def set_template_tags(self, template_tags: dict) -> None:
        """Set template-tags for SQL queries, merging with existing tags."""
        if self.query_type != "sql":
            return

        if not self.stages or len(self.stages) == 0:
            return

        existing_tags = self.stages[0].get("template-tags", {})
        self.stages[0]["template-tags"] = {**existing_tags, **template_tags}

    def extract_and_set_model_template_tags(self) -> None:
        """Detect model references in SQL and automatically populate template-tags."""
        if self.query_type != "sql":
            return

        sql = self.query_content
        if "{{#" not in sql:
            return

        template_tags = extract_model_references_and_generate_template_tags(sql)
        if template_tags:
            self.set_template_tags(template_tags)

    def to_mbql(self, auto_populate_template_tags: bool = False) -> dict[str, Any]:
        """Return the MBQL5 query as a dictionary for the Metabase API."""
        if auto_populate_template_tags:
            self.extract_and_set_model_template_tags()

        return self.model_dump(exclude_none=True)

    def _extract_clause_ids(self, clause_name: str) -> set[int]:
        """Extract all IDs for a given clause type from an MBQL5 query."""
        ids = set()

        def walk_structure(obj):
            if isinstance(obj, dict):
                for value in obj.values():
                    walk_structure(value)
            elif isinstance(obj, list):
                if len(obj) == 3 and obj[0] == clause_name and isinstance(obj[1], dict) and isinstance(obj[2], int):
                    ids.add(obj[2])
                else:
                    for item in obj:
                        walk_structure(item)

        walk_structure(self.to_mbql())
        return ids

    def extract_metric_ids(self) -> set[int]:
        """Extract all metric IDs from an MBQL5 query."""
        return self._extract_clause_ids("metric")

    def extract_measure_ids(self) -> set[int]:
        """Extract all measure IDs from an MBQL5 query."""
        return self._extract_clause_ids("measure")

    def extract_segment_ids(self) -> set[int]:
        """Extract all segment IDs from an MBQL5 query."""
        return self._extract_clause_ids("segment")


DatasetQuery = MBQL4Query | MBQL5Query
