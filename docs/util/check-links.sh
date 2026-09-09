#!/usr/bin/env bash
# Checks the docs links: every link in the markdown under docs/, and every relative `url` in
# docs/util/data/nav.yml (the page has to exist under docs/, and so does any #anchor).
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

# lychee can't read YAML, so render the nav as markdown with one line per nav.yml line: a link on
# each `url:` line, blank everywhere else. That way lychee's line numbers are nav.yml line numbers.
# Urls with a scheme (https://...) or a leading slash (/learn/...) live outside docs/, so skip them.
check_nav() {
  echo "Checking urls in $nav"
  local root tmpdir rendered report failures total count line url text
  root=$PWD/docs
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' RETURN
  # The .md extension matters: lychee only looks for markdown links in markdown files.
  rendered=$tmpdir/nav-links.md

  awk '
    match($0, /^[[:space:]]*(- )?url:[[:space:]]*/) {
      url = substr($0, RLENGTH + 1)
      gsub(/^["'"'"']|["'"'"']?[[:space:]]*$/, "", url)
      if (url !~ /^([a-z][a-z0-9+.-]*:|\/)/) { print "- [nav](/" url ")"; next }
    }
    { print "" }
  ' "$nav" > "$rendered"

  # lychee exits 2 when links fail but still prints the report. It also exits 2 on a bad flag and
  # prints nothing, so trust the report, not the exit code.
  report=$(lychee --offline --root-dir "$root" --fallback-extensions md,html --include-fragments \
                  --no-progress --format json "$rendered" || true)
  total=$(jq -e -r '.total' <<<"$report") || {
    echo "lychee produced no report (see errors above)" >&2
    return 1
  }

  failures=$(jq -r '.error_map[][] | "\(.span.line)\t\(.url)\t\(.status.text)"' <<<"$report")

  count=0
  while IFS=$'\t' read -r line url text; do
    [ -n "$line" ] || continue
    count=$((count + 1))
    url=${url#file://$root/}
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
