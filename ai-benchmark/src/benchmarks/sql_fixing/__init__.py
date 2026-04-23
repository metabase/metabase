import json
from pathlib import Path

from src.benchmarks.helpers import sql_user_config
from src.core.base import BenchmarkE2E
from src.core.test_case import DEFAULT_GLOBAL_CONTEXT_E2E, E2EAgentTestCase
from src.metrics import (
    QueryMatchesReference,
    QueryRunsSuccessfully,
    QuerySyntaxValid,
    QueryUsesDatabase,
    QueryUsesModel,
)


def construct_sql_fixing_case(
    broken_query: str,
    fixed_query: str,
    database_id: int = 2,
    error_message: str | None = None,
    description: str | None = None,
    used_models: list[int] | None = None,
) -> E2EAgentTestCase:
    """Constructs an E2EAgentTestCase for SQL fixing benchmark."""
    # NOTE: It is important that the context contains the capability to run native queries!
    context = {
        **DEFAULT_GLOBAL_CONTEXT_E2E,
        "user_is_viewing": [
            {
                "type": "adhoc",
                "query": {
                    "lib/type": "mbql/query",
                    "stages": [
                        {
                            "lib/type": "mbql.stage/native",
                            "native": broken_query,
                            "template-tags": {},
                        }
                    ],
                    "database": database_id,
                },
                "sql_engine": "postgres",
                "error": error_message,
            },
            {
                "type": "code_editor",
                "buffers": [
                    {
                        "id": "benchmark-sql-buffer",
                        "source": {
                            "language": "sql",
                            "database_id": database_id,
                        },
                        "cursor": {
                            "line": 1,
                            "column": 1,
                        },
                        "selection": None,
                    }
                ],
            },
        ],
    }
    metrics = [
        QueryUsesDatabase(database_id=database_id),
        QuerySyntaxValid(),
        QueryRunsSuccessfully(),
        QueryMatchesReference(
            reference_query=fixed_query,
        ),
    ]

    # Add QueryUsesModel metric for each model in used_models
    if used_models:
        for model_id in used_models:
            metrics.append(QueryUsesModel(model_id=model_id))

    return E2EAgentTestCase(
        description=description,
        context=context,
        message="Fix this SQL",
        metrics=metrics,
    )


def load_test_cases_from_json(test_cases_dir: str | Path = "test_cases/postgres") -> list[E2EAgentTestCase]:
    """Load SQL fixing test cases from JSON files in the specified directory.

    Args:
        test_cases_dir: Path to directory containing JSON test case files.
                       Can be absolute or relative to this file's parent directory.
                       Defaults to "test_cases/postgres".

    Returns:
        List of E2EAgentTestCase objects loaded from JSON files.
    """
    # Convert to Path object if string
    if isinstance(test_cases_dir, str):
        test_cases_dir = Path(test_cases_dir)

    # If relative path, resolve relative to this file's parent directory
    if not test_cases_dir.is_absolute():
        base_dir = Path(__file__).parent / test_cases_dir
    else:
        base_dir = test_cases_dir

    test_cases = []

    # Get all JSON files in the specified directory
    json_files = sorted(base_dir.glob("*.json"))

    for json_file in json_files:
        try:
            with open(json_file) as f:
                cases = json.load(f)

            # Each file contains an array of test case objects
            for case in cases:
                # All fields are required except used_tables and used_models can be empty
                description = case["description"]
                # used_tables = case.get("used_tables", [])
                used_models = case.get("used_models", [])
                fixed_query = case["fixed_query"]
                broken_query = case["broken_query"]
                error_message = case["error_message"]

                # Validate that required fields are not empty
                if not description:
                    raise ValueError(f"Empty description in {json_file}")
                if not fixed_query:
                    raise ValueError(f"Empty fixed_query in {json_file}")
                if not broken_query:
                    raise ValueError(f"Empty broken_query in {json_file}")
                if not error_message:
                    raise ValueError(f"Empty error_message in {json_file}")

                test_case = construct_sql_fixing_case(
                    description=description,
                    broken_query=broken_query,
                    fixed_query=fixed_query,
                    error_message=error_message if error_message else None,
                    used_models=used_models if used_models else None,
                )
                test_cases.append(test_case)

        except Exception as e:
            # Re-raise with more context
            raise RuntimeError(f"Error processing {json_file}: {e}") from e

    return test_cases


# Load all test cases from JSON files
test_cases = load_test_cases_from_json()

sql_fixing_benchmark = BenchmarkE2E(
    name="SQL Fixing",
    test_cases=test_cases,
    # NOTE: We use the user who has permissions to run native queries
    config=sql_user_config,
)
