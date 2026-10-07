#!/usr/bin/env bash
# Checks the docs links: every link in the markdown under docs/, every `url` in
# docs/util/data/nav.yml, and every metabase.com/docs/latest link written out in the source code
# (the page has to exist under docs/, and so does any #anchor).
#
#   docs/util/check-links.sh                   # all three
#   docs/util/check-links.sh docs              # only the markdown under docs/
#   docs/util/check-links.sh nav               # only nav.yml
#   docs/util/check-links.sh src               # only the source code
#   docs/util/check-links.sh site              # every metabase.com link against the live site (needs network)
#   docs/util/check-links.sh --external [nav]  # also fetch external links (slow, needs network)
#
# Without --external, links to other sites are skipped, which is how CI runs it
# (.github/workflows/docs-links.yml). Needs lychee (https://lychee.cli.rs) and jq.
set -euo pipefail

cd "$(dirname "$0")/../.."

nav=docs/util/data/nav.yml
site=https://www.metabase.com

for tool in lychee jq; do
  if ! command -v "$tool" >/dev/null; then
    echo "$tool is not installed (brew install $tool)" >&2
    exit 1
  fi
done

external=0
what=all
for arg in "$@"; do
  case "$arg" in
    --external) external=1 ;;
    docs|nav|src|site) what=$arg ;;
    *) echo "usage: $0 [--external] [docs|nav|src|site]" >&2; exit 2 ;;
  esac
done

lychee_args=(--config ./.lychee/config.toml)
[ "$external" -eq 1 ] || lychee_args+=(--offline)

# Same arguments as the "Run link checker" step in CI (plus --offline there).
check_docs() {
  echo "Checking links in docs/"
  lychee docs "${lychee_args[@]}"
}

