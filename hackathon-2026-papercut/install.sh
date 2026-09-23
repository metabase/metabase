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
  LOG=$DIR/install.log
  BRANCH=hackathon-2026-papercut-tracker
  PROJECT=${PAPERCUTS_PROJECT:-metabase}

  case $TYPESAFE_API_KEY$SERVER in
    *@*) echo "Run this through the papercuts server, which fills in its key: curl -fsSL ts.metaouch.dev | sh" >&2
         exit 1 ;;
  esac
  host=${SERVER#http://}
  host=${host%:*}

  if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    TTY=1 B=$(printf '\033[1m') D=$(printf '\033[2m') R=$(printf '\033[31m') G=$(printf '\033[32m')
    Y=$(printf '\033[33m') C=$(printf '\033[36m') N=$(printf '\033[0m') CLR=$(printf '\r\033[K')
  else
    TTY= B= D= R= G= Y= C= N= CLR=
  fi

  claude_cli=; codex_cli=
  if command -v claude >/dev/null 2>&1; then claude_cli=1; fi
  if command -v codex >/dev/null 2>&1; then codex_cli=1; fi

  printf '\n  %s%s✂  Papercuts%s  %sscan your agent sessions for the friction they hit%s\n\n' "$B" "$Y" "$N" "$D" "$N"
  printf '  %sThis will:%s\n' "$B" "$N"
  item() { printf '  %s•%s %s\n' "$C" "$N" "$1"; }
  item "fetch the scanner into ~/.papercuts (1 to 2 minutes the first time)"
  item "read your Claude Code and Codex sessions whose project path contains \"$PROJECT\", last 7 days,"
  printf '    10 each at most (PAPERCUTS_PROJECT changes the project)\n'
  item "skip whole any session that mentions embargoed security work"
  item "redact secrets on this machine before anything leaves it: keys, tokens, passwords, private"
  printf '    keys, JWTs, credentials in URLs, EDN secrets, and long hex or random-looking strings\n'
  item "send the redacted transcript chunks to TypeSafe Jev for screening"
  item "review what Jev flags in a few short headless sessions on your own claude or codex login"
  printf '    (nothing saved; claude gets no tools, codex runs read-only)\n'
  item "post the papercuts it finds to the shared server, https://metaouch.dev"
  item "install nothing and leave nothing running"
  printf '\n'

  missing=
  lack() { missing="$missing    ${R}✗${N} $1
"; }
  case $(uname -s) in
    Darwin | Linux) ;;
    *) lack "macOS or Linux" ;;
  esac
  command -v git >/dev/null 2>&1 || lack "git"
  java -version >/dev/null 2>&1 || lack "Java: the scanner needs it to download its Clojure dependencies"
  [ -n "$claude_cli$codex_cli" ] || lack "the claude CLI (or codex): it reviews the chunks Jev flags"
  curl -fsS -m 5 "$SERVER/api/papercuts?limit=1" >/dev/null 2>&1 || lack "a connection to $host: is Tailscale up?"
  if [ -n "$missing" ]; then
    printf '  %sMissing:%s\n%s\n  Fix these and run the command again.\n' "$B" "$N" "$missing" >&2
    exit 1
  fi

  if [ "${PAPERCUTS_YES:-}" != 1 ]; then
    printf '  %s%s?%s %sGo ahead?%s [y/N] ' "$B" "$Y" "$N" "$B" "$N"
    answer=
    read -r answer </dev/tty || true
    case $answer in
      [yY]*) printf '\n' ;;
      *) printf '  Nothing was done.\n'
         exit 0 ;;
    esac
  fi

  mkdir -p "$DIR"
  : >"$LOG"
  spinner=
  trap 'kill $spinner 2>/dev/null; printf "\n  Stopped. Nothing is left running.\n"; exit 130' INT

  # GitHub, Maven and Clojars stall on some networks, so the fetch goes through the server's proxy when it answers.
  PROXY=http://$host:3128
  curl -fsS -m 5 -x "$PROXY" -o /dev/null https://github.com >/dev/null 2>&1 || PROXY=

  step 1 "Fetching scanner" fetch_scanner
  step 2 "Preparing tools" prepare_tools
  screened=0 flagged=0 submitted=0 failures=
  scan 3 claude "Scanning Claude sessions" "$claude_cli"
  scan 4 codex "Scanning Codex sessions" "$codex_cli"

  line="$screened sessions screened, $flagged flagged, $submitted submitted"
  printf '\n  %s╭──────────────────────────────────────────────────╮%s\n' "$D" "$N"
  printf '  %s│%s  %s%-46s%s  %s│%s\n' "$D" "$N" "$B" "$line" "$N" "$D" "$N"
  printf '  %s│%s  %-46s  %s│%s\n' "$D" "$N" "See them at https://metaouch.dev" "$D" "$N"
  printf '  %s╰──────────────────────────────────────────────────╯%s\n' "$D" "$N"
  if [ -n "$failures" ]; then
    printf '  %sSome sessions failed; a rerun retries them. Details: %s%s\n' "$Y" "$LOG" "$N"
  fi
  printf '  Nothing is left running. To clean up: rm -rf ~/.papercuts\n\n'
}

