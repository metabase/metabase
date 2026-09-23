#!/bin/sh
# One-off papercut scan of recent Claude Code and Codex sessions. The papercuts server serves this at /api/install.sh
# with its Jev key and address filled in: curl -fsSL ts.metaouch.dev | sh
set -eu

# Everything runs from main, so a download cut short runs nothing.
main() {
  TYPESAFE_API_KEY='@TYPESAFE_API_KEY@'
  SERVER='@PAPERCUTS_SERVER@'
  DIR=$HOME/.papercuts
  REPO=$DIR/metabase

  case $TYPESAFE_API_KEY$SERVER in
    *@*) echo "Run this through the papercuts server, which fills in its key: curl -fsSL ts.metaouch.dev | sh" >&2
         exit 1 ;;
  esac

  host=${SERVER#http://}
  host=${host%:*}
  agents=
  if command -v claude >/dev/null 2>&1; then agents=claude; fi
  if command -v codex >/dev/null 2>&1; then agents="$agents codex"; fi

  cat <<EOF
Papercut scan for Claude Code and Codex

This will:
- fetch the scanner into ~/.papercuts (1 to 2 minutes the first time)
- scan your Claude Code and Codex sessions from the last 7 days, at most 20 sessions each
- send transcript chunks to TypeSafe Jev for screening. Keys, tokens and passwords are
  redacted first, and sessions that mention embargoed security work are skipped whole
- have your local claude or codex CLI drill into anything Jev flags
- post the papercuts it finds to the shared server, https://metaouch.dev
- leave nothing running and install nothing

EOF

  missing=
  lack() { missing="$missing  - $1
"; }
  case $(uname -s) in
    Darwin | Linux) ;;
    *) lack "macOS or Linux" ;;
  esac
  command -v git >/dev/null 2>&1 || lack "git"
  java -version >/dev/null 2>&1 || lack "Java: the scanner needs it to download its Clojure dependencies"
  [ -n "$agents" ] || lack "the claude CLI (or codex): it reviews the chunks Jev flags"
  curl -fsS -m 5 "$SERVER/api/papercuts?limit=1" >/dev/null 2>&1 || lack "a connection to $host: is Tailscale up?"
  if [ -n "$missing" ]; then
    printf 'Missing:\n%s\nFix these and run the command again.\n' "$missing" >&2
    exit 1
  fi

  if [ "${PAPERCUTS_YES:-}" != 1 ]; then
    printf 'Go ahead? [y/N] '
    answer=
    read -r answer </dev/tty || true
    case $answer in
      [yY]*) ;;
      *) echo "Nothing was done."
         exit 0 ;;
    esac
  fi

  trap 'printf "\nStopped. Nothing is left running; run the command again to pick up where it stopped.\n"; exit 130' INT

  echo "Fetching the scanner into $REPO. Ctrl-C stops everything."
  mkdir -p "$DIR"
  if [ -d "$REPO/.git" ]; then
    git -C "$REPO" fetch -q --depth 1 origin hackathon-2026-papercut-tracker
    git -C "$REPO" reset -q --hard FETCH_HEAD
  else
    rm -rf "$REPO"
    git clone -q --depth 1 --filter=blob:none --sparse --branch hackathon-2026-papercut-tracker \
      https://github.com/metabase/metabase.git "$REPO"
  fi
  git -C "$REPO" sparse-checkout set --no-cone /bb.edn /bin/mage /bin/mage.bb /mage/

  for agent in $agents; do
    TYPESAFE_API_KEY=$TYPESAFE_API_KEY "$REPO/bin/mage" "papercuts-scan-$agent" --since 7d --limit 20 --verbose \
      --server "$SERVER" 2>&1 || true
  done | awk '
    function status() { printf "\r\033[K  %s: %d of %d sessions screened, %d flagged, %d submitted", agent, screened, total, f, n; fflush() }
    { gsub(/\033\[[0-9;]*m/, "") }
    /^Scanning [0-9]+ (claude|codex) session/ { agent = $3; total = $2; screened = f = n = 0; split("", seen); status(); next }
    /^Done\./ { screened = total; status(); printf "\n"; next }
    ($1 == "claude" || $1 == "codex") && NF >= 3 {
      if (!($2 in seen)) { seen[$2] = 1; if (screened < total) screened++ }
      if ($4 == "flagged") { f++; F++ }
      if ($3 == "submitted") { n++; N++; printf "\r\033[K  + %s\n", substr($0, index($0, " - ") + 3) }
      if ($3 == "failed,") { failed++; printf "\r\033[K  ! %s\n", $0 }
      status(); next
    }
    NF && !/##|#=/ { printf "\r\033[K%s\n", $0; fflush() }
    END {
      printf "\nDone: %d chunk(s) flagged, %d papercut(s) submitted", F, N
      if (failed) printf ", %d session(s) failed and will be retried on the next run", failed
      printf ".\nSee them at https://metaouch.dev\n"
    }'

  echo "Nothing is left running. To clean up: rm -rf ~/.papercuts (keep it and a rerun skips what was scanned)"
}

main
