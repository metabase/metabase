"""Database upload functionality for benchmark results.

This module handles uploading benchmark results to a PostgreSQL database.
Results are stored in the 'metabot_benchmark' schema with three tables:
- benchmark_runs
- test_case_results
- metric_results

Usage:
    await upload_benchmark_results(
        db_url="postgresql://user:pass@localhost/benchmarks",
        run_dir="./logs/metabot_internal__2025-11-27/",
    )

    Or from CLI:
    python benchmarks/db_upload.py --db-url "postgresql://user:pass@localhost/benchmarks" --run-dir "./logs/metabot_internal__2025-11-27/"
"""

import argparse
import asyncio
import logging
from pathlib import Path

import pandas as pd
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    create_engine,
    text,
)
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)


def create_benchmark_schema(engine) -> tuple[Table, Table, Table]:
    """Create the benchmark results schema if it doesn't exist.

    Creates the 'metabot_benchmark' schema and three tables within it:
    - metabot_benchmark.benchmark_runs: One row per benchmark run
    - metabot_benchmark.test_case_results: One row per test case execution
    - metabot_benchmark.metric_results: One row per metric evaluation

    Args:
        engine: SQLAlchemy engine (must be PostgreSQL)

    Returns:
        Tuple of (benchmark_runs, test_case_results, metric_results) Table objects

    Raises:
        ValueError: If the database is not PostgreSQL
    """
    if engine.dialect.name != "postgresql":
        raise ValueError(f"Only PostgreSQL is supported. Got: {engine.dialect.name}")

    # Create schema if it doesn't exist
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS metabot_benchmark"))
        conn.commit()

    metadata = MetaData(schema="metabot_benchmark")

    benchmark_runs = Table(
        "benchmark_runs",
        metadata,
        Column("run_id", String(32), primary_key=True),
        Column("profile_id", String(255), nullable=False),
        Column("benchmark_suite", String(255)),
        Column("ai_service_version", String(255)),
        Column("metabase_version", String(255)),
        Column("sample_size", Float),
        Column("seed", Integer),
        Column("ran_at", DateTime),
        Column("duration_in_seconds", Float),
        Column("total_score", Float),
        Column("passing_rate", Float),
        Column("hallucination_rate_percentage", Float),
        Column("total_token_usage", Integer),
        Column("estimated_costs", Float),
        Column("average_response_duration", Float),
    )

    test_case_results = Table(
        "test_case_results",
        metadata,
        Column("test_case_run_id", String(255), primary_key=True),
        Column("test_case_id", String(255), nullable=False),
        Column("run_id", String(32), ForeignKey("benchmark_runs.run_id"), nullable=False),
        Column("benchmark_name", String(255), nullable=False),
        Column("test_case_difficulty", String(50)),
        Column("has_passed", Boolean),
        Column("score", Float),
        Column("token_usage", Integer),
        Column("estimated_costs", Float),
        Column("response_duration", Float),
    )

    metric_results = Table(
        "metric_results",
        metadata,
        # No explicit primary key - use auto-incrementing ID if database supports it
        Column("id", Integer, primary_key=True, autoincrement=True),
        Column("run_id", String(32), ForeignKey("benchmark_runs.run_id"), nullable=False),
        Column("test_case_run_id", String(255), ForeignKey("test_case_results.test_case_run_id"), nullable=False),
        Column("test_case_difficulty", String(50)),
        Column("metric_name", String(255), nullable=False),
        Column("metric_category", String(255)),
        Column("metric_score", Float),
        Column("is_action_needed", Integer),
        Column("is_action_hallucination", Integer),
        Column("is_hesitation", Integer),
        Column("is_action_evaluated", Integer),
    )

    # Create tables if they don't exist
    metadata.create_all(engine)

    return benchmark_runs, test_case_results, metric_results