# lychee can't read YAML, so render the nav as markdown with one line per nav.yml line: a link on
# each `url:` line, blank everywhere else. That way lychee's line numbers are nav.yml line numbers.
# Urls with a scheme (https://...) or a leading slash (/learn/..., which is on the site, not in
# docs/) are only rendered when checking external links.
check_nav() {
  echo "Checking urls in $nav"
  local root tmpdir rendered report failures total count line url text
  root=$PWD/docs
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' RETURN
  # The .md extension matters: lychee only looks for markdown links in markdown files.
  rendered=$tmpdir/nav-links.md

  awk -v external="$external" -v site="$site" '
    match($0, /^[[:space:]]*(- )?url:[[:space:]]*/) {
      url = substr($0, RLENGTH + 1)
      gsub(/^["'"'"']|["'"'"']?[[:space:]]*$/, "", url)
      if (url ~ /^\//) url = site url
      else if (url !~ /^[a-z][a-z0-9+.-]*:/) url = "/" url
      if (external || url !~ /^[a-z][a-z0-9+.-]*:/) { print "- [nav](" url ")"; next }
    }
    { print "" }
  ' "$nav" > "$rendered"

  # lychee exits 2 when links fail but still prints the report. It also exits 2 on a bad flag and
  # prints nothing, so trust the report, not the exit code.
  report=$(lychee "${lychee_args[@]}" --root-dir "$root" --fallback-extensions md,html \
                  --include-fragments --no-progress --format json "$rendered" || true)
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

# Full metabase.com/docs URLs in the source code (TSDoc, error messages, emails, docstrings) would be
# skipped by --offline, so map each one back to its markdown file under docs/. git grep pulls the URLs
# out first because lychee can't parse every string in source code as a URL (postgres://user:pw@host:port).
# Links built with useDocsUrl/getDocsUrl aren't literal URLs, so bin/verify-doc-links checks those. Unit
# specs only repeat what those helpers return, and resources/openapi is generated from src docstrings.
check_src() {
  echo "Checking docs links in the source code"
  local tmpdir locations rendered report total failures count line url text location
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' RETURN
  locations=$tmpdir/locations
  # The .md extension matters: lychee only looks for markdown links in markdown files.
  rendered=$tmpdir/src-links.md

  # path:line:url, one per line. Urls built with ${...} can't be checked, and trailing punctuation is
  # usually the end of a sentence in a docstring.
  git grep -nIoE 'https?://(www\.)?metabase\.com/docs/latest/[^][:space:]"'"'"'`<>()\\]*' \
    -- frontend/src enterprise/frontend/src src enterprise/backend/src resources modules \
       ':!*.unit.spec.*' ':!resources/openapi' |
    grep -v '\${' | sed -E 's/[.,;:]+$//' > "$locations" || true
  sed -E 's/^[^:]+:[0-9]+:(.*)$/- [src](\1)/' "$locations" > "$rendered"

  # Same as check_nav: trust the report, not the exit code.
  report=$(lychee --config ./.lychee/config.toml --offline --include-fragments=full --no-progress \
                  --format json --include '^https?://(www\.)?metabase\.com/docs/latest/' \
                  --remap "^https?://(www\.)?metabase\.com/docs/latest/([^#?]+?)(\.html)?(\?[^#]*)?(#.*)?\$ file://$PWD/docs/\$2.md\$5" \
                  "$rendered" || true)
  total=$(jq -e -r '.total' <<<"$report") || {
    echo "lychee produced no report (see errors above)" >&2
    return 1
  }

  failures=$(jq -r '.error_map[][] | "\(.span.line)\t\(.url)\t\(.status.text)"' <<<"$report")

  count=0
  while IFS=$'\t' read -r line url text; do
    [ -n "$line" ] || continue
    count=$((count + 1))
    location=$(sed -n "${line}p" "$locations" | cut -d: -f1,2)
    url=${url#file://$PWD/docs/}
    echo "$location: $url: $text"
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
      echo "::error file=${location%:*},line=${location##*:}::$url: $text"
    fi
  done <<<"$failures"

  echo "Checked $total docs links in the source code, $count broken"
  [ "$count" -eq 0 ]
}

# The offline checks only see pages under docs/. The rest of metabase.com (/learn, /product, /cloud, and
# redirects the site sets up itself) can only be checked live, so this fetches every metabase.com url in
# the repo and fails on a redirect as well as a 404: a link that works only through a redirect breaks
# silently when the site drops the redirect. Too slow and too dependent on the site for every PR, so CI
# runs it on a schedule (.github/workflows/docs-links-site.yml).
check_site() {
  echo "Checking metabase.com links against the live site"
  local tmpdir locations rendered report total failures count line url text location
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' RETURN
  locations=$tmpdir/locations
  rendered=$tmpdir/site-links.md

  git grep -nIoE 'https?://(www\.)?metabase\.com(/[^][:space:]"'"'"'`<>()\\|]*)?' \
    -- docs frontend/src enterprise/frontend/src src enterprise/backend/src resources modules \
       ':!*.unit.spec.*' ':!resources/openapi' ':!docs/embedding/sdk/api' ':!docs/api.json' |
    grep -v -e '\${' -e '{{' -e '{%' | sed -E 's/[.,;:]+$//' > "$locations" || true
  sed -E 's/^[^:]+:[0-9]+:(.*)$/- [site](\1)/' "$locations" > "$rendered"

  report=$(lychee --no-progress --format json --max-redirects 0 --max-concurrency 8 --max-retries 3 \
                  --timeout 30 --accept '200..=204,429' \
                  "${site_not_links[@]/#/--exclude=}" "$rendered" || true)
  total=$(jq -e -r '.total' <<<"$report") || {
    echo "lychee produced no report (see errors above)" >&2
    return 1
  }

  failures=$(jq -r '.error_map[][] | "\(.span.line)\t\(.url)\t\(.status.text)"' <<<"$report")

  count=0
  while IFS=$'\t' read -r line url text; do
    [ -n "$line" ] || continue
    count=$((count + 1))
    location=$(sed -n "${line}p" "$locations" | cut -d: -f1,2)
    echo "$location: $url: $text"
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
      echo "::error file=${location%:*},line=${location##*:}::$url: $text"
    fi
  done <<<"$failures"

  echo "Checked $total metabase.com links, $count broken or redirected"
  [ "$count" -eq 0 ]
}

# Strings that look like metabase.com links but aren't followed by anyone, as regexes for lychee's
# --exclude. Fix a real link instead of adding it here.
site_not_links=(
  # Bare metabase.com: CSP origins, the OpenRouter attribution header, a dummy host for parsing paths.
  '^https?://metabase\.com/?$'
  # VersionUpdateNotice appends the version to this.
  '^https://www\.metabase\.com/docs/$'
  # Example data in the regexextract docs.
  'utm_campaign=(alice|neo)$'
)

status=0
case "$what" in
  all)  check_docs || status=1; echo; check_nav || status=1; echo; check_src || status=1 ;;
  docs) check_docs || status=1 ;;
  nav)  check_nav  || status=1 ;;
  src)  check_src  || status=1 ;;
  site) check_site || status=1 ;;
esac
exit "$status"
