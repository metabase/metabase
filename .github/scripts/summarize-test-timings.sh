#!/usr/bin/env bash
#
# Summarize per-test and per-namespace wall times from hawk's JUnit XML.
#
#   .github/scripts/summarize-test-timings.sh [junit-dir] [tsv-out]
#
# Writes every timing to `tsv-out` (default `target/test-timings.tsv`) as
#
#   seconds <TAB> ns|test <TAB> partition <TAB> namespace[/var]
#
# and prints a Markdown summary of the slowest namespaces and tests to stdout.
#
# `partition` is the subdirectory of `junit-dir` the file came from: run-backend-test-jvms.sh merges each
# JVM's results into `target/junit/p<index>/`. A single-JVM run writes `target/junit/*.xml` directly,
# which is reported as partition `-`.
#
# Hawk writes a namespace's XML file when the namespace finishes, so after a timeout the namespace that
# was still running is not in the output.
#
# Relies on hawk writing each `<testsuite>`/`<testcase>` start tag on its own line with `name`/`time`
# (resp. `classname`/`name`/`time`) as the leading attributes, as `mb.hawk.junit.write` does.

set -uo pipefail

JUNIT_DIR="${1:-target/junit}"
TSV_OUT="${2:-target/test-timings.tsv}"
TOP_N="${TOP_N:-30}"
TAB=$'\t'

mkdir -p "$(dirname "$TSV_OUT")"
: > "$TSV_OUT"

if [ ! -d "$JUNIT_DIR" ]; then
  echo "No JUnit output in \`$JUNIT_DIR\`; nothing to summarize."
  exit 0
fi

while IFS= read -r -d '' xml; do
  rel="${xml#"$JUNIT_DIR"/}"
  partition="-"
  [[ "$rel" == */* ]] && partition="${rel%%/*}"
  sed -n -E \
    -e "s|.*<testsuite name=\"([^\"]*)\" time=\"([^\"]*)\".*|\2${TAB}ns${TAB}${partition}${TAB}\1|p" \
    -e "s|.*<testcase classname=\"([^\"]*)\" name=\"([^\"]*)\" time=\"([^\"]*)\".*|\3${TAB}test${TAB}${partition}${TAB}\1/\2|p" \
    "$xml"
done < <(find "$JUNIT_DIR" -type f -name '*.xml' -print0) \
  | sed -e 's/&gt;/>/g' -e 's/&lt;/</g' -e 's/&quot;/"/g' -e 's/&amp;/\&/g' \
  > "$TSV_OUT"

# `awk 'NR<=n'` rather than `head -n`: the runner ignores SIGPIPE, so `head` exiting early leaves `sort`
# with an EPIPE write error and `pipefail` fails the step.
top() {
  local kind="$1"
  awk -F"$TAB" -v kind="$kind" '$2 == kind' "$TSV_OUT" \
    | sort -t"$TAB" -k1,1 -rn \
    | awk -F"$TAB" -v n="$TOP_N" 'NR <= n { printf "%9.1f  %-4s %s\n", $1, $3, $4 }'
}

echo "### Test wall times"
echo
echo "Namespace times are wall time, so tests run in parallel within a namespace overlap."
echo
echo '```'
awk -F"$TAB" '
  $2 == "ns"   { ns_secs[$3] += $1; ns_count[$3]++ }
  $2 == "test" { test_count[$3]++ }
  END {
    printf "%-9s %10s %11s %8s\n", "partition", "namespaces", "tests", "minutes"
    for (p in ns_secs) printf "%-9s %10d %11d %8.1f\n", p, ns_count[p], test_count[p], ns_secs[p] / 60
  }' "$TSV_OUT"
echo '```'
echo
echo "#### Slowest $TOP_N namespaces (seconds)"
echo
echo '```'
top ns
echo '```'
echo
echo "#### Slowest $TOP_N tests (seconds)"
echo
echo '```'
top test
echo '```'
