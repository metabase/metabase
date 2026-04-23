"""
CATEGORY 2: SCD, Temporal Logic & Snapshots

Tests the agent's ability to handle Slowly Changing Dimensions (SCD) and temporal joins.
dbt implements SCD Type 2 via macros that expand to interval-based rows (valid_from, valid_to,
is_current). Text-to-SQL agents commonly fail temporal joins by choosing the latest record
instead of the record valid at event time, joining incorrectly on surrogate keys, or ignoring
interval constraints.

Key Skills Tested:
- Joining historical fact events to dimension current state (Type 1)
- Understanding temporal mismatch between event timestamps and dimension state
- Recognizing semantic ambiguity in temporal queries without Type 2 tracking
- Filtering on current dimension attributes when historical tracking unavailable

Why DBT-Specific:
- dbt SCD Type 2 snapshot patterns are ubiquitous in production warehouses
- Agents must reason about valid_from, valid_to, current rows, and temporal alignment
- Temporal joins are among the hardest SQL tasks for LLMs

NOTE: Current Test Data Environment
- No Explicit SCD Type 2 Tracking: No valid_from, valid_to, or is_current fields exist
- All dimension tables use SCD Type 1 (current state only)
- Tests focus on temporal mismatch between historical events and current dimension state
- See SCD_FIELD_ANALYSIS.md for detailed analysis of 60+ slowly changing attributes
across all domains
"""

from . import brex_hard, quickbooks_hard, salesforce_hard, shopify_hard, stripe_hard

TEST_SPECS = [
    *brex_hard.TEST_SPECS,
    *quickbooks_hard.TEST_SPECS,
    *salesforce_hard.TEST_SPECS,
    *shopify_hard.TEST_SPECS,
    *stripe_hard.TEST_SPECS,
]
