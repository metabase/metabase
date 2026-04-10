from src.benchmarks.helpers import (
    SHOPIFY_ORDER_LINE_FACTS_MODEL,
    SHOPIFY_REFUND_FACTS_MODEL,
    sql_gen_models_user_config,
)
from src.core.base import BenchmarkE2E
from src.core.test_case import DEFAULT_GLOBAL_CONTEXT_E2E, E2EAgentTestCase
from src.metabase import MetabaseCapabilities
from src.metrics import (
    QueryMatchesDescription,
    QueryRunsSuccessfully,
    QuerySyntaxValid,
    QueryUsesDatabase,
    QueryUsesModel,
)

cases = [
    {
        "message": "Show me customers where the first order was more expensive than the most recent one.",  # noqa: E501
        "model": SHOPIFY_ORDER_LINE_FACTS_MODEL,
        "expectation": """
The generated SQL MUST select from the `{{#125-shopify-order-line-facts}}` data source (the `#125` needs to match exactly. The suffix can be different).
It is required that the model is referenced with any alias (e.g. `{{#125-shopify-order-line-facts}} as olf` or `{{#125-shopify-order-line-facts}} as orders`, etc.). We don't care about the specific alias used, as long as the model is referenced with an alias.
The SQL should include a comparison between the first order amount and the most recent order amount for each customer.
There can be multiple ways to achieve this (e.g. using window functions, subqueries, joins, etc.), but the key requirement is that the SQL logic correctly identifies customers whose first order amount is greater than their most recent order amount.
""",  # noqa: E501
    },
    {
        "message": "Show me customers where the first order was less expensive than the most recent one.",
        "model": SHOPIFY_ORDER_LINE_FACTS_MODEL,
        "expectation": """
The generated SQL MUST select from the `{{#125-shopify-order-line-facts}}` data source (the `#125` needs to match exactly. The suffix can be different).
It is required that the model is referenced with any alias (e.g. `{{#125-shopify-order-line-facts}} as olf` or `{{#125-shopify-order-line-facts}} as orders`, etc.). We don't care about the specific alias used, as long as the model is referenced with an alias.
The SQL should include a comparison between the first order amount and the most recent order amount for each customer.
There can be multiple ways to achieve this (e.g. using window functions, subqueries, joins, etc.), but the key requirement is that the SQL logic correctly identifies customers whose first order amount is less than their most recent order amount.
""",  # noqa: E501
    },
    {
        "message": "Show me refunds where the first customer refund was higher than the most recent refund",
        "model": SHOPIFY_REFUND_FACTS_MODEL,
        "expectation": """
The generated SQL MUST select from the `{{#135-shopify-refund-facts}}` data source (the `#135` needs to match exactly. The suffix can be different).
It is required that the model is referenced with any alias (e.g. `{{#135-shopify-refund-facts}} as rf` or `{{#135-shopify-refund-facts}} as refunds`, etc.). We don't care about the specific alias used, as long as the model is referenced with an alias.
The SQL should include a comparison between the first refund amount and the most recent refund amount for each customer.
There can be multiple ways to achieve this (e.g. using window functions, subqueries, joins, etc.), but the key requirement is that the SQL logic correctly identifies customers whose first refund amount is greater than their most recent refund amount.
""",  # noqa: E501
    },
    {
        "message": "How many customers ordered at least 2 different products",
        "model": SHOPIFY_ORDER_LINE_FACTS_MODEL,
        "expectation": """
The generated SQL MUST select from the `{{#125-shopify-order-line-facts}}` data source (the `#125` needs to match exactly. The suffix can be different).
It is required that the model is referenced with any alias (e.g. `{{#125-shopify-order-line-facts}} as olf` or `{{#125-shopify-order-line-facts}} as orders`, etc.). We don't care about the specific alias used, as long as the model is referenced with an alias.
The SQL should count the number of unique customers who have ordered at least 2 different products.
""",  # noqa: E501
    },
    {
        "message": "How many customers ordered at most 10 different products",
        "model": SHOPIFY_ORDER_LINE_FACTS_MODEL,
        "expectation": """
The generated SQL MUST select from the `{{#125-shopify-order-line-facts}}` data source (the `#125` needs to match exactly. The suffix can be different).
It is required that the model is referenced with any alias (e.g. `{{#125-shopify-order-line-facts}} as olf` or `{{#125-shopify-order-line-facts}} as orders`, etc.). We don't care about the specific alias used, as long as the model is referenced with an alias.
The SQL should count the number of unique customers who have ordered at most 10 different products.
""",  # noqa: E501
    },
]


def _generate_test_cases(cases_data: list[dict]):
    """
    Note that in those test cases the user is always mentioning the model in the message for now.
    """
    test_cases = []
    for case_data in cases_data:
        model = case_data["model"]
        context = DEFAULT_GLOBAL_CONTEXT_E2E.copy()
        # Give the user SQL query writing capabilities to test SQL generation from models
        context["capabilities"] = [
            MetabaseCapabilities.FRONTEND_NAVIGATE_USER_V1,
            MetabaseCapabilities.PERMISSION_SAVE_QUESTIONS,
            MetabaseCapabilities.PERMISSION_WRITE_SQL_QUERY,
        ]
        # For now, we make sure the model is mentioned in the message
        case_data["message"] = case_data["message"] + f" [{model.name}](metabase://model/{model.id})"

        test_case = E2EAgentTestCase(
            message=case_data["message"],
            context=context,
            metrics=[
                QueryUsesDatabase(database_id=2),
                QueryUsesModel(model_id=model.id),
                QuerySyntaxValid(),
                QueryRunsSuccessfully(),
                QueryMatchesDescription(query_description=case_data["expectation"]),
            ],
        )
        test_cases.append(test_case)
    return test_cases


sql_with_model_mentioned_benchmark = BenchmarkE2E(
    name="SQL with Models + @mention",
    test_cases=_generate_test_cases(cases),
    config=sql_gen_models_user_config,
)