use_proxy() {
  [ -n "$PROXY" ] || return 0
  export HTTPS_PROXY="$PROXY" HTTP_PROXY="$PROXY" https_proxy="$PROXY" http_proxy="$PROXY"
  export JAVA_TOOL_OPTIONS="-Dhttps.proxyHost=$host -Dhttps.proxyPort=3128 -Dhttp.proxyHost=$host -Dhttp.proxyPort=3128"
}

retry() {
  tries=1
  until "$@"; do
    [ "$tries" -lt 3 ] || return 1
    tries=$((tries + 1))
    echo "Retrying ($tries of 3): $*"
    sleep 2
  done
}

sparse() {
  git -C "$REPO" config core.sparseCheckout true &&
    git -C "$REPO" config core.sparseCheckoutCone false &&
    printf '/bb.edn\n/bin/mage\n/bin/mage.bb\n/mage/\n' >"$REPO/.git/info/sparse-checkout"
}

complete() {
  for file in bb.edn bin/mage bin/mage.bb mage/src/mage/cli.clj mage/src/mage/papercuts/scan.clj; do
    [ -f "$REPO/$file" ] || return 1
  done
}

update() {
  [ -d "$REPO/.git" ] && sparse &&
    retry git -C "$REPO" fetch --depth 1 origin "$BRANCH" &&
    retry git -C "$REPO" reset --hard FETCH_HEAD &&
    git -C "$REPO" sparse-checkout reapply &&
    complete
}

clone() {
  rm -rf "$REPO"
  git clone --depth 1 --filter=blob:none --no-checkout --branch "$BRANCH" https://github.com/metabase/metabase.git "$REPO" &&
    sparse
}

fetch_scanner() {
  use_proxy
  # A stalled transfer fails after 20 seconds and is retried.
  export GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=20
  # A broken checkout must not send git up to a repository that holds ~/.papercuts.
  export GIT_CEILING_DIRECTORIES="$DIR"
  update && return 0
  echo "Starting over with a fresh checkout"
  # Keep the scan progress, so a rerun still skips what was scanned.
  rm -rf "$DIR/progress"
  if [ -d "$REPO/local" ]; then mv "$REPO/local" "$DIR/progress"; fi
  retry clone
  # Checking out fetches every file the scan needs in one go, so nothing is fetched later.
  retry git -C "$REPO" reset --hard HEAD
  if [ -d "$DIR/progress" ]; then mv "$DIR/progress" "$REPO/local"; fi
  complete
}

prepare_tools() {
  use_proxy
  retry "$REPO/bin/mage" papercuts-scan-claude --help
}

