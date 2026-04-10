"""
CATEGORY 1: Grain, Keys & Deduplication

Tests the agent's ability to understand data grain and prevent double-counting when joining
across different aggregation levels. In dbt projects, staging layers standardize identifiers
and remove duplicates, while intermediate models establish canonical grains for entities
(customers, orders, sessions). Misunderstanding grain is the most common source of incorrect
SQL generation in analytics workflows.

Key Skills Tested:
- Identifying the correct level of aggregation from model structure
- Distinguishing surrogate keys from business keys
- Avoiding double-counting across joins with different grains
- Matching temporal dimensions (e.g., month-to-month alignment)
- Deduplicating results when joining detail records to aggregate summaries

Why DBT-Specific:
- dbt projects use staging models to standardize keys and remove duplicates
- Intermediate and mart models require strict grain awareness to prevent double-counting
- Surrogate keys and business keys often differ; agents must infer join grain indirectly
"""

from . import brex_hard, calendly_hard, customerio_hard, google_adwords_hard, lever_hard

TEST_SPECS = [
    *brex_hard.TEST_SPECS,
    *calendly_hard.TEST_SPECS,
    *customerio_hard.TEST_SPECS,
    *google_adwords_hard.TEST_SPECS,
    *lever_hard.TEST_SPECS,
]
