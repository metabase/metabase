from src.benchmarks.context import viewing_table_context
from src.benchmarks.helpers import default_user_config, get_benchmark_table
from src.core.base import BenchmarkE2E
from src.core.test_case import DEFAULT_GLOBAL_CONTEXT_E2E, E2EAgentTestCase
from src.metrics import ResponseCorrectnessE2E, ToolCorrectnessE2E

test_prompts = [
    # Basic "How do I" Questions
    "How can I subtract dates?",
    "How do I create variables?",
    "How do I calculate the percent of total?",
    "How can I cast a numeric field to string?",
    "How do I create a date range selection parameter based on a field in the model?",
    "How do I add days to a date?",
    "How do I format dates as month and year?",
    "How do I create a custom column?",
    "How to sum a total for a table?",
    "How do I count distinct values?",
    # Product Feature Questions
    "Is there an AI feature on Metabase?",
    "Can I create a column and change its type to integer?",
    "Can I see if a question is being used in a dashboard somewhere?",
    "Can I update a card query using metabase API?",
    "Can I share a dashboard via a public url?",
    "How do I create alerts?",
    "How to export as PDF?",
    "How do I embed a dashboard?",
    "How to upload CSV files?",
    "Can I customize colors?",
    # "What is" Questions
    "What is metrics exactly?",
    "What's the difference between COUNT and SUM?",
    "What are models used for?",
    "What are the parameters for get cards api?",
    "What port does metabase run on?",
    "What are the system requirements?",
    "What is a model in metabase?",
    "What permissions are available?",
    # Configuration/Setup Questions
    "How to increase query execution time on Metabase?",
    "How to set filter in dashboard to current date?",
    "How to enable password reset even for when user is single sign on?",
    "How do I use variables in SQL queries?",
    "How to set up database connections?",
    "How do I configure email alerts?",
    # Data Operations
    "How to create a percentage column?",
    "How do I filter data by date range?",
    "How can I calculate the difference between two timestamps?",
    "How to convert timestamp to date?",
    "How can I get the current date in a custom column?",
    "How to use count in custom column?",
    # Technical Questions
    "How does caching work?",
    "How to troubleshoot slow queries?",
    "How do I backup my data?",
    "How to join data from multiple databases?",
    # Edge Cases & Vague Questions
    "How often are dashboards updated/refreshed?",
    "How do I create a pivot table?",
    "How to create interactive dashboards?",
    "Can I connect to Google Sheets?",
    "How do I schedule reports?",
]

is_viewing_stripe_plan_context = DEFAULT_GLOBAL_CONTEXT_E2E.copy()
is_viewing_stripe_plan_context["user_is_viewing"] = [
    viewing_table_context(get_benchmark_table("stripe_data.plan"))
]

test_cases = [
    *[
        E2EAgentTestCase(
            message=prompt,
            metrics=[
                ToolCorrectnessE2E(
                    expected_tool_calls=[{"name": "search_metabase_documentation"}],
                )
            ],
        )
        for prompt in test_prompts
    ],
    E2EAgentTestCase(
        message="How would I calculate ARR with a custom expression here?",
        context=is_viewing_stripe_plan_context,
        metrics=[
            ToolCorrectnessE2E(
                expected_tool_calls=[{"name": "search_metabase_documentation"}],
            ),
            ResponseCorrectnessE2E(
                expectation="""
The response should contain the following formula:
```
case(
  [Interval] = "month", [Amount] * [Interval Count] * 12,
  [Interval] = "year", [Amount] * [Interval Count],
  [Interval] = "week", [Amount] * [Interval Count] * 52,
  [Interval] = "day", [Amount] * [Interval Count] * 365,
  0
)
```
Other content is not evaluated for correctness. We only care about the presence of the above formula at least once.
"""
            ),
        ],
    ),
]


documentation_search_benchmark = BenchmarkE2E(
    name="Documentation Search E2E",
    test_cases=test_cases,
    config=default_user_config,
)
