#!/usr/bin/env bash
#
# Run this runner's share of a partitioned backend test suite, as one or more concurrent
# JVMs. Owns all of the partition arithmetic: a caller says how many runners share the
# suite and how many JVMs each runner gets, and never writes a partition index by hand.
#
# WHY MORE THAN ONE JVM PER RUNNER
# --------------------------------
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
#     `:begin-test-run`, so a JVM reaching that point late would wipe results an earlier
#     one had already written.
#   * `logs/test-log.json` — the log4j2 File appender opens it with `append="false"`.
#
# Both are resolved the same way: each JVM runs in its own working directory, hardlinked
# from the checkout so it costs inodes rather than disk, and the outputs are merged back
# into the workspace when the run finishes. A single-JVM runner skips all of that and runs
# in the workspace exactly as an unpartitioned run would.
#
# INPUTS (environment)
# --------------------
#   CLOJURE_ALIASES        alias string for `clojure -X`, e.g. dev:ci:ee:ee-dev:drivers:drivers-dev:test
#   TEST_RUNNER_INDEX      0-based position of THIS runner among the runners sharing the suite
#   TEST_RUNNER_COUNT      how many runners share the suite
#   TEST_JVMS_PER_RUNNER   concurrent JVMs on each runner (default 1)
#   TEST_HEAP_PER_JVM      -Xmx per JVM, applied only when running more than one
#
# The hawk args shared by every JVM (WITHOUT the partition flags) are the positional
# arguments. They arrive already split by the caller's shell, which is what lets a
# workflow keep writing `:only '["test" ".clj-kondo/test"]'` — the quoting there is shell
# quoting, and a value with spaces has to survive as ONE argv entry.
#
# Exits non-zero if any JVM does.

set -uo pipefail

: "${CLOJURE_ALIASES:?CLOJURE_ALIASES is required}"
: "${TEST_RUNNER_INDEX:?TEST_RUNNER_INDEX is required}"
: "${TEST_RUNNER_COUNT:?TEST_RUNNER_COUNT is required}"
TEST_ARGS=("$@")
TEST_JVMS_PER_RUNNER="${TEST_JVMS_PER_RUNNER:-1}"
TEST_HEAP_PER_JVM="${TEST_HEAP_PER_JVM:-4g}"

die() {
  echo "::error::run-backend-test-jvms.sh: $1"
  exit 1
}

# Validate before computing anything. These are the mistakes a workflow actually makes —
# adding a matrix entry without bumping the runner count, or copying one driver's block to
# another and leaving an index behind — and every one of them is silently wrong rather than
# loudly wrong: the suite would still pass while quietly skipping or double-running a slice.
[[ "$TEST_RUNNER_INDEX" =~ ^[0-9]+$ ]] || die "TEST_RUNNER_INDEX must be a non-negative integer, got '$TEST_RUNNER_INDEX'"
[[ "$TEST_RUNNER_COUNT" =~ ^[0-9]+$ ]] || die "TEST_RUNNER_COUNT must be a positive integer, got '$TEST_RUNNER_COUNT'"
[[ "$TEST_JVMS_PER_RUNNER" =~ ^[0-9]+$ ]] || die "TEST_JVMS_PER_RUNNER must be a positive integer, got '$TEST_JVMS_PER_RUNNER'"
[ "$TEST_RUNNER_COUNT" -ge 1 ] || die "TEST_RUNNER_COUNT must be at least 1"
[ "$TEST_JVMS_PER_RUNNER" -ge 1 ] || die "TEST_JVMS_PER_RUNNER must be at least 1"
[ "$TEST_RUNNER_INDEX" -lt "$TEST_RUNNER_COUNT" ] ||
  die "runner index $TEST_RUNNER_INDEX is out of range for $TEST_RUNNER_COUNT runner(s) — a matrix entry was added without raising runner-count"



# The partition plan. Indexes are strided by the runner count rather than handed out in
# contiguous blocks, so runner 0 of 3 with 2 JVMs takes partitions 0 and 3, runner 1 takes
# 1 and 4, and so on. hawk partitions in namespace order, so neighbouring partitions have
# correlated runtimes; a contiguous block would concentrate the slow ones on one runner and
# that runner would set the job's wall time.
PARTITION_TOTAL=$((TEST_RUNNER_COUNT * TEST_JVMS_PER_RUNNER))
INDEXES=()
for ((k = 0; k < TEST_JVMS_PER_RUNNER; k++)); do
  INDEXES+=($((TEST_RUNNER_INDEX + k * TEST_RUNNER_COUNT)))
done

# One JVM: run in the workspace, with no output juggling and no heap override, so a
# partitioned-but-not-concurrent driver behaves exactly as it did before this script.
if [ "$TEST_JVMS_PER_RUNNER" -eq 1 ]; then
  echo "Running partition ${INDEXES[0]} of $PARTITION_TOTAL"
  exec clojure -X:"$CLOJURE_ALIASES" "${TEST_ARGS[@]}" \
    :partition/total "$PARTITION_TOTAL" \
    :partition/index "${INDEXES[0]}"
fi


