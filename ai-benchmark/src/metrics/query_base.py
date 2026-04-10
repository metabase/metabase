"""Base classes and utilities for query evaluation metrics."""

import asyncio
import logging
import re
from typing import TYPE_CHECKING, Literal

import sqlglot
import sqlglot.expressions as exp
from pydantic import BaseModel, Field
from sqlglot.optimizer.scope import build_scope

from src.metrics.base import BaseMetric
from src.types.queries import MODEL_ID_PREFIX, MODEL_REFERENCE_PATTERN, DatasetQuery, MBQL4Query, MBQL5Query

if TYPE_CHECKING:
    from src.core.test_case import E2EAgentTestCase

logger = logging.getLogger(__name__)


def parse_dataset_query(data: dict | DatasetQuery) -> DatasetQuery:
    """Parse a dict or DatasetQuery into a DatasetQuery object.

    Args:
        data: Either a raw dict from the response state or an already-parsed DatasetQuery

    Returns:
        A DatasetQuery object (MBQL4Query or MBQL5Query)
    """
    if isinstance(data, MBQL4Query | MBQL5Query):
        return data

    if "lib/type" in data:
        return MBQL5Query.model_validate(data)
    else:
        return MBQL4Query.model_validate(data)


def get_table_type_and_id(table_id: str | int) -> tuple[Literal["table", "model"], int]:
    """Convert internal ID representation of a table (or model) to the type and ID needed for the API call."""
    _type = "table"
    if isinstance(table_id, str):
        if table_id.startswith(MODEL_ID_PREFIX):
            _type = "model"
            entity_id = int(table_id.replace(MODEL_ID_PREFIX, ""))
        else:
            try:
                entity_id = int(table_id)
            except ValueError as e:
                raise ValueError("table_id must be a valid integer or a model ID string.") from e
    else:
        entity_id = table_id
    return _type, entity_id


def parse_sql(sql: str, dialect: str = "postgres"):
    """Parse a SQL string using sqlglot.

    Args:
        sql: The SQL string to parse
        dialect: The SQL dialect to use (default: "postgres")

    Returns:
        The parsed sqlglot Expression object, or None if parsing fails
    """
    # Metabase queries can contain model references like {{#123-model-name}}
    # In order to make them parseable by sqlglot, we replace them with dummy table names.
    sql = re.sub(MODEL_REFERENCE_PATTERN, r"model_\1", sql)
    return sqlglot.parse_one(sql, dialect=dialect)


def _clean_table_ref_transformer(node):
    """Removes comments and aliases from SQL table references to enable fair comparison."""
    node.comments = []
    node.set("alias", None)
    return node


def get_source_tables(parsed_query) -> list[str]:
    """Extract the unique tables that are referenced in FROM or JOIN statements."""
    root = build_scope(parsed_query)

    tables = {
        str(source.transform(_clean_table_ref_transformer))
        for scope in root.traverse()
        for alias, (node, source) in scope.selected_sources.items()
        if isinstance(source, exp.Table)
    }

    # Clean table names by removing double quotes
    cleaned_names = []
    for name in list(tables):
        cleaned_name = name.replace('"', "")
        cleaned_names.append(cleaned_name)
    return cleaned_names


class MetabotQuery(BaseModel):
    """Wrapper around a DatasetQuery with its SQL representation for evaluation."""

    raw_query: DatasetQuery = Field(description="The DatasetQuery object constructed by Metabot.")
    sql_representation: str | None = Field(
        description="The SQL representation of the query, if applicable. May be None if conversion failed."
    )

    @property
    def type(self) -> Literal["MBQL", "SQL"]:
        """Returns the query type based on the underlying DatasetQuery."""
        raw_query_type = self.raw_query.query_type
        return "MBQL" if raw_query_type == "notebook" else "SQL"


async def convert_to_metabot_queries(
    test_case: "E2EAgentTestCase", dataset_queries: list[DatasetQuery]
) -> list[MetabotQuery]:
    """Convert multiple DatasetQuery objects to MetabotQuery objects with SQL representations."""
    client = test_case.get_admin_client()

    tasks = [client.get_sql_representation(dq.to_mbql()) for dq in dataset_queries]
    sql_representations = await asyncio.gather(*tasks, return_exceptions=True)

    metabot_queries = []
    for dataset_query, sql_repr in zip(dataset_queries, sql_representations, strict=True):
        if isinstance(sql_repr, Exception):
            logger.warning(
                "Failed to get SQL representation for query in test case %s: %s",
                test_case.id,
                sql_repr,
            )
            sql_repr = None

        metabot_queries.append(
            MetabotQuery(
                raw_query=dataset_query,
                sql_representation=sql_repr,
            )
        )

    return metabot_queries


async def check_if_query_runs(test_case: "E2EAgentTestCase", query: DatasetQuery):
    """Check if a query runs successfully in the test case."""
    client = test_case.get_admin_client()
    query_dict = query.to_mbql(auto_populate_template_tags=True)

    res = await client.run_query(query_dict)
    if "error" in res:
        raise ValueError(f"Query returned error: {res['error']}")


class BaseQueryEvaluationMetric(BaseMetric):
    """Base class for query evaluation metrics.

    Provides common functionality for metrics that evaluate individual queries.
    Queries are extracted from the conversation state (response_state.queries),
    which contains all queries constructed during the agent's response.
    """

    consider: Literal["last", "first"] = Field(
        default="last",
        description="Which query to consider for matching: the first or the last one constructed by the agent.",
    )
    _converted_query: MetabotQuery | None = None

    @property
    def runtime_data(self) -> dict:
        """Return runtime evaluation artifacts including the converted query."""
        if self._converted_query is None:
            return {}
        return {
            "converted_query": self._converted_query.model_dump(),
        }

    async def get_query(self, test_case: "E2EAgentTestCase") -> MetabotQuery | None:
        """Get the query to evaluate from the conversation state."""
        state_queries = test_case.response_state.queries

        if not state_queries:
            return None

        query_ids = list(state_queries.keys())

        if self.consider == "first":
            selected_id = query_ids[0]
        else:
            selected_id = query_ids[-1]

        dataset_query = parse_dataset_query(state_queries[selected_id])
        results = await convert_to_metabot_queries(test_case, [dataset_query])
        self._converted_query = results[0]
        return self._converted_query
