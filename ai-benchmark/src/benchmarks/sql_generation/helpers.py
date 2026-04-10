"""Helper functions for building SQL generation test cases.

This module provides utilities to reduce boilerplate when creating SQL generation
benchmarks. The primary function `build_sql_gen_test_case` creates fully-configured
test cases from minimal dict-based test data.

Example usage:
    test_case = build_sql_gen_test_case(
        description="Average deal size by industry",
        message="What is the average opportunity amount by industry?",
        table_names=["salesforce_data.opportunity", "salesforce_data.account"],
    )

    # With table mentions appended to message
    test_case = build_sql_gen_test_case(..., add_table_mentions=True)
"""

from typing import TYPE_CHECKING, Any

from src.benchmarks.context import viewing_sql_editor_context, viewing_table_context
from src.benchmarks.helpers import get_benchmark_table
from src.benchmarks.metric_presets import sql_gen_metrics

if TYPE_CHECKING:
    from src.core.base import BenchmarkE2E
from src.core.test_case import DEFAULT_GLOBAL_CONTEXT_E2E, E2EAgentTestCase


def add_table_reference_to_message(test_data: dict, get_benchmark_table) -> dict:
    """Add a table reference link to the message.

    Args:
        test_data: Test data dict containing table_names
        get_benchmark_table: Function to get table metadata by name
    """
    test_data_copy = test_data.copy()
    table_name = test_data_copy["table_names"][0]
    table = get_benchmark_table(table_name)
    test_data_copy["message"] += f" [{table.display_name}](metabase://table/{table.id})"
    return test_data_copy


def add_viewing_table_context(test_data: dict, get_benchmark_table) -> dict:
    """Add context for viewing a table in the UI.

    Args:
        test_data: Test data dict containing table_names
        get_benchmark_table: Function to get table metadata by name
    """
    test_data_copy = test_data.copy()
    table_name = test_data_copy["table_names"][0]
    table = get_benchmark_table(table_name)

    context = DEFAULT_GLOBAL_CONTEXT_E2E.copy()
    context["user_is_viewing"] = [viewing_table_context(table)]
    test_data_copy["context"] = context
    return test_data_copy


def add_viewing_sql_editor_context(test_data: dict, database_id: int = 2) -> dict:
    test_data_copy = test_data.copy()
    context = DEFAULT_GLOBAL_CONTEXT_E2E.copy()
    context["user_is_viewing"] = viewing_sql_editor_context(database_id)
    test_data_copy["context"] = context
    return test_data_copy


def _build_prompt_with_mentions(message: str, table_names: list[str]) -> str:
    """Append @mentions to message for agent test cases.

    Creates markdown link format with metabase:// protocol URIs that the agent
    can use to resolve table references from the user's message.

    Args:
        message: Original natural language prompt
        table_names: List of table names in schema.table format

    Returns:
        Prompt with @mentions appended
    """
    mentions = []
    for table_name in table_names:
        try:
            table = get_benchmark_table(table_name)
            mentions.append(f"[{table.display_name}](metabase://table/{table.id})")
        except ValueError:
            continue

    if mentions:
        return f"{message} {' '.join(mentions)}"
    return message


def build_sql_gen_test_case(
    description: str,
    message: str,
    table_names: list[str],
    reference_query: str | None = None,
    database_id: int = 2,
    add_table_mentions: bool = False,
    query_description: str | None = None,  # noqa: ARG001 - unused, accepted for compatibility
    expected_fields: list[str] | None = None,  # noqa: ARG001 - unused, accepted for compatibility
    **kwargs: Any,
) -> E2EAgentTestCase:
    """Build a SQL generation test case with standard metrics.

    Args:
        description: Brief technical summary of what's being tested
        message: Natural language prompt for the agent (what user would type)
        table_names: List of required table names in schema.table format
            (e.g., ["salesforce_data.opportunity", "salesforce_data.account"])
        reference_query: Optional reference SQL for result matching.
            Agent's query results will be compared against this query's results.
        database_id: Database to query (default: 2 for analytics database)
        add_table_mentions: Whether to append table mentions to the message.
        **kwargs: Additional fields to pass to E2EAgentTestCase
            (e.g., context, state, conversation_id).

    Returns:
        E2EAgentTestCase configured with standard SQL metrics
    """
    metrics = sql_gen_metrics(table_names, reference_query, database_id)
    final_message = _build_prompt_with_mentions(message, table_names) if add_table_mentions else message
    return E2EAgentTestCase(
        description=description,
        message=final_message,
        metrics=metrics,
        **kwargs,
    )


def build_benchmark(
    name: str,
    tier_modules: list,
    config,
    add_editor_context: bool = False,
    add_table_mentions: bool = False,
) -> "BenchmarkE2E":
    """
    Factory for creating SQL generation benchmark instances.

    Args:
        name: Benchmark display name
        tier_modules: List of modules containing TEST_DATA
        config: User config for the benchmark
        add_editor_context: Whether to add "viewing SQL editor" context to test data
        add_table_mentions: Whether to append table mentions to the message.
    """
    from src.core.base import BenchmarkE2E

    test_cases = []
    for module in tier_modules:
        test_data = module.TEST_DATA
        if add_editor_context:
            test_data = [add_viewing_sql_editor_context(d) for d in test_data]
        test_cases.extend(
            build_sql_gen_test_case(**data, add_table_mentions=add_table_mentions)
            for data in test_data
        )
    return BenchmarkE2E(name=name, test_cases=test_cases, config=config)
