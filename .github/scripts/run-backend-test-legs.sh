#!/usr/bin/env bash
#
# Run several backend test JVMs ("legs") concurrently on ONE runner, each taking a
# different hawk partition, and merge their output back into the workspace.
#
# WHY
# ---
# A driver test process spends nearly all of its wall time waiting on the remote
# warehouse, not on the runner's CPU. It cannot use that idle capacity by threading
# harder: `mb.hawk.core` hardcodes `:multithread? :vars`, so namespaces run strictly one
# at a time and only the `^:parallel` vars inside the current namespace overlap. The
# BigQuery run that motivated this reported "1033 tests in parallel, 762 single-threaded"
# — with one namespace in flight, a 4-vCPU runner is mostly idle.
#
# Flipping hawk to `:multithread? true` is not an option: a var is left single-threaded
# precisely because it mutates global state, so running two namespaces in one JVM is
# exactly the interference that marking guards against. A second JVM gets that isolation
# for free, which is why this parallelises by process.
#
# WHAT ALREADY MAKES CONCURRENT PROCESSES SAFE
# --------------------------------------------
#   * `-Dmb.jetty.port=0` (`:test` alias in deps.edn) — every process gets its own
#     OS-assigned port. The alias comment already calls this out as enabling parallel runs.
#   * `-Dmb.db.in.memory=true` — every process gets its own H2 application DB.
#   * Warehouse test datasets are content-hash named (`sha__<hash>_<name>`) and both
#     dataset and table creation swallow 409 ALREADY_EXISTS. That is what already lets
#     today's matrix legs hit one GCP project at the same time.
#
# WHAT IS NOT SAFE TO SHARE
# -------------------------
#   * `target/junit` — hawk calls `clean-output-dir!` (a full directory delete) at
#     `:begin-test-run`, so a leg reaching that point late would wipe results an earlier
#     leg had already written.
#   * `logs/test-log.json` — the log4j2 File appender opens it with `append="false"`.
#
# Both are resolved the same way: each leg runs in its own working directory, hardlinked
# from the checkout so it costs inodes rather than disk, and the outputs are merged back
# into the workspace when the run finishes.
#
# INPUTS (environment)
# --------------------
#   CLOJURE_ALIASES   alias string for `clojure -X`, e.g. dev:ci:ee:ee-dev:drivers:drivers-dev:test
#   TEST_ARGS         hawk args shared by every leg, WITHOUT the partition flags
#   PARTITION_TOTAL   total partitions across every runner in the job
#   PARTITION_INDEXES space-separated `:partition/index` values for THIS runner
#   HEAP_PER_LEG      -Xmx for each leg (see the sizing note below)
#
# Exits non-zero if any leg does.

set -uo pipefail

: "${CLOJURE_ALIASES:?CLOJURE_ALIASES is required}"
: "${PARTITION_TOTAL:?PARTITION_TOTAL is required}"
: "${PARTITION_INDEXES:?PARTITION_INDEXES is required}"
TEST_ARGS="${TEST_ARGS:-}"
HEAP_PER_LEG="${HEAP_PER_LEG:-4g}"

WORKSPACE="$PWD"
# Sibling of the checkout: same filesystem (so `cp -al` can hardlink) but outside the
# repo, so a leg directory can never be copied into the next leg directory.
LEGS_ROOT="$(dirname "$WORKSPACE")/backend-test-legs"
STATUS_DIR="$LEGS_ROOT/status"

read -r -a INDEXES <<< "$PARTITION_INDEXES"

