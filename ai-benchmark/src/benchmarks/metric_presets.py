"""Metric preset functions for reducing boilerplate in test case construction."""

from src.benchmarks.consts import MetricMetadata, TableMetadata
from src.metrics import (
    NavigationOccurred,
    QueryMatchesDescription,
    QueryResultsMatch,
    QueryRunsSuccessfully,
    QuerySyntaxValid,
    QueryUsesDatabase,
    QueryUsesMetrics,
    QueryUsesTables,
)
from src.metrics.base import BaseMetric
from src.validation import SimpleEvaluator, SubsetEvaluator


def nlq_table_metrics(
    table: TableMetadata,
    query_description: str,
    database_id: int = 2,
    convert_mbql_to_sql: bool = False,
) -> list[BaseMetric]:
    """Standard metrics for NLQ table test cases."""
    return [
        QueryUsesDatabase(database_id=database_id),
        QueryUsesTables(table_names=[table.name]),
        QuerySyntaxValid(),
        QueryRunsSuccessfully(),
        QueryMatchesDescription(
            query_description=query_description,
            convert_mbql_to_sql=convert_mbql_to_sql,
        ),
        NavigationOccurred(expected=True, entity_type="chart"),
    ]


def nlq_metric_metrics(
    metric: MetricMetadata,
    query_description: str,
    database_id: int = 2,
) -> list[BaseMetric]:
    """Standard metrics for NLQ metric test cases."""
    return [
        QueryUsesDatabase(database_id=database_id),
        QueryUsesMetrics(metric_ids=[metric.id]),
        QuerySyntaxValid(),
        QueryRunsSuccessfully(),
        QueryMatchesDescription(query_description=query_description),
        NavigationOccurred(expected=True, entity_type="chart"),
    ]


def sql_gen_metrics(
    table_names: list[str],
    reference_query: str | None = None,
    database_id: int = 2,
) -> list[BaseMetric]:
    """Standard metrics for SQL generation test cases."""
    metrics: list[BaseMetric] = [
        QueryUsesDatabase(database_id=database_id),
        QueryUsesTables(table_names=table_names),
    ]

    if reference_query:
        metrics.append(
            QueryResultsMatch(
                reference_query=reference_query,
                database_id=database_id,
                evaluators=[
                    SimpleEvaluator(row_counts=True, col_counts=False),
                    SubsetEvaluator(coerce_types=True, max_candidates=1000, float_precision=2),
                ],
            )
        )

    return metrics
