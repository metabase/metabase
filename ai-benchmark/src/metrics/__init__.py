"""Metrics module for benchmark evaluation."""

from src.metrics.base import (
    ActionResult,
    BaseMetric,
    BaseTestCase,
    Benchmark,
    Difficulty,
    MetricCategories,
    MetricFailure,
    MetricFailureType,
    _get_metric_config,
    _get_metric_runtime_data,
)
from src.metrics.comparison import (
    QueryMatchesReference,
    QueryMatchLevel,
    QueryMatchResult,
    QueryResultsMatch,
    QueryResultsMatchLLM,
    ResultComparisonOutput,
)
from src.metrics.navigation import NavigationOccurred
from src.metrics.query_base import (
    BaseQueryEvaluationMetric,
    MetabotQuery,
    check_if_query_runs,
    convert_to_metabot_queries,
    get_source_tables,
    get_table_type_and_id,
    parse_sql,
)
from src.metrics.response import (
    LinkedEntitiesE2E,
    OutputCheckResult,
    ResponseCorrectness,
    ResponseCorrectnessE2E,
    ToolCorrectnessE2E,
)
from src.metrics.semantic import QueryMatchesDescription
from src.metrics.source_selection import (
    QueryUsesDatabase,
    QueryUsesFilters,
    QueryUsesMeasures,
    QueryUsesMetrics,
    QueryUsesModel,
    QueryUsesSegments,
    QueryUsesTables,
)
from src.metrics.syntax import QueryRunsSuccessfully, QuerySyntaxValid
from src.metrics.tool_correctness import (
    ANY,
    ActualToolCall,
    AnyOfToolCalls,
    ExpectedToolCall,
    MatchValue,
    MissingCallError,
    ToolCorrectness,
    ToolCorrectnessResult,
    check_expected_tool_calls,
    check_matches_any_regex,
    check_output_matches_expectation,
    check_that_tool_calls_happened,
    does_not_include_extra_commentary,
)

__all__ = [
    # Base classes
    "ActionResult",
    "BaseMetric",
    "BaseQueryEvaluationMetric",
    "BaseTestCase",
    "Benchmark",
    "Difficulty",
    "MetricCategories",
    "MetricFailure",
    "MetricFailureType",
    "_get_metric_config",
    "_get_metric_runtime_data",
    # Query base utilities
    "MetabotQuery",
    "check_if_query_runs",
    "convert_to_metabot_queries",
    "get_source_tables",
    "get_table_type_and_id",
    "parse_sql",
    # Syntax metrics
    "QuerySyntaxValid",
    "QueryRunsSuccessfully",
    # Semantic metrics
    "QueryMatchesDescription",
    # Comparison metrics
    "QueryMatchesReference",
    "QueryMatchLevel",
    "QueryMatchResult",
    "QueryResultsMatch",
    "QueryResultsMatchLLM",
    "ResultComparisonOutput",
    # Source selection metrics
    "QueryUsesDatabase",
    "QueryUsesFilters",
    "QueryUsesMeasures",
    "QueryUsesMetrics",
    "QueryUsesModel",
    "QueryUsesSegments",
    "QueryUsesTables",
    # Response metrics
    "LinkedEntitiesE2E",
    "OutputCheckResult",
    "ResponseCorrectness",
    "ResponseCorrectnessE2E",
    "ToolCorrectnessE2E",
    # Navigation metrics
    "NavigationOccurred",
    # Tool correctness
    "ANY",
    "ActualToolCall",
    "AnyOfToolCalls",
    "ExpectedToolCall",
    "MatchValue",
    "MissingCallError",
    "ToolCorrectness",
    "ToolCorrectnessResult",
    "check_expected_tool_calls",
    "check_matches_any_regex",
    "check_output_matches_expectation",
    "check_that_tool_calls_happened",
    "does_not_include_extra_commentary",
]
