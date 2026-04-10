from src.core.base import BenchmarkE2E
from src.benchmarks.helpers import (
    get_benchmark_table,
    sql_user_config,
    sqlgen_raw_user_config,
)
from src.benchmarks.sql_generation.enriched_tables import (
    t1_single_fact_queries,
    t2_dimensional_breakdown,
    t2_metric_combinations,
    t2_time_series_analysis,
    t3_cohort_analysis,
    t3_cross_source_integration,
    t3_funnel_analysis,
    t3_multi_fact_integration,
    t3_period_over_period,
)
from src.benchmarks.sql_generation.helpers import (
    add_table_reference_to_message,
    add_viewing_sql_editor_context,
    add_viewing_table_context,
    build_sql_gen_test_case,
)
from src.benchmarks.sql_generation.raw_tables import (
    t1_simple_joins,
    t1_single_table_aggregations,
    t2_aggregation_with_having,
    t2_calculated_metrics,
    t2_case_conditional_logic,
    t2_date_time_operations,
    t2_multi_table_joins,
    t2_string_operations,
    t3_ctes_advanced_patterns,
    t3_offset_frame_functions,
    t3_ranking_functions,
    t3_subqueries,
    t3_top_n_per_group,
)


def collect_single_table_tests(*modules):
    single_table_tests = []

    for module in modules:
        if hasattr(module, "TEST_DATA"):
            filtered = [test for test in module.TEST_DATA if len(test.get("table_names", [])) == 1]
            single_table_tests.extend(filtered)

    return single_table_tests


RAW_SINGLE_TABLE_TESTS = collect_single_table_tests(
    t1_single_table_aggregations,
    t1_simple_joins,
    t2_multi_table_joins,
    t2_calculated_metrics,
    t2_date_time_operations,
    t2_aggregation_with_having,
    t2_case_conditional_logic,
    t2_string_operations,
    t3_ranking_functions,
    t3_offset_frame_functions,
    t3_top_n_per_group,
    t3_subqueries,
    t3_ctes_advanced_patterns,
)

ENRICHED_SINGLE_TABLE_TESTS = collect_single_table_tests(
    t1_single_fact_queries,
    t2_dimensional_breakdown,
    t2_time_series_analysis,
    t2_metric_combinations,
    t3_cohort_analysis,
    t3_funnel_analysis,
    t3_period_over_period,
    t3_multi_fact_integration,
    t3_cross_source_integration,
)

RAW_SINGLE_TABLE_TESTS_WITH_MENTION = [
    add_table_reference_to_message(test_data, get_benchmark_table) for test_data in RAW_SINGLE_TABLE_TESTS
]

ENRICHED_SINGLE_TABLE_TESTS_WITH_MENTION = [
    add_table_reference_to_message(test_data, get_benchmark_table) for test_data in ENRICHED_SINGLE_TABLE_TESTS
]

RAW_SINGLE_TABLE_TESTS_VIEWING_TABLE = [
    add_viewing_table_context(test_data, get_benchmark_table) for test_data in RAW_SINGLE_TABLE_TESTS
]

ENRICHED_SINGLE_TABLE_TESTS_VIEWING_TABLE = [
    add_viewing_table_context(test_data, get_benchmark_table) for test_data in ENRICHED_SINGLE_TABLE_TESTS
]

RAW_SINGLE_TABLE_TESTS_VIEWING_EDITOR = [
    add_viewing_sql_editor_context(test_data) for test_data in RAW_SINGLE_TABLE_TESTS
]

ENRICHED_SINGLE_TABLE_TESTS_VIEWING_EDITOR = [
    add_viewing_sql_editor_context(test_data) for test_data in ENRICHED_SINGLE_TABLE_TESTS
]

RAW_SINGLE_TABLE_TESTS_VIEWING_EDITOR_WITH_MENTION = [
    add_viewing_sql_editor_context(add_table_reference_to_message(test_data, get_benchmark_table))
    for test_data in RAW_SINGLE_TABLE_TESTS
]

