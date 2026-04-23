from src.benchmarks.helpers import sql_user_config
from src.benchmarks.sql_generation.helpers import build_benchmark

from . import (
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

# Module groupings by tier
TIER_1_MODULES = [t1_single_fact_queries]
TIER_2_MODULES = [
    t2_dimensional_breakdown,
    t2_metric_combinations,
    t2_time_series_analysis,
]
TIER_3_MODULES = [
    t3_cohort_analysis,
    t3_cross_source_integration,
    t3_funnel_analysis,
    t3_multi_fact_integration,
    t3_period_over_period,
]
ALL_MODULES = TIER_1_MODULES + TIER_2_MODULES + TIER_3_MODULES


# E2E Benchmarks - No Context
sql_enriched_l1_no_context = build_benchmark("SQL Enriched L1 No Context", TIER_1_MODULES, sql_user_config)
sql_enriched_l2_no_context = build_benchmark("SQL Enriched L2 No Context", TIER_2_MODULES, sql_user_config)
sql_enriched_l3_no_context = build_benchmark("SQL Enriched L3 No Context", TIER_3_MODULES, sql_user_config)

# E2E Benchmarks - Viewing Editor
sql_enriched_l1_viewing_editor = build_benchmark(
    "SQL Enriched L1 Viewing Editor",
    TIER_1_MODULES,
    sql_user_config,
    add_editor_context=True,
)
sql_enriched_l2_viewing_editor = build_benchmark(
    "SQL Enriched L2 Viewing Editor",
    TIER_2_MODULES,
    sql_user_config,
    add_editor_context=True,
)
sql_enriched_l3_viewing_editor = build_benchmark(
    "SQL Enriched L3 Viewing Editor",
    TIER_3_MODULES,
    sql_user_config,
    add_editor_context=True,
)

# E2E Benchmarks - With Table Mentions
sql_enriched_l1_with_mentions = build_benchmark(
    "SQL Enriched L1 With Mentions",
    TIER_1_MODULES,
    sql_user_config,
    add_editor_context=True,
    add_table_mentions=True,
)
sql_enriched_l2_with_mentions = build_benchmark(
    "SQL Enriched L2 With Mentions",
    TIER_2_MODULES,
    sql_user_config,
    add_editor_context=True,
    add_table_mentions=True,
)
sql_enriched_l3_with_mentions = build_benchmark(
    "SQL Enriched L3 With Mentions",
    TIER_3_MODULES,
    sql_user_config,
    add_editor_context=True,
    add_table_mentions=True,
)

__all__ = [
    # E2E Enriched benchmarks
    "sql_enriched_l1_no_context",
    "sql_enriched_l2_no_context",
    "sql_enriched_l3_no_context",
    "sql_enriched_l1_viewing_editor",
    "sql_enriched_l2_viewing_editor",
    "sql_enriched_l3_viewing_editor",
    # E2E with table mentions
    "sql_enriched_l1_with_mentions",
    "sql_enriched_l2_with_mentions",
    "sql_enriched_l3_with_mentions",
]
