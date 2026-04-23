from src.core.base import BenchmarkE2E
from src.benchmarks.helpers import sql_user_config
from src.benchmarks.sql_generation.helpers import (
    add_viewing_sql_editor_context,
    build_sql_gen_test_case,
)

from . import (
    grain_semantics,
    multi_hop_joins,
    scd_temporal_logic,
)


def _build_tests(test_spec_list):
    return [build_sql_gen_test_case(**test_spec) for test_spec in test_spec_list]


def _add_viewing_sql_editor_context(test_spec_list):
    return [add_viewing_sql_editor_context(test_spec) for test_spec in test_spec_list]


dbt_grain_semantics_viewing_editor = BenchmarkE2E(
    name="SQLBot DBT - Grain Semantics",
    test_cases=_build_tests(_add_viewing_sql_editor_context(grain_semantics.TEST_SPECS)),
    config=sql_user_config,
)

dbt_multi_hop_joins_viewing_editor = BenchmarkE2E(
    name="SQLBot DBT - Multi-Hop Joins",
    test_cases=_build_tests(_add_viewing_sql_editor_context(multi_hop_joins.TEST_SPECS)),
    config=sql_user_config,
)

dbt_scd_temporal_logic_viewing_editor = BenchmarkE2E(
    name="SQLBot DBT - SCD Temporal Logic",
    test_cases=_build_tests(_add_viewing_sql_editor_context(scd_temporal_logic.TEST_SPECS)),
    config=sql_user_config,
)

__all__ = [
    "dbt_grain_semantics_viewing_editor",
    "dbt_multi_hop_joins_viewing_editor",
    "dbt_scd_temporal_logic_viewing_editor",
]
