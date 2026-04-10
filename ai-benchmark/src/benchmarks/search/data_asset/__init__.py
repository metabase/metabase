from src.benchmarks.helpers import full_access_user_config
from src.core.base import BenchmarkE2E
from src.core.test_case import E2EAgentTestCase
from src.metrics import (
    LinkedEntitiesE2E,
    NavigationOccurred,
)

STORE_MONITORING_DASHBOARD_ID = 9
CUSTOMER_IO_CUSTOMER_CHURN_RATE_METRIC_ID = 118

test_cases = [
    E2EAgentTestCase(
        message="Do we have data on how our store performs?",
        metrics=[
            LinkedEntitiesE2E(entity_type="dashboard", ids=[STORE_MONITORING_DASHBOARD_ID]),
            NavigationOccurred(entity_type="dashboard", entity_id=STORE_MONITORING_DASHBOARD_ID),
        ],
    ),
    E2EAgentTestCase(
        message="Do we have existing data on what share of people unsubscribe from our Marketing emails?",
        metrics=[
            LinkedEntitiesE2E(entity_type="metric", ids=[CUSTOMER_IO_CUSTOMER_CHURN_RATE_METRIC_ID]),
            NavigationOccurred(entity_type="metric", entity_id=CUSTOMER_IO_CUSTOMER_CHURN_RATE_METRIC_ID),
        ],
    ),
]

data_asset_search_benchmark = BenchmarkE2E(
    name="Data Asset Search",
    test_cases=test_cases,
    # NOTE: We use the user who has permissions to all Metabase features
    config=full_access_user_config,
)
