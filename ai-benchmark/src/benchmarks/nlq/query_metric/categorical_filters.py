from src.core.base import BenchmarkE2E
from src.benchmarks.helpers import (
    BOUNCE_RATE_METRIC,
    CARD_UTILIZATION_RATE_METRIC,
    CUSTOMER_CHURN_RATE_METRIC,
    DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
    EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
    OPEN_RATE_METRIC,
    full_access_user_config,
)
from src.benchmarks.nlq.factories import create_nlq_test_cases

single_value = [
    # Filters where the user question contains a single categorical value to filter
    # Can also include fuzzy matching (user query does not exactly match the value in the data)
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What is the bounce rate for hard bounces?",
        "expected_query": (
            "The query should filter for hard bounces. "
            "Any of these filters is acceptable: bounce_type = 'hard', bounce_category = 'Hard Bounce'."
        ),
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What's our bounce rate for the welcome series campaign?",
        "expected_query": "The query should filter where campaign_name = 'Welcome Series'.",
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "What's the utilization rate for active cards?",
        "expected_query": (
            "The query should filter for active cards. "
            "Any of these filters is acceptable: card_status = 'active', is_active = true."
        ),
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "Show me utilization rate for virtual cards",
        "expected_query": (
            "The query should filter for virtual cards. "
            "Any of these filters is acceptable: card_type = 'virtual', card_type_category = 'Virtual Card'."
        ),
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "What's the utilization for PHYSICAL cards?",
        "expected_query": "The query should filter where card_type = 'physical'.",
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What's the bounce rate for re engagement campaigns?",
        "expected_query": "The query should filter where campaign_name = 'Re-engagement'.",
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Show me bounce rate for trial expiry emails",
        "expected_query": "The query should filter where campaign_name = 'Trial Expiration'.",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What's the churn rate for moderate engaged customers?",
        "expected_query": "The query should filter where engagement_level = 'Moderately Engaged'.",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "Show me churn rate for low engagement customers",
        "expected_query": "The query should filter where engagement_level = 'Low Engagement'.",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "Show me churn rate for active subscriptions",
        "expected_query": "The query should filter where subscription_status contains 'active' or matches active status.",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "Show me churn rate for customers who actually unsubscribed",
        "expected_query": "The query should filter where unsubscribed = true.",
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What's the approval rate for the Marketing department?",
        "expected_query": "The query should filter where department_name = 'Marketing'.",
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What's the approval rate for human resources?",
        "expected_query": "The query should filter where department_name = 'HR'.",
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "How long does it take to approve expenses in Sales?",
        "expected_query": "The query should filter where department_name = 'Sales'.",
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "What's the approval time for travel expenses?",
        "expected_query": (
            "The query should filter for travel expenses. "
            "Any of these filters is acceptable: transaction_category = 'Travel'"
        ),
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "What's the cycle time for approved expenses?",
        "expected_query": (
            "The query should filter for approved expenses. "
            "Any of these filters is acceptable: expense_status = 'approved'"
        ),
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "How fast do we approve traveling expenses?",
        "expected_query": (
            "The query should filter for travel expenses. Should filter for transaction_category = 'Travel'."
        ),
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What's the open rate for the Welcome Series campaign?",
        "expected_query": "The query should filter where campaign_name = 'Welcome Series'.",
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What's the open rate for ONBOARDING emails?",
        "expected_query": "The query should filter where campaign_name = 'Onboarding'.",
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "Show me open rate for feature announcement campaign",
        "expected_query": "The query should filter where campaign_name = 'Feature Announcement'.",
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "What's the utilization rate for active cards only?",
        "expected_query": (
            "The query should filter for active cards. "
            "Any of these filters is acceptable: is_active = true, card_status = 'active'."
        ),
    },
]

string_contains_filters = [
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What's the bounce rate where the bounce reason contains 'network'?",
        "expected_query": "The query should filter where bounce_reason contains the substring 'network'.",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What's the churn rate for customers with gmail addresses?",
        "expected_query": "The query should filter where email contains '@gmail'.",
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What's the open rate for delivered emails to example.org accounts?",
        "expected_query": (
            # NOTE: The metric description says that it only takes into account delivered emails
            # Therefore, we don't need to filter for delivered emails explicitly
            "The query should filter for the customer email field containing '@example.org'"
        ),
    },
]

