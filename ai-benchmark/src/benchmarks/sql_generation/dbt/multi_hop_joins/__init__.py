"""
CATEGORY 3: Multi-Hop Join Path Selection / DAG Navigation

Tests the agent's ability to navigate layered dbt DAGs where fact models join to multiple
dimensions, each potentially depending on intermediate logic. Unlike flat SQL benchmarks,
dbt introduces structural indirection requiring agents to infer which model contains
business-ready fields, which path encodes correct relationships, and how to avoid unmodeled
or raw-layer joins.

Key Skills Tested:
- Selecting the correct join path through multi-layered DAG (stg → int → fct/dim)
- Navigating both enriched intermediate models (int_*) and raw staging tables (*_data.*)
- Understanding when filter criteria require full path traversal
- Handling soft-deleted records across joined tables (_fivetran_deleted)
- Choosing appropriate grain at each hop to avoid double-counting

Why DBT-Specific:
- dbt projects have layered DAGs requiring non-obvious multi-hop navigation
- Agents must choose correct hop path when direct joins are unavailable
- Spider/BIRD benchmarks struggle with indirect joins common in dbt warehouses

NOTE: Multi-Hop Join Analysis
- See MULTI_HOP_JOIN_ANALYSIS.md for comprehensive analysis across all 10 test data domains
"""

from . import customerio_hard, quickbooks_hard, salesforce_hard, shopify_hard, stripe_hard

TEST_SPECS = [
    *customerio_hard.TEST_SPECS,
    *quickbooks_hard.TEST_SPECS,
    *salesforce_hard.TEST_SPECS,
    *shopify_hard.TEST_SPECS,
    *stripe_hard.TEST_SPECS,
]
