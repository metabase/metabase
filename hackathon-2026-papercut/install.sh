#!/bin/sh
# Sets up papercut capture from Claude Code and Codex sessions. The papercuts server serves this at /api/install.sh
# with the Jev key filled in: curl -fsSL http://10.193.193.227:8765/api/install.sh | sh
set -eu

# Everything runs from main, so a download cut short runs nothing.
main() {
  TYPESAFE_API_KEY='@TYPESAFE_API_KEY@'
  SERVER=${PAPERCUTS_SERVER:-http://10.193.193.227:8765}
  DIR=$HOME/.papercuts
  REPO=$DIR/metabase

  case $TYPESAFE_API_KEY in
    @*) echo "Install through the papercuts server, which fills in the Jev key: curl -fsSL $SERVER/api/install.sh | sh" >&2
        exit 1 ;;
  esac

  cat <<EOF
Papercut capture for Claude Code and Codex

This adds Stop and SessionEnd hooks that scan each session as it goes, and scans your sessions
from the last 3 days now, in the background. Transcript chunks are sent to TypeSafe Jev for
screening; flagged chunks go to your own claude (or codex) CLI for a closer look, and the
papercuts it finds are submitted to $SERVER.
Sessions that mention embargoed security work are skipped whole and never sent anywhere.

EOF

  missing=
  lack() { missing="$missing  - $1
"; }
  case $(uname -s) in
    Darwin | Linux) ;;
    *) lack "macOS or Linux" ;;
  esac
  command -v git >/dev/null 2>&1 || lack "git"
  python3 -c '' >/dev/null 2>&1 || lack "python3: the hooks run on it"
  java -version >/dev/null 2>&1 || lack "Java: the scanner needs it once, to download its Clojure dependencies"
  command -v claude >/dev/null 2>&1 || command -v codex >/dev/null 2>&1 ||
    lack "the claude CLI (or codex): it reviews the chunks Jev flags"
  curl -fsS -m 5 "$SERVER/api/papercuts?limit=1" >/dev/null 2>&1 || lack "a connection to $SERVER: is Tailscale up?"
  if [ -n "$missing" ]; then
    printf 'Missing:\n%s\nFix these and run the command again.\n' "$missing" >&2
    exit 1
  fi

  echo "Starting in 5 seconds. Press Ctrl-C to stop."
  sleep 5

  echo "Fetching the scanner into $REPO (a minute or two the first time)"
  mkdir -p "$DIR"
  if [ -d "$REPO/.git" ]; then
    git -C "$REPO" fetch -q --depth 1 origin hackathon-2026-papercut-tracker
    git -C "$REPO" reset -q --hard FETCH_HEAD
  else
    rm -rf "$REPO"
    git clone -q --depth 1 --filter=blob:none --sparse --branch hackathon-2026-papercut-tracker \
      https://github.com/metabase/metabase.git "$REPO"
  fi
  git -C "$REPO" sparse-checkout set --no-cone /bb.edn /bin/mage /bin/mage.bb /mage/ \
    /hackathon-2026-papercut/session_scan_hook.py

  # The scanner reads keys from the checkout's .env.
  (umask 077 && printf 'TYPESAFE_API_KEY=%s\nPAPERCUTS_SERVER=%s\n' "$TYPESAFE_API_KEY" "$SERVER" >"$DIR/env")
  chmod 600 "$DIR/env"
  ln -sf ../env "$REPO/.env"

  cat >"$DIR/uninstall.sh" <<'EOF'
#!/bin/sh
set -eu
DIR=$HOME/.papercuts
"$DIR/metabase/bin/mage" papercuts-install-hooks --uninstall
pkill -f "$DIR/metabase/" 2>/dev/null || true
rm -rf "$DIR"
echo "Papercut capture is uninstalled."
EOF
  chmod +x "$DIR/uninstall.sh"

  "$REPO/bin/mage" papercuts-install-hooks --server "$SERVER"

  agents=
  if command -v claude >/dev/null 2>&1; then agents=claude; fi
  if command -v codex >/dev/null 2>&1; then agents="$agents codex"; fi
  nohup sh -c 'repo=$1; shift; for agent; do "$repo/bin/mage" "papercuts-scan-$agent" --since 3d --limit 20; done' \
    sh "$REPO" $agents >>"$DIR/scan.log" 2>&1 </dev/null &

  cat <<EOF

Done.
- Each settings file the hooks went into keeps its earlier version beside it, as settings.json.bak.*
- Scanning up to 20 sessions per agent from the last 3 days now: tail -f $DIR/scan.log
- New sessions are scanned as they go; that log is $REPO/local/papercuts/hook-scan.log
- Papercuts show up at https://metaouch.dev
- To uninstall: sh $DIR/uninstall.sh
EOF
}

main
