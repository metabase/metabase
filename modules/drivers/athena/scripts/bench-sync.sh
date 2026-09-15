#!/usr/bin/env bash
# Athena sync benchmark harness.
# Times the legacy per-table metadata path (getSchemas/getTables/getColumns —
# what Metabase's describe-table does today) against the fast-path
# information_schema.columns query, and reports streaming behavior + heap use
# of the thin JDBC driver at scale.
#
# POSIX-compatible: runs under sh/dash as well as bash.
#
# Env contract (same as the athena test suite):
#   MB_ATHENA_TEST_REGION          required
#   MB_ATHENA_TEST_ACCESS_KEY      required with SECRET_KEY, or both unset
#   MB_ATHENA_TEST_SECRET_KEY      for the default AWS credential chain
#   MB_ATHENA_TEST_S3_STAGING_DIR  required, s3:// bucket/prefix for results
#   MB_ATHENA_TEST_CATALOG         optional (defaults to AwsDataCatalog)
#   MB_ATHENA_TEST_IGNORE_DBS      optional comma-separated schemas to skip
#
# Usage:
#   bench-sync.sh --help
#   bench-sync.sh --full [--dry-run] [--tables N] [--mode legacy|fast|all]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
MODULE_DIR="$(cd "$HERE/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: bench-sync.sh --help
       bench-sync.sh --full [--dry-run] [--tables N] [--mode legacy|fast|all]

Benchmarks Athena sync strategies against the configured Glue catalog:
  legacy  per-table DatabaseMetaData calls (getColumns per table) — the
          current Metabase describe-table path
  fast    one streaming information_schema.columns query — the proposed
          describe-fields path
  all     both (default)

Options:
  --full          run the benchmark (requires AWS credentials, see below)
  --dry-run       validate configuration and show the plan without running
  --tables N      cap number of tables timed in legacy mode (default: all)
  --mode MODE     legacy | fast | all (default: all)

Required environment:
  MB_ATHENA_TEST_REGION, MB_ATHENA_TEST_S3_STAGING_DIR
  MB_ATHENA_TEST_ACCESS_KEY + MB_ATHENA_TEST_SECRET_KEY
    (or leave both unset to use the default AWS credential chain)
Optional: MB_ATHENA_TEST_CATALOG, MB_ATHENA_TEST_IGNORE_DBS (comma list)

The script cds to modules/drivers/athena before invoking clojure.
For manual runs: cd modules/drivers/athena && clojure -M:bench <mode>
(do NOT run clojure -M:bench from the repo root — the alias is module-local)
EOF
}

[ $# -eq 0 ] && { usage >&2; exit 1; }

DRY_RUN=0
TABLES=""
MODE="all"
while [ $# -gt 0 ]; do
  case "$1" in
    --help)    usage; exit 0 ;;
    --full)    : ;;
    --dry-run) DRY_RUN=1 ;;
    --tables)  TABLES="$2"; shift ;;
    --mode)    MODE="$2"; shift ;;
    *)         echo "unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
  shift
done

MISSING=""
[ -n "${MB_ATHENA_TEST_REGION:-}" ]         || MISSING="$MISSING MB_ATHENA_TEST_REGION"
[ -n "${MB_ATHENA_TEST_S3_STAGING_DIR:-}" ] || MISSING="$MISSING MB_ATHENA_TEST_S3_STAGING_DIR"

if [ -n "$MISSING" ]; then
  {
    echo "Missing required configuration for --full:"
    for v in $MISSING; do
      echo "  - $v"
    done
    echo "Static credentials require BOTH MB_ATHENA_TEST_ACCESS_KEY and"
    echo "MB_ATHENA_TEST_SECRET_KEY; leave both unset for the default AWS chain."
    echo "(No credential or region values are echoed.)"
  } >&2
  exit 1
fi

if [ -n "${DEPS_EDN:-}" ]; then
  {
    echo "DEPS_EDN is set ($DEPS_EDN) — it overrides the project deps.edn,"
    echo "so the :bench alias cannot resolve. Unset it and re-run:"
    echo "  unset DEPS_EDN"
  } >&2
  exit 1
fi

cd "$MODULE_DIR" || exit 1
if ! grep -q ':bench' deps.edn 2>/dev/null; then
  echo "This checkout's modules/drivers/athena/deps.edn has no :bench alias —" >&2
  echo "run from the branch that contains the bench harness (e24-athena-sync-performance)." >&2
  exit 1
fi
if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-run ok: mode=$MODE tables=${TABLES:-all} region=$MB_ATHENA_TEST_REGION"
  echo "Would run: clojure -M:bench (module: modules/drivers/athena)"
  exit 0
fi

cd "$MODULE_DIR" || exit 1
if [ -n "$TABLES" ]; then
  exec clojure -M:bench "$MODE" --tables "$TABLES"
else
  exec clojure -M:bench "$MODE"
fi
