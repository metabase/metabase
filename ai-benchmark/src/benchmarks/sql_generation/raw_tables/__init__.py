from src.benchmarks.helpers import sqlgen_raw_user_config
from src.benchmarks.sql_generation.helpers import build_benchmark

from . import (
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

# Module groupings by tier
TIER_1_MODULES = [t1_single_table_aggregations, t1_simple_joins]
TIER_2_MODULES = [
    t2_aggregation_with_having,
    t2_calculated_metrics,
    t2_case_conditional_logic,
    t2_date_time_operations,
    t2_multi_table_joins,
    t2_string_operations,
]
TIER_3_MODULES = [
    t3_ctes_advanced_patterns,
    t3_offset_frame_functions,
    t3_ranking_functions,
    t3_subqueries,
    t3_top_n_per_group,
]
ALL_MODULES = TIER_1_MODULES + TIER_2_MODULES + TIER_3_MODULES


# E2E Benchmarks - No Context
sql_raw_l1_no_context = build_benchmark("SQL Raw L1 No Context", TIER_1_MODULES, sqlgen_raw_user_config)
sql_raw_l2_no_context = build_benchmark("SQL Raw L2 No Context", TIER_2_MODULES, sqlgen_raw_user_config)
sql_raw_l3_no_context = build_benchmark("SQL Raw L3 No Context", TIER_3_MODULES, sqlgen_raw_user_config)

# E2E Benchmarks - Viewing Editor
sql_raw_l1_viewing_editor = build_benchmark(
    "SQL Raw L1 Viewing Editor",
    TIER_1_MODULES,
    sqlgen_raw_user_config,
    add_editor_context=True,
)
sql_raw_l2_viewing_editor = build_benchmark(
    "SQL Raw L2 Viewing Editor",
    TIER_2_MODULES,
    sqlgen_raw_user_config,
    add_editor_context=True,
)
sql_raw_l3_viewing_editor = build_benchmark(
    "SQL Raw L3 Viewing Editor",
    TIER_3_MODULES,
    sqlgen_raw_user_config,
    add_editor_context=True,
)

# E2E Benchmarks - With Table Mentions (experimental comparison with OSS)
sql_raw_l1_with_mentions = build_benchmark(
    "SQL Raw L1 With Mentions",
    TIER_1_MODULES,
    sqlgen_raw_user_config,
    add_editor_context=True,
    add_table_mentions=True,
)
sql_raw_l2_with_mentions = build_benchmark(
    "SQL Raw L2 With Mentions",
    TIER_2_MODULES,
    sqlgen_raw_user_config,
    add_editor_context=True,
    add_table_mentions=True,
)
sql_raw_l3_with_mentions = build_benchmark(
    "SQL Raw L3 With Mentions",
    TIER_3_MODULES,
    sqlgen_raw_user_config,
    add_editor_context=True,
    add_table_mentions=True,
)

__all__ = [
    # E2E Raw benchmarks
    "sql_raw_l1_no_context",
    "sql_raw_l2_no_context",
    "sql_raw_l3_no_context",
    "sql_raw_l1_viewing_editor",
    "sql_raw_l2_viewing_editor",
    "sql_raw_l3_viewing_editor",
    "sql_raw_l1_with_mentions",
    "sql_raw_l2_with_mentions",
    "sql_raw_l3_with_mentions",
]
