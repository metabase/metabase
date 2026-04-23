import asyncio
import time
import warnings
from pathlib import Path

from src import cli
from src.benchmarks import helpers, sql_fixing
from src.benchmarks.nlq import query_metric, query_table
from src.benchmarks.search import data_asset, documentation
from src.benchmarks.sql_generation import dbt, enriched_tables, model_sql_gen, raw_tables, single_table_only
from src.core import executor
from src.core.results import export_combined_json
from src.types import AgentProfileIDs

# Suppress Pydantic serialization warnings from litellm's response types
warnings.filterwarnings("ignore", message="Pydantic serializer warnings")


NLQ_BENCHMARKS = [
    # query_table.aggregations_table_mentioned,
    # query_table.aggregations_user_viewing_table,
    # query_table.aggregations_no_context,
    # query_table.categorical_filters_table_mentioned,
    query_table.categorical_filters_user_viewing_table,
    # query_table.categorical_filters_no_context,
    # query_table.numeric_filters_table_mentioned,
    # query_table.numeric_filters_user_viewing_table,
    # query_table.numeric_filters_no_context,
    # query_table.temporal_filters_table_mentioned,
    # query_table.temporal_filters_user_viewing_table,
    # query_table.temporal_filters_no_context,
    # query_table.grouping_table_mentioned,
    # query_table.grouping_user_viewing_table,
    # query_table.grouping_no_context,
    # query_table.sorting_and_limits_table_mentioned,
    # query_table.sorting_and_limits_user_viewing_table,
    # query_table.sorting_and_limits_no_context,
    # query_table.complex_combined_queries_table_mentioned,
    # query_table.complex_combined_queries_user_viewing_table,
    # query_table.complex_combined_queries_no_context,
    # query_table.measures_and_segments_table_mentioned,
    # query_table.measures_and_segments_user_viewing_table,
    # query_table.measures_and_segments_no_context,
    # query_metric.categorical_filters_mentioning_metric,
    # query_metric.categorical_filters_no_context,
    # query_metric.categorical_filters_viewing_metric,
    # query_metric.complex_combined_mentioning_metric,
    # query_metric.complex_combined_no_context,
    # query_metric.complex_combined_viewing_metric,
    query_metric.dimensional_breakdown_mentioning_metric,
    # query_metric.dimensional_breakdown_no_context,
    # query_metric.dimensional_breakdown_viewing_metric,
    # query_metric.numeric_filters_mentioning_metric,
    # query_metric.numeric_filters_no_context,
    # query_metric.numeric_filters_viewing_metric,
    # query_metric.simple_metric_aggregation_mentioning_metric,
    # query_metric.simple_metric_aggregation_no_context,
    # query_metric.simple_metric_aggregation_viewing_metric,
    # query_metric.temporal_filters_mentioning_metric,
    # query_metric.temporal_filters_no_context,
    # query_metric.temporal_filters_viewing_metric,
    # query_metric.temporal_grouping_mentioning_metric,
    # query_metric.temporal_grouping_no_context,
    # query_metric.temporal_grouping_viewing_metric,
    # query_metric.measures_and_segments_mentioning_metric,
    # query_metric.measures_and_segments_no_context,
    # query_metric.measures_and_segments_viewing_metric,
]

