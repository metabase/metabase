"""Syntax and execution validation metrics for queries."""

from typing import TYPE_CHECKING

from src.metrics.base import ActionResult, MetricCategories
from src.metrics.query_base import BaseQueryEvaluationMetric, check_if_query_runs, parse_sql

if TYPE_CHECKING:
    from src.core.test_case import E2EAgentTestCase


class QuerySyntaxValid(BaseQueryEvaluationMetric):
    """Validate that the agent's query has valid SQL syntax.

    Attempts to parse the SQL representation of the query using sqlglot.

    See also:
        - QueryRunsSuccessfully: For validating query execution (stricter check)
    """

    category = MetricCategories.QUERY_VALIDITY

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

        if query.sql_representation is None:
            self.action_result.is_action_hallucination = True
            self.reason = "Failed to get SQL representation of the query."
            return

        try:
            parsed = parse_sql(query.sql_representation, dialect="postgres")
            if parsed is None:
                self.action_result.is_action_hallucination = True
                self.reason = "Query could not be parsed."
                return

            self.score = 1
            self.reason = "Query is parseable."
        except Exception as e:
            self.action_result.is_action_hallucination = True
            self.reason = f"Error occurred while parsing query: {e}"
            return


class QueryRunsSuccessfully(BaseQueryEvaluationMetric):
    """Validate that the agent's query executes without errors.

    Attempts to run the query against the Metabase instance.

    See also:
        - QuerySyntaxValid: For checking syntax only (faster, less strict)
    """

    category = MetricCategories.QUERY_VALIDITY

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

        try:
            await check_if_query_runs(test_case, query.raw_query)
            self.score += 1
            self.reason = "Query is valid and runs successfully."
        except Exception as e:
            self.action_result.is_action_hallucination = True
            self.reason = f"Error occurred while checking query: {e}"
            return
