"""
SQL Generation Benchmark Suite

This module provides comprehensive benchmarks for testing Metabot's SQL generation
capabilities across both raw and enriched tables in the analytics database.

Organization:
- Raw: Tests targeted at the raw `*_data` schemas / tables in the test environment
- Enriched: Tests targeted at the non-raw schemas / tables, e.g. dim, fact, enriched tables
"""

from .enriched_tables import (
    sql_enriched_l1_no_context,
    sql_enriched_l2_no_context,
    sql_enriched_l3_no_context,
)
from .raw_tables import (
    sql_raw_l1_no_context,
    sql_raw_l2_no_context,
    sql_raw_l3_no_context,
)
from .single_table_only import (
    sql_one_table_source_enriched,
    sql_one_table_source_enriched_viewing_table,
    sql_one_table_source_enriched_with_mention,
    sql_one_table_source_raw,
    sql_one_table_source_raw_viewing_table,
    sql_one_table_source_raw_with_mention,
)

__all__ = [
    "sql_raw_l1_no_context",
    "sql_raw_l2_no_context",
    "sql_raw_l3_no_context",
    "sql_enriched_l1_no_context",
    "sql_enriched_l2_no_context",
    "sql_enriched_l3_no_context",
    "sql_one_table_source_raw",
    "sql_one_table_source_raw_with_mention",
    "sql_one_table_source_raw_viewing_table",
    "sql_one_table_source_enriched",
    "sql_one_table_source_enriched_with_mention",
    "sql_one_table_source_enriched_viewing_table",
]