exclude_filters = [
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What's the bounce rate excluding technical bounces?",
        # TODO: should this also allow to filter for the specific other types (hard, soft) instead?
        "expected_query": "The query should filter where bounce_type != 'technical' or NOT bounce_type = 'technical'. It is also acceptable to exclude null bounce types (but not required).",
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "Show me utilization excluding inactive cards",
        "expected_query": (
            "The query should filter to exclude inactive cards. "
            "Any of these filters is acceptable: card_status != 'inactive', is_active = true."
        ),
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "Show me approval rate excluding HR department",
        "expected_query": "The query should filter where department_name != 'HR'. Excluding null departments is also acceptable but not required.",  # noqa: E501
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "Show me approval time excluding rejected expenses",
        "expected_query": (
            "The query should filter to exclude rejected expenses. "
            "Any of these filters is acceptable: expense_status != 'rejected', status IN ('approved', 'reimbursed', 'submitted')"
        ),
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "Show me open rate excluding the feature announcements campaign",
        "expected_query": "The query should filter where campaign_name != 'Feature Announcement'.",
    },
]

multiple_values = [
    # Filters where the user question contains multiple categorical values to filter for
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Show me bounce rate for hard and soft bounces",
        "expected_query": (
            "The query should filter for hard and soft bounces. "
            "Any of these filters is acceptable: "
            "bounce_type IN ('hard', 'soft'), bounce_category IN ('Hard Bounce', 'Soft Bounce')."
        ),
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "What's the card utilization for frozen and cancelled cards?",
        "expected_query": "The query should filter where card_status IN ('frozen', 'cancelled').",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What's the churn rate for low and medium engagement users?",
        "expected_query": "The query should filter where engagement_level IN ('Low Engagement', 'Moderately Engaged').",
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "Show me approval rates for Sales and Marketing",
        "expected_query": "The query should filter where department_name IN ('Sales', 'Marketing').",
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "Show me approval cycle time for meals and travel",
        "expected_query": (
            "The query should filter for meals and entertainment. "
            "Any of these filters is acceptable: "
            "transaction_category IN ('Meals', 'Travel')"
        ),
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "Show me open rate for Onboarding and Trial Expiration campaigns",
        "expected_query": "The query should filter where campaign_name IN ('Onboarding', 'Trial Expiration').",
    },
]

value_does_not_exist_in_sample_data = [
    # Test cases where the agent won't see the filter value in the field sample data.
    # It needs to come up with a best guess based on the other sample values and the field statistics.
    # However, it should tell the user about that assumption
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What's the approval rate for the Data team?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Have a reasonable filter on the department_name field to filter for the data team (e.g., department_name = 'Data' or department_name = 'Engineering').
    """,  # noqa E501
        "response_expectation": (
            'The agent should acknowledge that the requested filter value ("Data team" or similar)'
            " was not found in the sample data, or explain that it is using a best guess (like 'Data')"
            " based on the available samples. It should state what value it will use."
            " This disclosure must be clear and present in the response."
        ),
    },
]

categorical_filters = [
    *single_value,
    *string_contains_filters,
    *exclude_filters,
    *multiple_values,
    *value_does_not_exist_in_sample_data,
]

categorical_filters_mentioning_metric = BenchmarkE2E(
    name="NLQ Metrics - Categorical Filters (metric mentioned)",
    test_cases=create_nlq_test_cases(cases=categorical_filters, entity_type="metric", mention_entity=True),
    config=full_access_user_config,
)
categorical_filters_viewing_metric = BenchmarkE2E(
    name="NLQ Metrics - Categorical Filters (user viewing metric)",
    test_cases=create_nlq_test_cases(cases=categorical_filters, entity_type="metric", user_is_viewing=True),
    config=full_access_user_config,
)
categorical_filters_no_context = BenchmarkE2E(
    name="NLQ Metrics - Categorical Filters (no context)",
    test_cases=create_nlq_test_cases(cases=categorical_filters, entity_type="metric"),
    config=full_access_user_config,
)
