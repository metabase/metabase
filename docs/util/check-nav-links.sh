#!/usr/bin/env bash
# Checks that every relative `url` in docs/util/data/nav.yml points at a page under docs/, and that
# any `#anchor` exists in that page. Reports each failure as `docs/util/data/nav.yml:LINE`.
#
#   docs/util/check-nav-links.sh
#
# Needs lychee (https://lychee.cli.rs) and jq. The nav is a YAML tree, not markdown, so lychee cannot
# read it directly. The script renders it as a markdown file with one line per nav.yml line: a link
# on each `url:` line, blank elsewhere. Lychee's line numbers are then nav.yml line numbers.
#
# Assumes one `url:` per line, quoted or not. Scheme urls (https://...) and site-absolute paths
# (/learn/...) live outside docs/ and are skipped.
set -euo pipefail

cd "$(dirname "$0")/../.."

nav=docs/util/data/nav.yml

for tool in lychee jq; do
  if ! command -v "$tool" >/dev/null; then
    echo "$tool is not installed (brew install $tool)" >&2
    exit 1
  fi
done

# lychee only extracts markdown links from files with a markdown extension.
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
rendered=$tmpdir/nav-links.md

awk '
  match($0, /^[[:space:]]*(- )?url:[[:space:]]*/) {
    url = substr($0, RLENGTH + 1)
    gsub(/^["'"'"']|["'"'"']?[[:space:]]*$/, "", url)
    if (url !~ /^([a-z][a-z0-9+.-]*:|\/)/) { print "- [nav](/" url ")"; next }
  }
  { print "" }
' "$nav" > "$rendered"

# lychee exits 2 when links fail and still prints the JSON report.
report=$(lychee --offline --root-dir ./docs --fallback-extensions md,html --include-fragments \
                --no-progress --format json "$rendered" || true)

failures=$(jq -r '.error_map | to_entries[] | .value[] | "\(.span.line)\t\(.status.text)"' <<<"$report")
total=$(jq -r '.total' <<<"$report")

count=0
while IFS=$'\t' read -r line text; do
  [ -n "$line" ] || continue
  count=$((count + 1))
  url=$(sed -n "${line}p" "$rendered" | sed -E 's/^- \[nav\]\(\/(.*)\)$/\1/')
  echo "$nav:$line: $url: $text"
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error file=$nav,line=$line::$url: $text"
  fi
done <<<"$failures"

echo "Checked $total nav urls, $count broken"
[ "$count" -eq 0 ]