ENRICHED_SINGLE_TABLE_TESTS_VIEWING_EDITOR_WITH_MENTION = [
    add_viewing_sql_editor_context(add_table_reference_to_message(test_data, get_benchmark_table))
    for test_data in ENRICHED_SINGLE_TABLE_TESTS
]

sql_one_table_source_raw = BenchmarkE2E(
    name="SQL 1 Table Source (Raw)",
    test_cases=[build_sql_gen_test_case(**test_data) for test_data in RAW_SINGLE_TABLE_TESTS],
    config=sqlgen_raw_user_config,
)

sql_one_table_source_enriched = BenchmarkE2E(
    name="SQL 1 Table Source (Enriched)",
    test_cases=[build_sql_gen_test_case(**test_data) for test_data in ENRICHED_SINGLE_TABLE_TESTS],
    config=sql_user_config,
)

sql_one_table_source_raw_with_mention = BenchmarkE2E(
    name="SQL 1 Table Source (Raw) - @mention",
    test_cases=[build_sql_gen_test_case(**test_data) for test_data in RAW_SINGLE_TABLE_TESTS_WITH_MENTION],
    config=sqlgen_raw_user_config,
)

sql_one_table_source_enriched_with_mention = BenchmarkE2E(
    name="SQL 1 Table Source (Enriched) - @mention",
    test_cases=[build_sql_gen_test_case(**test_data) for test_data in ENRICHED_SINGLE_TABLE_TESTS_WITH_MENTION],
    config=sql_user_config,
)

sql_one_table_source_raw_viewing_table = BenchmarkE2E(
    name="SQL 1 Table Source (Raw) - Viewing Table",
    test_cases=[build_sql_gen_test_case(**test_data) for test_data in RAW_SINGLE_TABLE_TESTS_VIEWING_TABLE],
    config=sqlgen_raw_user_config,
)

sql_one_table_source_enriched_viewing_table = BenchmarkE2E(
    name="SQL 1 Table Source (Enriched) - Viewing Table",
    test_cases=[build_sql_gen_test_case(**test_data) for test_data in ENRICHED_SINGLE_TABLE_TESTS_VIEWING_TABLE],
    config=sql_user_config,
)

sql_one_table_source_raw_viewing_editor = BenchmarkE2E(
    name="SQL 1 Table Source (Raw) - Viewing Editor",
    test_cases=[build_sql_gen_test_case(**test_data) for test_data in RAW_SINGLE_TABLE_TESTS_VIEWING_EDITOR],
    config=sqlgen_raw_user_config,
)

sql_one_table_source_enriched_viewing_editor = BenchmarkE2E(
    name="SQL 1 Table Source (Enriched) - Viewing Editor",
    test_cases=[build_sql_gen_test_case(**test_data) for test_data in ENRICHED_SINGLE_TABLE_TESTS_VIEWING_EDITOR],
    config=sql_user_config,
)

sql_one_table_source_raw_viewing_editor_with_mention = BenchmarkE2E(
    name="SQL 1 Table Source (Raw) - Viewing Editor + @mention",
    test_cases=[
        build_sql_gen_test_case(**test_data) for test_data in RAW_SINGLE_TABLE_TESTS_VIEWING_EDITOR_WITH_MENTION
    ],
    config=sqlgen_raw_user_config,
)

sql_one_table_source_enriched_viewing_editor_with_mention = BenchmarkE2E(
    name="SQL 1 Table Source (Enriched) - Viewing Editor + @mention",
    test_cases=[
        build_sql_gen_test_case(**test_data) for test_data in ENRICHED_SINGLE_TABLE_TESTS_VIEWING_EDITOR_WITH_MENTION
    ],
    config=sql_user_config,
)

__all__ = [
    "sql_one_table_source_raw",
    "sql_one_table_source_enriched",
    "sql_one_table_source_raw_with_mention",
    "sql_one_table_source_enriched_with_mention",
    "sql_one_table_source_raw_viewing_table",
    "sql_one_table_source_enriched_viewing_table",
    "sql_one_table_source_raw_viewing_editor",
    "sql_one_table_source_enriched_viewing_editor",
    "sql_one_table_source_raw_viewing_editor_with_mention",
    "sql_one_table_source_enriched_viewing_editor_with_mention",
]
