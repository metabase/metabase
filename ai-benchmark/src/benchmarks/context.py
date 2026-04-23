"""Centralized UI context generators for benchmark test cases.

This module provides pure functions for generating viewing contexts that simulate
different UI states in Metabase (viewing a table, metric, or SQL editor).
"""

from src.benchmarks.helpers import MetricMetadata, TableMetadata


def viewing_table_context(table: TableMetadata, database_id: int = 2) -> dict:
    """Generate context for user viewing a table in the UI."""
    return {
        "type": "adhoc",
        "query": {
            "database": database_id,
            "lib/type": "mbql/query",
            "stages": [{"lib/type": "mbql.stage/mbql", "source-table": table.id}],
        },
        "chart_configs": [
            {
                "series": {},
                "timeline_events": [],
                "query": {
                    "database": database_id,
                    "lib/type": "mbql/query",
                    "stages": [{"lib/type": "mbql.stage/mbql", "source-table": table.id}],
                },
                "display_type": "table",
            }
        ],
    }


def viewing_metric_context(metric: MetricMetadata) -> dict:
    """Generate context for user viewing a metric."""
    return {
        "id": metric.id,
        "type": "metric",
        "query": None,
        "chart_configs": [],
    }


def viewing_sql_editor_context(database_id: int = 2) -> dict:
    """Generate context for user in SQL editor.

    Returns a list of viewing contexts: one for the adhoc query and one for the code editor.
    """
    return [
        {
            "type": "adhoc",
            "query": {
                "lib/type": "mbql/query",
                "stages": [
                    {
                        "lib/type": "mbql.stage/native",
                        "native": "",
                        "template-tags": {},
                    }
                ],
                "database": database_id,
            },
            "sql_engine": "postgres",
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
    ]


def add_entity_mention(message: str, entity: TableMetadata | MetricMetadata) -> str:
    """Append markdown entity reference to message."""
    if isinstance(entity, TableMetadata):
        return f"{message} [{entity.display_name}](metabase://table/{entity.id})"
    else:
        return f"{message} [{entity.name}](metabase://metric/{entity.id})"
