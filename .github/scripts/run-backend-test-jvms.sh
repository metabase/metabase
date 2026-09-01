#!/usr/bin/env bash
#
# Run this runner's share of a partitioned backend test suite as one or more concurrent
# JVMs. The caller says how many runners share the suite and how many JVMs each gets.
#
# WHY MULTIPLE JVMS PER RUNNER
# ----------------------------
# Driver tests spend most of their wall time waiting on the remote warehouse, and they
# can't use the idle CPU by using more threads because some tests mutate global state.
# A second JVM gets that isolation for free.
#
# Two paths are NOT safe to share:
#   * `target/junit` — hawk deletes the whole directory at `:begin-test-run`, so a JVM
#     starting late would wipe an earlier one's results.
#   * `logs/test-log.json` — the log4j2 File appender truncates it on open.
# So each JVM runs in its own hardlinked copy of the checkout (inodes, not disk) and
# outputs are merged back into the workspace afterwards.
#
# INPUTS (environment)
# --------------------
#   CLOJURE_ALIASES        alias string for `clojure -X`, e.g. dev:ci:ee:ee-dev:drivers:drivers-dev:test
#   TEST_RUNNER_INDEX      index of this runner among those sharing the suite
#   TEST_RUNNER_COUNT      how many runners share the suite
#   TEST_JVMS_PER_RUNNER   concurrent JVMs per runner (default 1)
#   TEST_HEAP_PER_JVM      -Xmx per JVM, applied only when running more than one
#
# Exits non-zero if any JVM fails.

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

[[ "$TEST_RUNNER_INDEX" =~ ^[0-9]+$ ]] || die "TEST_RUNNER_INDEX must be a non-negative integer, got '$TEST_RUNNER_INDEX'"
[[ "$TEST_RUNNER_COUNT" =~ ^[0-9]+$ ]] || die "TEST_RUNNER_COUNT must be a positive integer, got '$TEST_RUNNER_COUNT'"
[[ "$TEST_JVMS_PER_RUNNER" =~ ^[0-9]+$ ]] || die "TEST_JVMS_PER_RUNNER must be a positive integer, got '$TEST_JVMS_PER_RUNNER'"
[ "$TEST_RUNNER_COUNT" -ge 1 ] || die "TEST_RUNNER_COUNT must be at least 1"
[ "$TEST_JVMS_PER_RUNNER" -ge 1 ] || die "TEST_JVMS_PER_RUNNER must be at least 1"
[ "$TEST_RUNNER_INDEX" -lt "$TEST_RUNNER_COUNT" ] ||
  die "runner index $TEST_RUNNER_INDEX is out of range for $TEST_RUNNER_COUNT runner(s) — a matrix entry was added without raising runner-count"

# Partition indexes are split across runners rather than handed out in contiguous
# blocks. E.g. with 2 runners and 2 JVMs the first runner gets partition 0 and 2, and
# the second runner gets partitions 1 and 3. Hawk partitions in namespace order, so
# neighbouring partitions have similar runtimes — contiguous blocks would group the slow
# ones together onto one runner.
PARTITION_TOTAL=$((TEST_RUNNER_COUNT * TEST_JVMS_PER_RUNNER))
INDEXES=()
for ((k = 0; k < TEST_JVMS_PER_RUNNER; k++)); do
  INDEXES+=($((TEST_RUNNER_INDEX + k * TEST_RUNNER_COUNT)))
done

# One JVM: run directly in the workspace with no heap override, exactly as a
# partitioned run behaved before this script existed.
if [ "$TEST_JVMS_PER_RUNNER" -eq 1 ]; then
  echo "Running partition ${INDEXES[0]} of $PARTITION_TOTAL"
  exec clojure -X:"$CLOJURE_ALIASES" "${TEST_ARGS[@]}" \
    :partition/total "$PARTITION_TOTAL" \
    :partition/index "${INDEXES[0]}"
fi


WORKSPACE="$PWD"
# Sibling of the checkout: same filesystem (so `cp -al` can hardlink) but outside the
# repo, so one JVM's directory never gets copied into another's.
JVM_DIRS_ROOT="$(dirname "$WORKSPACE")/backend-test-jvms"
STATUS_DIR="$JVM_DIRS_ROOT/status"

# Merge every JVM's results into the workspace the rest of the job reads from.
#
# Each partition's junit XML goes into its own subdirectory: `mb_hawk_var_less_errors.xml`
# has a fixed name, so a flat copy would silently overwrite it. Nesting is safe because
# both consumers (dorny/test-reporter and ci-conductor's backend adapter) walk
# `target/junit` recursively and match on filename suffix.
#
# Runs from an EXIT trap so a cancelled or timed-out job still publishes whatever
# finished.
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

# Hardlinked copy of the checkout. Skips the paths a run writes to (`target`, `logs`, `.cpcache`)
# and the two most expensive trees nothing on the test classpath reads (`.git`, `node_modules`).
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

# Prefix output with the partition index so interleaved JVM logs stay readable.
run_partition() {
  local idx="$1" jvm_dir="$2" rc line
  (
    cd "$jvm_dir" || exit 1
    # `-J` options land after the aliases' `:jvm-opts`, overriding the `:ci` alias's
    # `-Xms12g -Xmx12g`. Xms stays small so JVMs sharing a runner grow into memory on
    # demand rather than each committing its ceiling up front.
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