# SQL benchmarks for profiles that require user to be in the SQL editor
SQL_BENCHMARKS = [
    # sql_fixing.sql_fixing_benchmark,
    # raw_tables.sql_raw_l1_no_context,
    # raw_tables.sql_raw_l2_no_context,
    # raw_tables.sql_raw_l3_no_context,
    # enriched_tables.sql_enriched_l1_no_context,
    # enriched_tables.sql_enriched_l2_no_context,
    # enriched_tables.sql_enriched_l3_no_context,
    # raw_tables.sql_raw_l1_viewing_editor,
    # raw_tables.sql_raw_l2_viewing_editor,
    # raw_tables.sql_raw_l3_viewing_editor,
    # enriched_tables.sql_enriched_l1_viewing_editor,
    # enriched_tables.sql_enriched_l2_viewing_editor,
    # enriched_tables.sql_enriched_l3_viewing_editor,
    raw_tables.sql_raw_l1_with_mentions,
    # raw_tables.sql_raw_l2_with_mentions,
    # raw_tables.sql_raw_l3_with_mentions,
    # enriched_tables.sql_enriched_l1_with_mentions,
    enriched_tables.sql_enriched_l2_with_mentions,
    # enriched_tables.sql_enriched_l3_with_mentions,
    # single_table_only.sql_one_table_source_raw,
    # single_table_only.sql_one_table_source_raw_with_mention,
    # single_table_only.sql_one_table_source_raw_viewing_table,
    # single_table_only.sql_one_table_source_enriched,
    # single_table_only.sql_one_table_source_enriched_with_mention,
    # single_table_only.sql_one_table_source_enriched_viewing_table,
    # single_table_only.sql_one_table_source_raw_viewing_editor,
    # single_table_only.sql_one_table_source_raw_viewing_editor_with_mention,
    # single_table_only.sql_one_table_source_enriched_viewing_editor,
    # single_table_only.sql_one_table_source_enriched_viewing_editor_with_mention,
    # model_sql_gen.sql_with_model_mentioned_benchmark,
    # dbt.dbt_grain_semantics_viewing_editor,
    # dbt.dbt_multi_hop_joins_viewing_editor,
    # dbt.dbt_scd_temporal_logic_viewing_editor,
]

INTERNAL_BENCHMARKS = [
    *NLQ_BENCHMARKS,
    *SQL_BENCHMARKS,
    # Deprecated since doc search not available in CLJ metabot
    # documentation.documentation_search_benchmark,
    data_asset.data_asset_search_benchmark,
]

BENCHMARK_MAPPING = {
    AgentProfileIDs.METABOT_INTERNAL: INTERNAL_BENCHMARKS,
    AgentProfileIDs.METABOT_NEXT: INTERNAL_BENCHMARKS,
    AgentProfileIDs.METABOT_NLQ: NLQ_BENCHMARKS,
    AgentProfileIDs.METABOT_SQL: SQL_BENCHMARKS,
}

def main():
    parser = cli.build_benchmark_argparser(
        description="Run the canonical benchmark.",
        profile_choices=list(BENCHMARK_MAPPING.keys()),
        default_profile=AgentProfileIDs.METABOT_INTERNAL,
        default_sample=10,
    )

    args = parser.parse_args()

    profiles = cli.resolve_profiles(args, list(BENCHMARK_MAPPING.keys()))
    case_filters = args.cases.split(",") if args.cases else None

    ai_service_version = helpers.get_ai_service_version()
    metabase_version = asyncio.run(helpers.get_metabase_version())
    gh_branch = helpers.get_git_branch()
    gh_commit_sha = helpers.get_git_commit_sha()

    benchmark_suite = "canonical_benchmark"

    run_ts = time.strftime("%Y-%m-%dT%H%M%S", time.localtime())
    run_dir = Path(f"./logs/run__{run_ts}")
    run_dir.mkdir(parents=True, exist_ok=True)

    per_profile_runs: list[tuple] = []
    for profile in profiles:
        raw = cli.filter_benchmarks(args, BENCHMARK_MAPPING, profile)
        benchmarks = [b.model_copy(deep=True) for b in raw]

        try:
            results, profile_meta = asyncio.run(
                executor.run_benchmark(
                    profile_id=profile,
                    benchmarks=benchmarks,
                    sample=args.sample,
                    seed=args.seed,
                    case_filters=case_filters,
                    ai_service_version=ai_service_version,
                    metabase_version=metabase_version,
                    benchmark_suite=benchmark_suite,
                    db_url=args.db_url,
                    run_dir=run_dir / profile,
                    run_ts=run_ts,
                )
            )
            profile_meta["gh_branch"] = gh_branch
            profile_meta["gh_commit_sha"] = gh_commit_sha
            per_profile_runs.append((results, profile_meta))
        except Exception as e:
            print(f"\nProfile '{profile}' failed: {e}")
            from src.core.results import EvalResults
            empty = EvalResults(profile_id=profile, benchmark_results=[])
            per_profile_runs.append((empty, {
                "profile": profile,
                "gh_branch": gh_branch,
                "gh_commit_sha": gh_commit_sha,
                "ran_at": run_ts,
                "error": str(e),
            }))

    export_combined_json(run_dir / "results.json", per_profile_runs)
    print(f"\nCombined results written to: {run_dir / 'results.json'}")


if __name__ == "__main__":
    main()