spin() {
  [ -n "$TTY" ] || return 0
  text=$1
  set -- ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
  while :; do
    for frame; do
      printf '%s  %s%s%s %s' "$CLR" "$C" "$frame" "$N" "$text"
      sleep 0.1
    done
  done
}

step() {
  label="[$1/4] $2"
  shift 2
  start=$(date +%s)
  spin "$label" &
  spinner=$!
  if ("$@") >>"$LOG" 2>&1; then ok=1; else ok=; fi
  kill "$spinner" 2>/dev/null || true
  wait "$spinner" 2>/dev/null || true
  spinner=
  elapsed=$(($(date +%s) - start))
  if [ -n "$ok" ]; then
    via=
    if [ "$label" = "[1/4] Fetching scanner" ] && [ -n "$PROXY" ]; then via=" via $host proxy"; fi
    printf '%s  %s✓%s %s%s %s(%ss)%s\n' "$CLR" "$G" "$N" "$label" "$via" "$D" "$elapsed" "$N"
  else
    printf '%s  %s✗%s %s %s(%ss)%s\n\n' "$CLR" "$R" "$N" "$label" "$D" "$elapsed" "$N"
    tail -n 15 "$LOG" | sed 's/^/    /'
    printf '\n  Full log: %s. Run the command again to retry.\n' "$LOG"
    exit 1
  fi
}

scan() {
  label="[$1/4] $3"
  if [ -z "$4" ]; then
    printf '  %s–%s %s %s(%s is not installed)%s\n' "$D" "$N" "$label" "$D" "$2" "$N"
    return 0
  fi
  counts=$DIR/.counts
  rm -f "$counts"
  {
    TYPESAFE_API_KEY=$TYPESAFE_API_KEY "$REPO/bin/mage" "papercuts-scan-$2" --project "$PROJECT" --since 7d --limit 10 \
      --verbose --server "$SERVER" 2>&1 && echo "papercuts-exit 0" || echo "papercuts-exit $?"
  } | awk -v step="$label" -v tty="$TTY" -v logf="$LOG" -v counts="$counts" \
      -v G="$G" -v R="$R" -v C="$C" -v D="$D" -v N="$N" '
    BEGIN { srand(); t0 = srand(); split("⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏", frames, " ") }
    function show() {
      if (!tty) return
      k = k % 10 + 1
      printf "\r\033[K  %s%s%s %s  %d/%d screened · %d flagged · %d submitted", C, frames[k], N, step, screened, total, flagged, submitted
      fflush()
    }
    { gsub(/\033\[[0-9;]*m/, "") }
    /^papercuts-exit / { code = $2; next }
    { print >> logf }
    /^Scanning [0-9]+ (claude|codex) session/ { total = $2; show(); next }
    /^Done\./ { screened = total; next }
    ($1 == "claude" || $1 == "codex") && NF >= 3 {
      if (!($2 in seen)) { seen[$2] = 1; if (screened < total) screened++ }
      if ($4 == "flagged") flagged++
      if ($3 == "submitted") {
        submitted++
        if (tty) printf "\r\033[K"
        printf "    %s+%s %s\n", G, N, substr($0, index($0, " - ") + 3)
      }
      if ($3 == "failed,") failed++
      show()
    }
    END {
      srand(); elapsed = srand() - t0
      if (tty) printf "\r\033[K"
      ok = code == "0"
      note = failed ? " · " failed " failed" : ""
      printf "  %s %s  %d/%d screened · %d flagged · %d submitted%s %s(%ds)%s\n", ok ? G "✓" N : R "✗" N, step,
             screened, total, flagged, submitted, note, D, elapsed, N
      printf "%d %d %d %d\n", screened, flagged, submitted, (ok && !failed) > counts
    }'
  if [ -f "$counts" ]; then
    read -r s f u fine <"$counts"
    rm -f "$counts"
    screened=$((screened + s)) flagged=$((flagged + f)) submitted=$((submitted + u))
    [ "$fine" = 1 ] || failures=1
  else
    failures=1
  fi
}

main