# Merge every leg's results into the workspace the rest of the job reads from.
#
# Per-leg SUBDIRECTORY rather than a flat copy: partitions never share a namespace, so
# the per-namespace `<ns>.xml` files could be flattened safely, but `mb_hawk_var_less_errors.xml`
# has a fixed name and legs would silently overwrite each other's. Both consumers walk
# `target/junit` recursively and match on suffix — dorny/test-reporter globs
# `target/junit/**/*_test.xml`, and ci-conductor's backend adapter uses
# `readdirSync(dir, {recursive: true})` plus `endsWith()` — so nesting costs nothing.
#
# Runs from an EXIT trap so a cancelled or timed-out job still publishes the results of
# whatever finished, instead of reporting a job-shaped hole.
# shellcheck disable=SC2329  # invoked by the EXIT trap below, which shellcheck can't see.
merge_outputs() {
  mkdir -p "$WORKSPACE/target/junit" "$WORKSPACE/logs"
  local idx leg_dir
  for idx in "${INDEXES[@]}"; do
    leg_dir="$LEGS_ROOT/leg-$idx"
    if [ -d "$leg_dir/target/junit" ]; then
      mkdir -p "$WORKSPACE/target/junit/p$idx"
      cp -a "$leg_dir/target/junit/." "$WORKSPACE/target/junit/p$idx/" || true
    fi
    # `logs/test-log*.json` is what the action uploads on failure.
    if [ -f "$leg_dir/logs/test-log.json" ]; then
      cp -a "$leg_dir/logs/test-log.json" "$WORKSPACE/logs/test-log-p$idx.json" || true
    fi
  done
}
trap merge_outputs EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

# Hardlinked copy of the checkout. `target`, `logs` and `.cpcache` are the paths a leg
# writes to, so they are left out and recreated per leg; `.git` and `node_modules` are
# left out because nothing on the test classpath reads them and they are the two most
# expensive trees to walk.
prepare_leg_dir() {
  local leg_dir="$1" entry
  rm -rf "$leg_dir"
  mkdir -p "$leg_dir"
  for entry in "$WORKSPACE"/* "$WORKSPACE"/.[!.]*; do
    [ -e "$entry" ] || continue
    case "$(basename "$entry")" in
      .git | node_modules | target | logs | .cpcache) continue ;;
    esac
    # Fall back to a real copy if the filesystem refuses the hardlink.
    cp -al "$entry" "$leg_dir/" 2>/dev/null || cp -a "$entry" "$leg_dir/"
  done
}

# Output is prefixed with the partition index so several legs interleaving in one job log
# stay readable. A read loop rather than `sed -u`: line-buffered without a GNU-only flag,
# so this behaves the same when someone runs the script on a laptop.
run_leg() {
  local idx="$1" leg_dir="$2" rc line
  (
    cd "$leg_dir" || exit 1
    # `-J` options land after the aliases' `:jvm-opts`, so these override the `-Xms12g
    # -Xmx12g` the `:ci` alias sets for a runner running a single JVM. Xms is left small
    # on purpose: N legs sharing one runner should grow into memory on demand rather than
    # each committing its ceiling up front.
    #
    # TEST_ARGS is deliberately unquoted — it is a list of hawk arguments that has to
    # word-split into separate argv entries.
    # shellcheck disable=SC2086
    exec clojure -J-Xms512m -J-Xmx"$HEAP_PER_LEG" -X:"$CLOJURE_ALIASES" \
      $TEST_ARGS \
      :partition/total "$PARTITION_TOTAL" \
      :partition/index "$idx"
  ) 2>&1 | while IFS= read -r line || [ -n "$line" ]; do printf '[p%s] %s\n' "$idx" "$line"; done
  rc="${PIPESTATUS[0]}"
  echo "$rc" > "$STATUS_DIR/p$idx"
}

rm -rf "$LEGS_ROOT"
mkdir -p "$STATUS_DIR"

echo "Running ${#INDEXES[@]} concurrent test JVMs on this runner: partition(s) ${INDEXES[*]} of $PARTITION_TOTAL (-Xmx$HEAP_PER_LEG each)"

for idx in "${INDEXES[@]}"; do
  prepare_leg_dir "$LEGS_ROOT/leg-$idx"
done

for idx in "${INDEXES[@]}"; do
  run_leg "$idx" "$LEGS_ROOT/leg-$idx" &
done
wait

overall=0
for idx in "${INDEXES[@]}"; do
  rc="$(cat "$STATUS_DIR/p$idx" 2>/dev/null || echo 1)"
  echo "partition $idx exited $rc"
  [ "$rc" -eq 0 ] || overall=1
done
exit "$overall"
