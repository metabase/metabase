import random
import sys
import time
import uuid
from pathlib import Path

import numpy as np
import pandas as pd
from tqdm import tqdm

from src.metrics import Benchmark
from src.core.results import EvalResults
from src.types import AgentProfileIDs


def pretty_report(results: pd.DataFrame, file_path: str):
    """Generate a clean result report for the failed cases"""
    benchmarks = results["benchmark"].unique()

    with open(file_path, "w") as f:
        for benchmark in benchmarks:
            f.write(f"# Benchmark: {benchmark}\n")
            benchmark_df = results[results["benchmark"] == benchmark]
            for _, row in benchmark_df.iterrows():
                f.write(f"## Test case: {row['test_case']}\n")
                if row.get("description"):
                    f.write(f"Description: {row['description']}\n")

                f.write("Input Messages:\n")
                message_history = row.get("message_history")
                if message_history:
                    for message in message_history[-1:]:
                        f.write(f"{message}\n")

                step_messages = row.get("agent_step_messages")
                f.write("\nThe agent took these steps:\n")
                if isinstance(step_messages, list):
                    for message in step_messages:
                        f.write(f"{message}\n")

                f.write(f"\nResponse: {row.get('response')}\n")

                metrics = row.get("metrics", [])
                for metric in metrics:
                    if metric["score"] == 1:
                        continue  # Skip passed metrics
                    f.write(f"\n### Metric: {metric['metric']}\n")
                    f.write(f"Score: {metric['score']}\n")
                    f.write(f"Reason: {metric['reason']}\n")

                f.write("\n\n")


def _create_summary_stats(
    multi_results: EvalResults,
    start_time_str: str,
    duration: float,
    sample: float | None,
    seed: int | None = None,
) -> str:
    """Create summary statistics from structured results."""
    total_score = multi_results.overall_score_percent
    total_passed = sum(b.passed_test_cases for b in multi_results.benchmark_results)
    total_cases = sum(b.total_test_cases for b in multi_results.benchmark_results)

    hallucination_rate = multi_results.overall_hallucination_rate
    hesitation_rate = multi_results.overall_hesitation_rate

    avg_duration = (
        sum(b.avg_duration for b in multi_results.benchmark_results) / len(multi_results.benchmark_results)
        if multi_results.benchmark_results
        else 0
    )

    # Format limit description
    if sample is None or sample == 1.0:
        limit_description = ""
    elif 0 < sample < 1.0:
        limit_description = f" (sampled {sample * 100:.0f}%)"
    else:
        limit_description = f" (limited to {int(sample)} cases per benchmark)"

    return f"""
Profile ID: {multi_results.profile_id}
Sample Size: {total_cases}{limit_description}
Seed: {seed}
Ran at: {start_time_str}
Duration: {duration:.2f} seconds

Total score: {total_score:.0f}% ({multi_results.total_score_abs:.0f}/{multi_results.total_metrics})
Passing Rate[^1]: {multi_results.overall_passing_rate * 100:.0f}% ({total_passed}/{total_cases})
Action Hallucination Rate[^2]: {hallucination_rate:.0f}%
Hesitation Rate[^3]: {hesitation_rate:.0f}%
Total token usage across all tests: {multi_results.total_token_usage}
Estimated costs: ${multi_results.total_costs:.3f}
Average response duration: {avg_duration:.2f} seconds

----------------
[^1]: The rate of test cases where all metrics for a test case have the maximum score.
[^2]: The rate of cases where the agent took wrong actions or actions when not needed.
[^3]: The rate of cases where the agent failed to take action when needed.
    """