WORKSPACE="$PWD"
# Sibling of the checkout: same filesystem (so `cp -al` can hardlink) but outside the
# repo, so one JVM's directory can never be copied into the next one's.
JVM_DIRS_ROOT="$(dirname "$WORKSPACE")/backend-test-jvms"
STATUS_DIR="$JVM_DIRS_ROOT/status"

# Merge every JVM's results into the workspace the rest of the job reads from.
#
# Per-partition SUBDIRECTORY rather than a flat copy: partitions never share a namespace,
# so the per-namespace `<ns>.xml` files could be flattened safely, but
# `mb_hawk_var_less_errors.xml` has a fixed name and JVMs would silently overwrite each
# other's. Both consumers walk `target/junit` recursively and match on suffix —
# dorny/test-reporter globs `target/junit/**/*_test.xml`, and ci-conductor's backend
# adapter uses `readdirSync(dir, {recursive: true})` plus `endsWith()` — so nesting is free.
#
# Runs from an EXIT trap so a cancelled or timed-out job still publishes the results of
# whatever finished, instead of reporting a job-shaped hole.
# shellcheck disable=SC2329  # invoked by the EXIT trap below, which shellcheck can't see.
merge_outputs() {
  mkdir -p "$WORKSPACE/target/junit" "$WORKSPACE/logs"
  local idx jvm_dir
  for idx in "${INDEXES[@]}"; do
    jvm_dir="$JVM_DIRS_ROOT/partition-$idx"
    if [ -d "$jvm_dir/target/junit" ]; then
      mkdir -p "$WORKSPACE/target/junit/p$idx"
      cp -a "$jvm_dir/target/junit/." "$WORKSPACE/target/junit/p$idx/" || true
    fi
    # `logs/test-log*.json` is what the action uploads on failure.
    if [ -f "$jvm_dir/logs/test-log.json" ]; then
      cp -a "$jvm_dir/logs/test-log.json" "$WORKSPACE/logs/test-log-p$idx.json" || true
    fi
  done
}
trap merge_outputs EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

# Hardlinked copy of the checkout — ~0.1s and no extra disk for a Metabase-sized tree.
# `target`, `logs` and `.cpcache` are the paths a run writes to, so they are left out and
# recreated per JVM; `.git` and `node_modules` are left out because nothing on the test
# classpath reads them and they are the two most expensive trees to walk.
prepare_jvm_dir() {
  local jvm_dir="$1" entry
  rm -rf "$jvm_dir"
  mkdir -p "$jvm_dir"
  for entry in "$WORKSPACE"/* "$WORKSPACE"/.[!.]*; do
    [ -e "$entry" ] || continue
    case "$(basename "$entry")" in
      .git | node_modules | target | logs | .cpcache) continue ;;
    esac
    # Fall back to a real copy if the filesystem refuses the hardlink.
    cp -al "$entry" "$jvm_dir/" 2>/dev/null || cp -a "$entry" "$jvm_dir/"
  done
}

# Output is prefixed with the partition index so several JVMs interleaving in one job log
# stay readable. A read loop rather than `sed -u`: line-buffered without a GNU-only flag,
# so this behaves the same when someone runs the script on a laptop.
run_partition() {
  local idx="$1" jvm_dir="$2" rc line
  (
    cd "$jvm_dir" || exit 1
    # `-J` options land after the aliases' `:jvm-opts`, so these override the `-Xms12g
    # -Xmx12g` the `:ci` alias sets for a runner running a single JVM. Xms is left small
    # on purpose: N JVMs sharing one runner should grow into memory on demand rather than
    # each committing its ceiling up front.
    exec clojure -J-Xms512m -J-Xmx"$TEST_HEAP_PER_JVM" -X:"$CLOJURE_ALIASES" \
      "${TEST_ARGS[@]}" \
      :partition/total "$PARTITION_TOTAL" \
      :partition/index "$idx"
  ) 2>&1 | while IFS= read -r line || [ -n "$line" ]; do printf '[p%s] %s\n' "$idx" "$line"; done
  rc="${PIPESTATUS[0]}"
  echo "$rc" > "$STATUS_DIR/p$idx"
}

rm -rf "$JVM_DIRS_ROOT"
mkdir -p "$STATUS_DIR"

echo "Runner $TEST_RUNNER_INDEX of $TEST_RUNNER_COUNT: running $TEST_JVMS_PER_RUNNER concurrent JVMs for partition(s) ${INDEXES[*]} of $PARTITION_TOTAL (-Xmx$TEST_HEAP_PER_JVM each)"

for idx in "${INDEXES[@]}"; do
  prepare_jvm_dir "$JVM_DIRS_ROOT/partition-$idx"
done

for idx in "${INDEXES[@]}"; do
  run_partition "$idx" "$JVM_DIRS_ROOT/partition-$idx" &
done
wait

overall=0
for idx in "${INDEXES[@]}"; do
  rc="$(cat "$STATUS_DIR/p$idx" 2>/dev/null || echo 1)"
  echo "partition $idx exited $rc"
  [ "$rc" -eq 0 ] || overall=1
done
exit "$overall"
