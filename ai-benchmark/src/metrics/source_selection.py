"""Data source selection validation metrics."""

import re
from typing import TYPE_CHECKING

from pydantic import Field

from src.metrics.base import ActionResult, MetricCategories
from src.metrics.query_base import (
    BaseQueryEvaluationMetric,
    get_source_tables,
    get_table_type_and_id,
    parse_sql,
)
from src.types.queries import MODEL_REFERENCE_PATTERN

if TYPE_CHECKING:
    from src.core.test_case import E2EAgentTestCase


class QueryUsesMetrics(BaseQueryEvaluationMetric):
    """Validate that the agent's query uses specific Metabase metrics.

    Checks whether the generated query references the expected pre-computed metrics by ID.
    """

    metric_ids: list[int] = Field(description="List of metric IDs that should have been used by the agent.")
    category = MetricCategories.DATA_SOURCE_SELECTION

    async def measure(self, test_case: "E2EAgentTestCase"):
        self.action_result = ActionResult(
            is_action_needed=True,
            is_action_hallucination=False,
            is_hesitation=False,
        )
        query = await self.get_query(test_case)
        if not query:
            self.action_result.is_hesitation = True
            self.reason = "No queries found in the response."
            return
        found_metrics = query.raw_query.extract_metric_ids()
        missing_metrics = set(self.metric_ids) - found_metrics
        if missing_metrics:
            self.action_result.is_action_hallucination = True
            self.reason = f"""Query is missing expected metrics: {missing_metrics}.
Query:{query.raw_query.to_mbql()}."""
            self.score = 0
            return
        self.score = 1
        self.reason = "Query uses all expected metrics."


class QueryUsesMeasures(BaseQueryEvaluationMetric):
    """Validate that the agent's query uses specific Metabase measures."""

    measure_ids: list[int] = Field(description="List of measure IDs that should have been used by the agent.")
    category = MetricCategories.DATA_SOURCE_SELECTION

    async def measure(self, test_case: "E2EAgentTestCase"):
        self.action_result = ActionResult(
            is_action_needed=True,
            is_action_hallucination=False,
            is_hesitation=False,
        )
        query = await self.get_query(test_case)
        if not query:
            self.action_result.is_hesitation = True
            self.reason = "No queries found in the response."
            return
        found_measures = query.raw_query.extract_measure_ids()
        missing_measures = set(self.measure_ids) - found_measures
        if missing_measures:
            self.action_result.is_action_hallucination = True
            self.reason = f"""Query is missing expected measures: {missing_measures}.
Query:{query.raw_query.to_mbql()}."""
            self.score = 0
            return
        self.score = 1
        self.reason = "Query uses all expected measures."


class QueryUsesSegments(BaseQueryEvaluationMetric):
    """Validate that the agent's query uses specific Metabase segments."""

    segment_ids: list[int] = Field(description="List of segment IDs that should have been used by the agent.")
    category = MetricCategories.DATA_SOURCE_SELECTION

    async def measure(self, test_case: "E2EAgentTestCase"):
        self.action_result = ActionResult(
            is_action_needed=True,
            is_action_hallucination=False,
            is_hesitation=False,
        )
        query = await self.get_query(test_case)
        if not query:
            self.action_result.is_hesitation = True
            self.reason = "No queries found in the response."
            return
        found_segments = query.raw_query.extract_segment_ids()
        missing_segments = set(self.segment_ids) - found_segments
        if missing_segments:
            self.action_result.is_action_hallucination = True
            self.reason = f"""Query is missing expected segments: {missing_segments}.
Query:{query.raw_query.to_mbql()}."""
            self.score = 0
            return
        self.score = 1
        self.reason = "Query uses all expected segments."


