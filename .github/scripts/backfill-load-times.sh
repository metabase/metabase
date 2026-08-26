#!/usr/bin/env bash
# Measures the last COUNT commits on master and imports each as its own point.
#
# The commits run one after another on this runner. Load times are relative to
# the machine, so measuring them anywhere else would put a step in the series.
#
# Read the result with that in mind. Every backfilled point comes from one
# machine on one afternoon, while the live series takes one point a day from a
# different runner each time. The backfilled stretch looks steadier than what
# follows it, and that is the method rather than the code.
set -euo pipefail

COUNT="${COUNT:-3}"
RUNS="${RUNS:-8}"
REPO="${GITHUB_REPOSITORY:-metabase/metabase}"
SITE="http://localhost:${MB_JETTY_PORT:-4000}"

mkdir -p artifacts temp

# Waits for whatever is on the port to go away. Without this the next commit's
# sign-in would reach the previous commit's backend and measure it twice.
wait_until_down() {
  for _ in $(seq 1 60); do
    curl -sf --max-time 2 "$SITE/api/health" >/dev/null || return 0
    sleep 1
  done
  echo "::error::a backend is still answering on $SITE"
  exit 1
}

download_artifact() {
  for attempt in 1 2 3; do
    if gh api "repos/$REPO/actions/artifacts/${1}/zip" > "$2"; then
      return 0
    fi
    echo "::warning::download attempt ${attempt} failed"
    sleep $((attempt * 15))
  done
  echo "::error::could not download artifact ${1}"
  return 1
}

gh api "repos/$REPO/commits?sha=master&per_page=$COUNT" \
  -q '.[] | [.sha, (.commit.committer.date | split("T")[0]), (.commit.message | split("\n")[0])] | @tsv' \
  > temp/commits.tsv

while IFS=$'\t' read -r sha date subject; do
  echo "::group::${date} ${sha:0:12} ${subject}"

  artifact=$(gh api "repos/$REPO/actions/artifacts?name=metabase-ee-${sha}-uberjar" \
    -q '[.artifacts[] | select(.expired|not)][0].id // empty')

  if [ -z "$artifact" ]; then
    # Uberjars are kept for 30 days, so an older commit has nothing to measure.
    echo "::warning::no uberjar for ${sha:0:12}, skipping"
    echo "::endgroup::"
    continue
  fi

  rm -rf temp/unzip
  download_artifact "$artifact" temp/mb.zip
  unzip -q -o temp/mb.zip -d temp/unzip
  jar=$(find temp/unzip -name metabase.jar | head -1)

  wait_until_down
  # A fresh app db each time, so one version's migrations never meet another's.
  MB_DB_FILE="${RUNNER_TEMP:-/tmp}/backfill-${sha}" \
    nohup java -jar "$jar" > "artifacts/metabase-${sha:0:12}.log" 2>&1 < /dev/null &
  backend=$!

  session=$(node frontend/build/bench/sign-in.js "$SITE")
  echo "::add-mask::$session"
  # The first document a fresh JVM renders pays for its own JIT.
  for _ in 1 2 3 4 5; do curl -sS -o /dev/null "$SITE/"; done

  SESSION_COOKIE="$session" \
    node frontend/build/bench/matrix.js "$SITE/" "$RUNS" \
    > "artifacts/load-times-${sha:0:12}.json"

  kill "$backend" 2>/dev/null || true
  wait "$backend" 2>/dev/null || true
  rm -rf temp/unzip temp/mb.zip

  ROWS="artifacts/load-times-${sha:0:12}.json" \
    HEAD_SHA="$sha" \
    COMMIT_DATE="$date" \
    COMMIT_MESSAGE="$subject" \
    bun .github/scripts/upload-bundle-load-stats.ts

  echo "::endgroup::"
done < temp/commits.tsv
