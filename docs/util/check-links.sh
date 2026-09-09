#!/usr/bin/env bash
# Checks the links in the docs: every link in the markdown under docs/, and every relative `url` in
# docs/util/data/nav.yml (that each page exists under docs/ and that any `#anchor` exists in it).
#
#   docs/util/check-links.sh        # both
#   docs/util/check-links.sh docs   # only the markdown under docs/
#   docs/util/check-links.sh nav    # only nav.yml
#
# Needs lychee (https://lychee.cli.rs) and jq. CI runs the same checks in .github/workflows/docs-links.yml.
set -euo pipefail

cd "$(dirname "$0")/../.."

nav=docs/util/data/nav.yml

for tool in lychee jq; do
  if ! command -v "$tool" >/dev/null; then
    echo "$tool is not installed (brew install $tool)" >&2
    exit 1
  fi
done

# Same arguments as the "Run link checker" step in CI.
check_docs() {
  echo "Checking links in docs/"
  lychee docs --config ./.lychee/config.toml --offline
}

# The nav is a YAML tree, not markdown, so lychee cannot read it directly. Render it as a markdown
# file with one line per nav.yml line: a link on each `url:` line, blank elsewhere. Lychee's line
# numbers are then nav.yml line numbers. Assumes one `url:` per line, quoted or not. Scheme urls
# (https://...) and site-absolute paths (/learn/...) live outside docs/ and are skipped.
check_nav() {
  echo "Checking urls in $nav"
  local tmpdir rendered report failures total count line text url
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' RETURN
  # lychee only extracts markdown links from files with a markdown extension.
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
}

what=${1:-both}
status=0
case "$what" in
  both) check_docs || status=1; echo; check_nav || status=1 ;;
  docs) check_docs || status=1 ;;
  nav)  check_nav  || status=1 ;;
  *)    echo "usage: $0 [docs|nav]" >&2; exit 2 ;;
esac
exit "$status"