async def run_benchmark(
    benchmarks: list[Benchmark],
    run_dir: Path,
    run_ts: str,
    profile_id: AgentProfileIDs = AgentProfileIDs.METABOT_EMBEDDING,
    sample: float | None = None,
    seed: int | None = None,
    case_filters: list[str] | None = None,
    benchmark_suite: str | None = None,
    metabase_version: str | None = None,
    ai_service_version: str | None = None,
    db_url: str | None = None,
) -> tuple[EvalResults, dict]:
    """Run benchmarks with the specified profile ID.

    Args:
        benchmarks: A list of benchmark instances to run.
        profile_id: The ID of the agent profile to use for the benchmark.
        sample: Sample the test cases per benchmark. Use 0-1 for fraction, >1 for count, 1.0 for all cases.
        seed: Random seed for sampling test cases.
        case_filters: List of patterns to filter test cases (case-insensitive substring match).
    """
    start_time = time.time()
    start_time_str = run_ts
    profile_id = AgentProfileIDs(profile_id)

    rng = random.Random(seed) if seed is not None else random.Random()

    if case_filters:
        original_count = sum(len(b.test_cases) for b in benchmarks)

        def matches_filter(test_case, patterns):
            """Check if test case matches any pattern in message, description, table_names, or reference_query."""
            searchable_fields = []

            if test_case.message:
                searchable_fields.append(test_case.message)

            if test_case.description:
                searchable_fields.append(test_case.description)

            for metric in test_case.metrics:
                if hasattr(metric, "table_names"):
                    searchable_fields.extend(metric.table_names)
                if hasattr(metric, "reference_query"):
                    searchable_fields.append(metric.reference_query)

            for pattern in patterns:
                pattern_lower = pattern.lower()
                for field in searchable_fields:
                    if pattern_lower in field.lower():
                        return True
            return False

        for benchmark in benchmarks:
            benchmark.test_cases = [tc for tc in benchmark.test_cases if matches_filter(tc, case_filters)]

        filtered_count = sum(len(b.test_cases) for b in benchmarks)

        # Remove benchmarks with no test cases after filtering
        benchmarks = [b for b in benchmarks if len(b.test_cases) > 0]

        if not benchmarks:
            print(f"No test cases found matching patterns: {case_filters}", file=sys.stderr)
            print(f"Tried filtering {original_count} test case(s)", file=sys.stderr)
            sys.exit(1)

        print(f"Filtered test cases from {original_count} to {filtered_count} using patterns: {case_filters}")

    if sample is not None:
        if sample <= 0:
            raise ValueError("Sample must be a positive number.")

        if sample == 1.0:
            benchmark_case_count = sum(len(b.test_cases) for b in benchmarks)
            print(
                f"You are about to run all {benchmark_case_count} test cases for all benchmarks.\n"
                "This may take a long time and cost a lot."
            )
            input_confirm = input("Are you sure you want to continue? (y/N): ")
            if input_confirm.lower() != "y":
                print("Benchmark run cancelled by user.")
                sys.exit(0)
        else:
            for benchmark in benchmarks:
                if 0 < sample < 1.0:
                    size = int(np.ceil(len(benchmark.test_cases) * sample))
                else:
                    size = min(int(sample), len(benchmark.test_cases))
                benchmark.test_cases = rng.sample(benchmark.test_cases, k=size)

    total_test_cases = sum(len(b.test_cases) for b in benchmarks)
    if sample is None or sample == 1.0:
        sample_str = "all cases"
    elif 0 < sample < 1.0:
        sample_str = f"{sample * 100:.1f}% sample"
    else:
        sample_str = f"{int(sample)} per benchmark"

    print(
        f"Running {len(benchmarks)} benchmarks with {total_test_cases} total cases "
        f"(sample: {sample_str} ; seed: {seed}) | Profile: {profile_id.value}"
    )
    print()

    test_case_kwargs = {
        "profile_id": profile_id,
    }

    for benchmark in tqdm(benchmarks, unit="benchmark", desc="Running Benchmarks"):
        tqdm.write(f"Starting benchmark: {benchmark.name}")
        await benchmark.run(test_case_kwargs=test_case_kwargs)

    duration = time.time() - start_time
    multi_results = EvalResults(profile_id=profile_id.value, benchmark_results=[b.get_result() for b in benchmarks])

    run_dir = Path(run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)

    summary_df = multi_results.to_summary_dataframe()
    summary_df_sorted = summary_df.sort_values("benchmark")
    summary_df_sorted.to_csv(str(run_dir / "summary.csv"), index=False)
    summary_df = summary_df_sorted.drop(columns=["score_percent"])

    detail_table_string = summary_df.to_markdown(index=False)
    summary_string = _create_summary_stats(
        multi_results=multi_results,
        start_time_str=start_time_str,
        duration=duration,
        sample=sample,
        seed=seed,
    )

    detailed_df = multi_results.to_detailed_dataframe()
    failed_cases = detailed_df[detailed_df["score"] < 1]
    pretty_report(failed_cases, str(run_dir / "failed_cases.txt"))

    pd.set_option("display.max_colwidth", None)
    print("################# Benchmark Results #################")
    print(detail_table_string)
    print(summary_string)

    run_log = f"""
Ran at: {start_time_str}
Profile ID: {profile_id}

# Results
{detail_table_string}

{summary_string}
"""
    with open(run_dir / "run.log", "w") as f:
        f.write(run_log)

    run_id = uuid.uuid4().hex

    multi_results.export_csvs(
        run_dir=run_dir,
        run_id=run_id,
        benchmark_suite=benchmark_suite,
        ai_service_version=ai_service_version,
        metabase_version=metabase_version,
        sample=sample,
        seed=seed,
        duration=duration,
        ran_at=start_time_str,
    )

    if db_url:
        try:
            from src.core.db_upload import upload_benchmark_results

            print(f"\nUploading results to database: {db_url.split('@')[-1] if '@' in db_url else db_url}")
            await upload_benchmark_results(db_url=db_url, run_dir=run_dir)
            print("Database upload completed successfully\n")
        except Exception as e:
            print(f"\nDatabase upload failed: {e}")
            print("Results were still saved to CSV files.\n")

    metadata = {
        "profile": profile_id.value,
        "ran_at": start_time_str,
        "duration_in_seconds": duration,
        "ai_service_version": ai_service_version,
        "metabase_version": metabase_version,
        "benchmark_suite": benchmark_suite,
        "sample_size": sample,
        "seed": seed,
        "overall_score_percent": multi_results.overall_score_percent,
        "overall_passing_rate": multi_results.overall_passing_rate,
        "overall_hallucination_rate": multi_results.overall_hallucination_rate,
        "overall_hesitation_rate": multi_results.overall_hesitation_rate,
        "total_token_usage": multi_results.total_token_usage,
        "estimated_costs": multi_results.total_costs,
    }
    return multi_results, metadata