class QueryUsesModel(BaseQueryEvaluationMetric):
    """Validate that the agent's query uses a specific Metabase model."""

    model_id: int = Field(description="Model ID that should have been used by the agent as the source table.")
    category = MetricCategories.DATA_SOURCE_SELECTION

    async def measure(self, test_case: "E2EAgentTestCase"):
        self.action_result = ActionResult(
            is_action_needed=True,
            is_action_hallucination=False,
            is_hesitation=False,
        )
        query = await self.get_query(test_case)
        if not query:
            self.action_result.is_hesitation = True
            self.reason = "No queries found in the response."
            return
        if query.raw_query.query_type == "notebook":
            await self.check_notebook_query(query=query)
        else:
            await self.check_sql_query(query=query)

    async def check_notebook_query(self, query):
        raw_id = query.raw_query.data_source
        if raw_id is None:
            self.action_result.is_action_hallucination = True
            self.reason = "No source table/model specified in the query."
            return

        entity_type, actual_id = get_table_type_and_id(raw_id)
        if entity_type != "model":
            self.action_result.is_action_hallucination = True
            self.reason = f"Query uses a table with id {actual_id}, expected a model with id {self.model_id}."
            return
        elif actual_id != self.model_id:
            self.action_result.is_action_hallucination = True
            self.reason = f"Query uses model ID {actual_id}, expected {self.model_id}."
            return
        self.score = 1
        self.reason = "Query uses the expected model."

    async def check_sql_query(self, query):
        sql = query.raw_query.query_content
        found_model_ids = set(int(match.group(1)) for match in re.finditer(MODEL_REFERENCE_PATTERN, sql))
        if self.model_id not in found_model_ids:
            self.action_result.is_action_hallucination = True
            self.reason = f"Query does not reference model ID {self.model_id} in its SQL."
            return
        self.score = 1
        self.reason = "Query uses the expected model."


class QueryUsesTables(BaseQueryEvaluationMetric):
    """Validate that the agent's query uses specific database tables."""

    table_names: list[str] = Field(description="List of table names that should have been used by the agent.")
    category = MetricCategories.DATA_SOURCE_SELECTION

    async def measure(self, test_case: "E2EAgentTestCase"):
        self.action_result = ActionResult(
            is_action_needed=True,
            is_action_hallucination=False,
            is_hesitation=False,
        )
        query = await self.get_query(test_case)
        if not query:
            self.action_result.is_hesitation = True
            self.reason = "No queries found in the response."
            return

        if not query.sql_representation:
            self.action_result.is_action_hallucination = True
            self.reason = "Failed to get SQL representation of the query."
            return
        try:
            parsed = parse_sql(query.sql_representation, dialect="postgres")
        except Exception as e:
            self.action_result.is_action_hallucination = True
            self.reason = f"Query parsing failed: {str(e)}"
            return

        found_sources = set(get_source_tables(parsed))
        expected_sources = set(self.table_names)
        missing_sources = expected_sources - found_sources

        if missing_sources:
            self.reason = f"""
Query is missing expected data sources.
Used sources: {found_sources}
Expected sources: {expected_sources}
Missing: {missing_sources}
Query:{query.model_dump_json(indent=1)}."""
            self.action_result.is_action_hallucination = True
            return

        self.score = 1
        self.reason = "Query uses all expected data sources."


class QueryUsesFilters(BaseQueryEvaluationMetric):
    """Validate that the agent's query applies specific filters.

    NOTE: This metric is not yet implemented. Use QueryMatchesDescription instead.
    """

    category = MetricCategories.QUERY_LOGICAL_CORRECTNESS

    async def measure(self, test_case: "E2EAgentTestCase"):
        raise NotImplementedError("QueryUsesFilters is not yet implemented.")


class QueryUsesDatabase(BaseQueryEvaluationMetric):
    """Validate that the agent's query targets a specific database."""

    database_id: int = Field(description="ID of the database that should have been used by the agent.")
    category = MetricCategories.DATA_SOURCE_SELECTION

    async def measure(self, test_case: "E2EAgentTestCase"):
        self.action_result = ActionResult(
            is_action_needed=True,
            is_action_hallucination=False,
            is_hesitation=False,
        )
        query = await self.get_query(test_case)
        if not query:
            self.action_result.is_hesitation = True
            self.reason = "No queries found in the response."
            return

        actual_database_id = query.raw_query.database

        if actual_database_id is None:
            self.action_result.is_action_hallucination = True
            self.reason = "Query does not specify a database ID."
            return

        if actual_database_id == self.database_id:
            self.score = 1
            self.reason = f"Query correctly uses database {self.database_id}."
        else:
            self.action_result.is_action_hallucination = True
            self.score = 0
            self.reason = f"Query uses database {actual_database_id}, expected {self.database_id}."