def filter_dataframe_to_schema(
    df: pd.DataFrame,
    table: Table,
) -> pd.DataFrame:
    """Filter a DataFrame to only include columns that exist in the database table schema.

    Args:
        df: DataFrame to filter
        table: SQLAlchemy Table object with the target schema

    Returns:
        Filtered DataFrame with only columns that exist in the schema
    """
    schema_columns = [col.name for col in table.columns]
    df_filtered = df[[col for col in df.columns if col in schema_columns]]

    if len(df.columns) != len(df_filtered.columns):
        dropped = set(df.columns) - set(df_filtered.columns)
        logger.warning(f"Dropping columns not in schema: {dropped}")

    return df_filtered


async def upload_benchmark_results(
    db_url: str,
    run_dir: str | Path,
) -> None:
    """Upload benchmark results from CSV files to a database.

    This function:
    1. Creates the schema if it doesn't exist
    2. Reads the three CSV files from the run directory
    3. Uploads them to the database tables

    Args:
        db_url: Database connection string (e.g., "postgresql://user:pass@localhost/db")
        run_dir: Path to the directory containing the CSV files

    Raises:
        FileNotFoundError: If required CSV files are missing
        SQLAlchemyError: If database operations fail
    """
    run_dir = Path(run_dir)

    # Check that CSV files exist
    csv_files = {
        "benchmark_run": run_dir / "benchmark_run.csv",
        "test_case_results": run_dir / "test_case_results.csv",
        "metric_results": run_dir / "metric_results.csv",
    }

    for _, path in csv_files.items():
        if not path.exists():
            raise FileNotFoundError(f"Required CSV file not found: {path}")

    try:
        # Create database engine
        logger.info(f"Connecting to database: {db_url.split('@')[-1] if '@' in db_url else db_url}")
        engine = create_engine(db_url)

        # Create schema
        logger.info("Creating/verifying database schema...")
        benchmark_runs_table, test_case_results_table, metric_results_table = create_benchmark_schema(engine)

        # Upload benchmark_run
        logger.info("Uploading benchmark run data...")
        df_run = pd.read_csv(csv_files["benchmark_run"])
        df_run_filtered = filter_dataframe_to_schema(df_run, benchmark_runs_table)
        df_run_filtered.to_sql("benchmark_runs", engine, schema="metabot_benchmark", if_exists="append", index=False)
        logger.info(f"✓ Uploaded {len(df_run_filtered)} benchmark run(s)")

        # Upload test_case_results
        logger.info("Uploading test case results...")
        df_test_cases = pd.read_csv(csv_files["test_case_results"])
        df_test_cases_filtered = filter_dataframe_to_schema(df_test_cases, test_case_results_table)
        df_test_cases_filtered.to_sql(
            "test_case_results", engine, schema="metabot_benchmark", if_exists="append", index=False
        )
        logger.info(f"✓ Uploaded {len(df_test_cases_filtered)} test case result(s)")

        # Upload metric_results
        logger.info("Uploading metric results...")
        df_metrics = pd.read_csv(csv_files["metric_results"])
        df_metrics_filtered = filter_dataframe_to_schema(df_metrics, metric_results_table)
        df_metrics_filtered.to_sql(
            "metric_results", engine, schema="metabot_benchmark", if_exists="append", index=False
        )
        logger.info(f"✓ Uploaded {len(df_metrics_filtered)} metric result(s)")

        logger.info("✓ Successfully uploaded all benchmark results to database")

    except SQLAlchemyError as e:
        logger.error(f"Database error during upload: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during database upload: {e}")
        raise
    finally:
        if "engine" in locals():
            engine.dispose()


def main() -> None:
    """CLI entry point for uploading benchmark results to a database."""
    parser = argparse.ArgumentParser(
        description="Upload benchmark results from CSV files to a PostgreSQL database.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Usage:
  python benchmarks/db_upload.py --db-url "postgresql://user:pass@localhost/benchmarks" --run-dir "./logs/metabot_internal__2025-11-27/"
        """,
    )

    parser.add_argument(
        "--db-url",
        type=str,
        required=True,
        help="Database connection string (e.g., postgresql://user:pass@localhost/db)",
    )

    parser.add_argument(
        "--run-dir",
        type=str,
        required=True,
        help="Path to the directory containing benchmark CSV files",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    asyncio.run(upload_benchmark_results(db_url=args.db_url, run_dir=args.run_dir))


if __name__ == "__main__":
    main()
