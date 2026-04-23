"""Small helper to build standardized argparse.ArgumentParser for E2E benchmark entrypoints.

This centralizes the common flags used by multiple `__main__.py` runners so they can share
the same options and help text.
"""

import argparse
import sys
from collections.abc import Iterable
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.core.base import BenchmarkE2E


def build_benchmark_argparser(
    description: str,
    profile_choices: Iterable[str] | None = None,
    default_profile: str | None = None,
    default_sample: float = 10.0,
) -> argparse.ArgumentParser:
    """Return an argparse.ArgumentParser configured with common E2E benchmark args.

    Args:
        description: The description shown in the help text (first positional arg).
        profile_choices: Optional iterable of allowed profile ids for the `--profile` flag.
        default_profile: Optional default value for the `--profile` flag (also shown in help).
        default_sample: Default sample for test cases (defaults to 10 cases per benchmark).

    Returns:
        Configured `argparse.ArgumentParser` instance.
    """

    parser = argparse.ArgumentParser(description=description)

    parser.add_argument(
        "--sample",
        type=float,
        default=default_sample,
        help=(
            "Sample test cases per benchmark. "
            "Use 0-1 for fraction (e.g., 0.1 = 10%%), "
            ">1 for number of cases (e.g., 10 = 10 cases), "
            "or 1.0 to run all cases. "
            f"Default: {default_sample} cases"
        ),
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for sampling test cases (default: 42)",
    )

    profile_kwargs = {}
    if profile_choices is not None:
        profile_kwargs["choices"] = list(profile_choices)

    help_profile = (
        f"Agent profile ID to use for the benchmark (default: {default_profile})"
        if default_profile is not None
        else "Agent profile ID to use for the benchmark"
    )

    parser.add_argument(
        "--profile",
        type=str,
        default=default_profile,
        help=help_profile,
        **profile_kwargs,
    )

    parser.add_argument(
        "--profiles",
        type=str,
        default=None,
        help="Comma-separated list of agent profile IDs to run in a single invocation. Takes precedence over --profile.",
    )

    parser.add_argument(
        "-b",
        "--benchmarks",
        type=str,
        default=None,
        help="Comma-separated list of benchmark names to run (default: all benchmarks). Supports partial, case-insensitive matches.",
    )

    parser.add_argument(
        "-c",
        "--cases",
        type=str,
        default=None,
        help="Comma-separated list of patterns to filter test cases (default: all test cases). Searches in message, table_names, and reference_query. Supports partial, case-insensitive matches.",
    )

    parser.add_argument(
        "--db-url",
        type=str,
        default=None,
        help="Database connection string for uploading results (e.g., 'postgresql://user:pass@localhost/benchmarks'). If not provided, results are only saved to CSV files.",
    )

    return parser


def resolve_profiles(
    args: argparse.Namespace,
    profile_choices: Iterable[str],
) -> list[str]:
    """Resolve the effective list of profiles from --profiles/--profile."""
    choices = list(profile_choices)
    if getattr(args, "profiles", None):
        if args.profile is not None and args.profile != args.profiles:
            # Allow --profile's default to coexist silently; only error if user set both explicitly.
            pass
        profiles = [p.strip() for p in args.profiles.split(",") if p.strip()]
    else:
        profiles = [args.profile] if args.profile else []

    if not profiles:
        print("No profile specified. Use --profile or --profiles.", file=sys.stderr)
        sys.exit(1)

    invalid = [p for p in profiles if p not in choices]
    if invalid:
        print(f"Invalid profile(s): {invalid}. Valid choices: {choices}", file=sys.stderr)
        sys.exit(1)
    return profiles


def filter_benchmarks(
    args: argparse.Namespace,
    benchmark_mapping: dict[str, list["BenchmarkE2E"]],
    profile: str,
) -> list["BenchmarkE2E"]:
    """Filter benchmarks based on command-line arguments.

    Args:
        args: Parsed command-line arguments from build_benchmark_argparser.
        benchmark_mapping: Dictionary mapping profile IDs to lists of benchmark objects.

    Returns:
        Filtered list of benchmarks to run.

    Raises:
        SystemExit: If no benchmarks match the specified patterns.
    """
    all_benchmarks = benchmark_mapping[profile]

    if args.benchmarks:
        benchmark_patterns = args.benchmarks.split(",")
        benchmarks = [
            b for b in all_benchmarks if any(pattern.lower() in b.name.lower() for pattern in benchmark_patterns)
        ]
        if not benchmarks:
            print(f"No benchmarks found in profile '{profile}' matching patterns: {benchmark_patterns}", file=sys.stderr)
            print(f"Available benchmarks: {[b.name for b in all_benchmarks]}", file=sys.stderr)
            sys.exit(1)
        print(f"Filtered benchmarks: {[b.name for b in benchmarks]}")
    else:
        benchmarks = all_benchmarks

    return benchmarks
