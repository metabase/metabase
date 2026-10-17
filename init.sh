#!/usr/bin/env bash
#
#   Metabase × Claude Code quickstart
#   ─────────────────────────────────
#   Postgres connection string in, AI-built dashboard out.
#
#     bash init.sh                      # or: curl -fsSL <url>/init.sh | bash
#
#   1. Makes sure you have Java 21+ and jq (fetches private copies if you don't)
#   2. Downloads the latest Metabase OSS jar and runs it on localhost
#   3. Sets Metabase up for you: admin account, API key, no forms
#   4. Connects your Postgres database
#   5. Plugs Metabase's MCP server into your local Claude Code
#   6. Asks what you want to know, has Claude build a dashboard, and opens it
#
#   Everything lives in ~/.metabase-quickstart. Run `bash init.sh --help` for more.
#
#   Requires: bash 3.2+, curl, tar, macOS or Linux (WSL works), and Claude Code
#   (offers to install it if it's missing).

if [ -z "${BASH_VERSION:-}" ]; then
  echo "Please run this script with bash:  bash init.sh" >&2
  exit 1
fi

SCRIPT_VERSION="1.0.0"
# Where this script is hosted, so we can tell people how to re-run it after `curl | bash`.
SCRIPT_URL="${MBQ_SCRIPT_URL:-}"

MBQ_HOME="${MBQ_HOME:-$HOME/.metabase-quickstart}"
MCP_NAME="metabase-local"
STATE_FILE="$MBQ_HOME/state"
PID_FILE="$MBQ_HOME/metabase.pid"
LOG_FILE="$MBQ_HOME/metabase.log"
MCP_JSON="$MBQ_HOME/mcp.json"
MARKER="$MBQ_HOME/.metabase-quickstart"

# ───────────────────────────────────────────────────────────────────────────────
#  Terminal UI
# ───────────────────────────────────────────────────────────────────────────────

IS_TTY=false; [ -t 1 ] && IS_TTY=true
HAS_TTY_IN=false; ( exec 9</dev/tty ) 2>/dev/null && HAS_TTY_IN=true

COLS=$(tput cols 2>/dev/null); [ "${COLS:-0}" -gt 20 ] 2>/dev/null || COLS=80
W=$COLS; [ "$W" -gt 96 ] && W=96

UTF8=false
case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in *[Uu][Tt][Ff]-8*|*[Uu][Tt][Ff]8*) UTF8=true ;; esac
[ "$(uname -s)" = Darwin ] && [ -z "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" ] && UTF8=true
[ -n "${MBQ_ASCII:-}" ] && UTF8=false
# bash only slices strings by character (not byte) under a UTF-8 locale
if $UTF8; then
  case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
    *[Uu][Tt][Ff]-8*|*[Uu][Tt][Ff]8*) ;;
    *) unset LC_ALL; if [ "$(uname -s)" = Darwin ]; then LC_CTYPE=UTF-8; else LC_CTYPE=C.UTF-8; fi ;;
  esac
fi

COLOR=none
if $IS_TTY && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != dumb ]; then
  case "${COLORTERM:-}" in
    truecolor|24bit) COLOR=true ;;
    *) case "${TERM:-}" in *256color*|xterm-kitty|*ghostty*|wezterm|alacritty) COLOR=256 ;; *) COLOR=16 ;; esac ;;
  esac
fi

rgb() { # r g b → $REPLY (empty when the terminal can't do 256+ colors)
  case "$COLOR" in
    true) REPLY=$'\033[38;2;'"$1;$2;$3m" ;;
    256)  REPLY=$'\033[38;5;'"$(( 16 + 36*(($1*5+127)/255) + 6*(($2*5+127)/255) + (($3*5+127)/255) ))m" ;;
    *)    REPLY="" ;;
  esac
}
lerp_rgb() { # t(0..1000) r1 g1 b1 r2 g2 b2 → $REPLY
  rgb $(( $2 + ($5-$2)*$1/1000 )) $(( $3 + ($6-$3)*$1/1000 )) $(( $4 + ($7-$4)*$1/1000 ))
}
defcolor() { # NAME r g b ansi16
  local v=""
  if [ "$COLOR" = 16 ]; then v=$'\033['"$5m"; else rgb "$2" "$3" "$4"; v=$REPLY; fi
  eval "$1=\$v"
}
defcolor C_BLUE   80 158 227 34     # Metabase blue
defcolor C_ORANGE 217 119 87 33     # Claude clay
defcolor C_GREEN  132 187 76 32
defcolor C_YELLOW 241 184 74 33
defcolor C_RED    237 110 110 31
defcolor C_PURPLE 169 137 197 35
if [ "$COLOR" = none ]; then
  B=""; D=""; I=""; R=""; HIDE_CURSOR=""; SHOW_CURSOR=""; CLR=""
else
  B=$'\033[1m'; D=$'\033[2m'; I=$'\033[3m'; R=$'\033[0m'; HIDE_CURSOR=$'\033[?25l'; SHOW_CURSOR=$'\033[?25h'; CLR=$'\r\033[K'
fi

if $UTF8; then
  S_OK="✔"; S_FAIL="✖"; S_WARN="▲"; S_INFO="•"; S_ASK="?"; S_ARROW="❯"; S_DOT="●"; S_STEP="◆"
  S_RAIL="┃"; S_RULE="─"; S_ELL="…"; BAR_FULL="█"; BAR_EMPTY="░"
  SPIN=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
else
  S_OK="+"; S_FAIL="x"; S_WARN="!"; S_INFO="*"; S_ASK="?"; S_ARROW=">"; S_DOT="o"; S_STEP="#"
  S_RAIL="|"; S_RULE="-"; S_ELL="..."; BAR_FULL="#"; BAR_EMPTY="."
  SPIN=('|' '/' '-' '\')
fi

BAR_W=30; BAR_COLORS=()
for ((i = 0; i < BAR_W; i++)); do
  lerp_rgb $(( i * 1000 / (BAR_W - 1) )) 80 158 227 217 119 87
  BAR_COLORS[i]=${REPLY:-$C_BLUE}
done

gradient() { # text → blue→clay gradient
  local s=$1 n=${#1} i out="" c
  if [ "$COLOR" != true ] && [ "$COLOR" != 256 ]; then printf '%s%s%s' "$C_BLUE" "$s" "$R"; return; fi
  for ((i = 0; i < n; i++)); do
    c=${s:i:1}
    if [ "$c" = " " ]; then out+=" "; continue; fi
    lerp_rgb $(( n > 1 ? i * 1000 / (n - 1) : 0 )) 80 158 227 217 119 87
    out+="$REPLY$c"
  done
  printf '%s%s' "$out" "$R"
}

repeat() { local s="" i; for ((i = 0; i < $2; i++)); do s+=$1; done; printf '%s' "$s"; }
trunc()  { local s=$1; [ "${#s}" -gt "$2" ] && s="${s:0:$(($2 - 1))}$S_ELL"; printf '%s' "$s"; }
tilde()  { case "$1" in "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;; *) printf '%s' "$1" ;; esac; }
human()  {
  local b=${1:-0}
  if   [ "$b" -ge 1073741824 ]; then printf '%d.%d GB' $((b / 1073741824)) $(((b % 1073741824) * 10 / 1073741824))
  elif [ "$b" -ge 1048576 ];    then printf '%d MB' $((b / 1048576))
  elif [ "$b" -ge 1024 ];       then printf '%d KB' $((b / 1024))
  else printf '%d B' "$b"; fi
}
elapsed() { local s=$1; if [ "$s" -ge 60 ]; then printf '%dm %02ds' $((s / 60)) $((s % 60)); else printf '%ds' "$s"; fi; }

ok()   { printf '   %s%s%s %s\n' "$C_GREEN" "$S_OK" "$R" "$*"; }
warn() { printf '   %s%s%s %s\n' "$C_YELLOW" "$S_WARN" "$R" "$*"; }
fail() { printf '   %s%s%s %s\n' "$C_RED" "$S_FAIL" "$R" "$*"; }
info() { printf '   %s%s%s %s\n' "$C_BLUE" "$S_INFO" "$R" "$*"; }
note() { printf '     %s%s%s\n' "$D" "$*" "$R"; }

die() { # headline [detail lines…]
  spin_stop
  printf '\n'
  fail "$B$1$R"
  shift
  local l; for l in "$@"; do note "$l"; done
  printf '\n'
  exit 1
}

STEP=0; STEPS=7
step() {
  STEP=$((STEP + 1))
  lerp_rgb $(( (STEP - 1) * 1000 / (STEPS - 1) )) 80 158 227 217 119 87
  local c=${REPLY:-$C_BLUE} title=" $1 " rule
  rule=$(repeat "$S_RULE" $(( W - 18 - ${#1} > 2 ? W - 18 - ${#1} : 2 )))
  printf '\n %s%s%s %s%d/%d%s %s%s%s %s%s%s\n' "$c" "$S_STEP" "$R" "$D" "$STEP" "$STEPS" "$R" "$B" "$title" "$R" "$D" "$rule" "$R"
}

# Spinner: a background process redraws one line; the foreground writes its message to a file.
SPIN_PID=""; SPIN_FILE=""
spin_start() {
  spin_stop
  printf '%s\n' "$1" > "$SPIN_FILE"
  if ! $IS_TTY; then printf '   %s %s\n' "$S_ELL" "$1"; return; fi
  printf '%s' "$HIDE_CURSOR"
  (
    trap 'exit 0' TERM
    i=0; t0=$SECONDS; msg=""
    while :; do
      IFS= read -r msg < "$SPIN_FILE" 2>/dev/null
      el=$((SECONDS - t0)); t=""
      [ "$el" -ge 3 ] && t=" $D$(elapsed "$el")$R"
      lerp_rgb $(( i % 20 < 10 ? (i % 20) * 111 : (20 - i % 20) * 111 )) 80 158 227 217 119 87
      printf '\r\033[K   %s%s%s %s%s' "${REPLY:-$C_BLUE}" "${SPIN[i % ${#SPIN[@]}]}" "$R" "$(trunc "$msg" $((COLS - 16)))" "$t"
      i=$((i + 1))
      sleep 0.08
    done
  ) &
  SPIN_PID=$!
}
spin_msg() { [ -n "$SPIN_FILE" ] && printf '%s\n' "$1" > "$SPIN_FILE"; }
spin_stop() { # [ok|warn|fail|info message]
  if [ -n "$SPIN_PID" ]; then
    kill "$SPIN_PID" 2>/dev/null; wait "$SPIN_PID" 2>/dev/null; SPIN_PID=""
    $IS_TTY && printf '\r\033[K%s' "$SHOW_CURSOR"
  fi
  case "${1:-}" in ok) ok "$2" ;; warn) warn "$2" ;; fail) fail "$2" ;; info) info "$2" ;; esac
}

progress_bar() { # current total label
  local cur=$1 tot=$2 pct=0 filled=0 i bar=""
  if [ "$tot" -gt 0 ]; then pct=$((cur * 100 / tot)); filled=$((cur * BAR_W / tot)); fi
  [ "$pct" -gt 100 ] && pct=100
  [ "$filled" -gt "$BAR_W" ] && filled=$BAR_W
  for ((i = 0; i < BAR_W; i++)); do
    if [ "$i" -lt "$filled" ]; then bar+="${BAR_COLORS[i]}$BAR_FULL"; else bar+="$R$D$BAR_EMPTY"; fi
  done
  printf '\r\033[K   %s%s %s%3d%%%s  %s' "$bar" "$R" "$B" "$pct" "$R" "$3"
}

ask_line() { # prompt → $REPLY (readline editing)
  local p=$'\001'"$C_ORANGE"$'\002'"$S_ARROW"$'\001'"$R"$'\002'" "
  REPLY=""
  IFS= read -e -r -p "   $p" REPLY < /dev/tty
}
ask_secret() { # → $REPLY (hidden)
  printf '   %s%s%s ' "$C_ORANGE" "$S_ARROW" "$R"
  REPLY=""
  IFS= read -r -s REPLY < /dev/tty
  printf '\n'
}
confirm() { # question default(Y|N)
  $HAS_TTY_IN || return 1
  local hint="Y/n" a; [ "$2" = N ] && hint="y/N"
  printf '   %s%s%s %s %s[%s]%s ' "$C_ORANGE" "$S_ASK" "$R" "$1" "$D" "$hint" "$R"
  IFS= read -r a < /dev/tty
  case "$a" in [Yy]*) return 0 ;; [Nn]*) return 1 ;; *) [ "$2" = Y ] ;; esac
}

banner() {
  local grid=("..f.." "SfffS" "SSfSS" "SfSfS" "SfffS" "..f..") x="×"
  $UTF8 || x="x"
  local text=(
    ""
    "$B$(gradient "M E T A B A S E   $x   C L A U D E")$R"
    "$D$(repeat "$S_RULE" 33)$R"
    "Postgres in, dashboard out."
    "${D}Metabase OSS + Claude Code, on your machine$R"
    ""
  )
  local r c line
  printf '\n'
  for r in 0 1 2 3 4 5; do
    line="   "
    for c in 0 1 2 3 4; do
      case ${grid[r]:c:1} in
        S) lerp_rgb $((c * 250)) 80 158 227 217 119 87; line+="${REPLY:-$C_BLUE}$S_DOT$R  " ;;
        f) line+="$D$C_BLUE$S_DOT$R  " ;;
        *) line+="   " ;;
      esac
    done
    printf '%s  %s\n' "$line" "${text[r]}"
    $IS_TTY && sleep 0.05
  done
}

confetti() {
  $IS_TTY && $UTF8 || return 0
  local glyphs=("✦" "✧" "•" "✶" "⋆" "✺") colors=("$C_BLUE" "$C_ORANGE" "$C_GREEN" "$C_YELLOW" "$C_PURPLE" "$C_RED")
  local f i line n=$((W - 6))
  for f in 1 2 3 4 5 6 7; do
    line=""
    for ((i = 0; i < n; i++)); do
      if [ $((RANDOM % 5)) -eq 0 ]; then line+="${colors[RANDOM % 6]}${glyphs[RANDOM % 6]}$R"; else line+=" "; fi
    done
    printf '\r   %s' "$line"
    sleep 0.06
  done
  printf '\n'
}

# ───────────────────────────────────────────────────────────────────────────────
#  Plumbing
# ───────────────────────────────────────────────────────────────────────────────

TMPQ=$(mktemp -d "${TMPDIR:-/tmp}/metabase-quickstart.XXXXXX") || { echo "Can't create a temp directory" >&2; exit 1; }
SPIN_FILE="$TMPQ/spin"
MB_BODY="$TMPQ/body.json"
MB_AUTH_FILE="$TMPQ/auth.h"
chmod 700 "$TMPQ"

on_exit() {
  spin_stop
  $IS_TTY && printf '%s' "$SHOW_CURSOR"
  rm -rf "$TMPQ"
}
on_int() {
  spin_stop
  printf '\n\n'
  warn "Interrupted."
  if pid_alive; then note "Metabase is still running at ${MB_URL:-localhost}. Stop it with: $(self_cmd) stop"; fi
  printf '\n'
  exit 130
}
trap on_exit EXIT
trap on_int INT TERM

load_state() {
  ST_PORT=""; ST_VERSION=""; ST_JAR=""; ST_EMAIL=""; ST_PASSWORD=""; ST_API_KEY=""; ST_DB_ID=""; ST_DB_NAME=""; ST_JAVA=""
  [ -f "$STATE_FILE" ] && . "$STATE_FILE"
}
save_state() {
  mkdir -p "$MBQ_HOME"
  local k
  (
    umask 077
    for k in ST_PORT ST_VERSION ST_JAR ST_EMAIL ST_PASSWORD ST_API_KEY ST_DB_ID ST_DB_NAME ST_JAVA; do
      eval "printf '%s=%q\n' \"\$k\" \"\${$k}\""
    done > "$STATE_FILE.tmp"
  ) && mv "$STATE_FILE.tmp" "$STATE_FILE"
}

self_cmd() {
  if [ -f "$MBQ_HOME/init.sh" ]; then printf 'bash %s' "$(tilde "$MBQ_HOME/init.sh")"
  elif [ -n "$SCRIPT_URL" ]; then printf 'curl -fsSL %s | bash -s --' "$SCRIPT_URL"
  else printf 'bash init.sh'; fi
}

set_auth() { # header line, e.g. "X-API-Key: mb_…" (kept in a file so it never shows up in `ps`)
  (umask 077; printf '%s\n' "$1" > "$MB_AUTH_FILE")
}

mb() { # METHOD PATH [JSON] → prints HTTP status; body lands in $MB_BODY
  local args=(-s -o "$MB_BODY" -w '%{http_code}' -X "$1" "$MB_API$2" -H 'Accept: application/json' --max-time "${MB_TIMEOUT:-60}")
  [ -s "$MB_AUTH_FILE" ] && args+=(-H "@$MB_AUTH_FILE")
  : > "$MB_BODY"
  if [ -n "${3:-}" ]; then
    printf '%s' "$3" | curl "${args[@]}" -H 'Content-Type: application/json' --data-binary @- 2>/dev/null
  else
    curl "${args[@]}" 2>/dev/null
  fi
  true
}
body() { "$JQ" -r "$1" "$MB_BODY" 2>/dev/null; }
api_error() {
  local e
  e=$(body '(.message // .errors // .) | if type == "object" then [.[]] | map(tostring) | join("; ") else tostring end' | head -c 400)
  [ -z "$e" ] && e=$(head -c 300 "$MB_BODY" 2>/dev/null)
  printf '%s' "$e"
}

pid_alive() {
  [ -f "$PID_FILE" ] || return 1
  local pid; pid=$(cat "$PID_FILE" 2>/dev/null)
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && ps -p "$pid" -o command= 2>/dev/null | grep -q "metabase"
}

port_in_use() { # anything answering on IPv4 or IPv6 localhost counts
  local rc
  curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$1/" 2>/dev/null; rc=$?
  [ "$rc" -ne 7 ] && return 0
  curl -g -s -o /dev/null --max-time 1 "http://[::1]:$1/" 2>/dev/null; rc=$?
  [ "$rc" -ne 7 ] && [ "$rc" -ne 45 ]
}

download() { # url dest
  local url=$1 dest=$2 part="$2.part" total pid size start_size=0 t0=$SECONDS el rate st
  total=$(curl -sIL --max-time 20 "$url" 2>/dev/null | tr -d '\r' | awk 'tolower($1) == "content-length:" { v = $2 } END { print v + 0 }')
  if ! $IS_TTY; then
    info "Downloading $(human "$total")"
    curl -fsSL --retry 3 -C - -o "$part" "$url" || { rm -f "$part"; return 1; }
    mv "$part" "$dest"; return 0
  fi
  [ -f "$part" ] && start_size=$(wc -c < "$part" | tr -d ' ')
  printf '%s' "$HIDE_CURSOR"
  curl -fsSL --retry 3 -C - -o "$part" "$url" 2> "$TMPQ/curl.err" &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    size=0; [ -f "$part" ] && size=$(wc -c < "$part" | tr -d ' ')
    el=$((SECONDS - t0)); rate=""
    [ "$el" -gt 0 ] && rate="  $D$(human $(((size - start_size) / el)))/s$R"
    progress_bar "$size" "$total" "$(human "$size") of $(human "$total")$rate"
    sleep 0.2
  done
  wait "$pid"; st=$?
  printf '\r\033[K%s' "$SHOW_CURSOR"
  if [ "$st" -ne 0 ]; then rm -f "$part"; return 1; fi
  mv "$part" "$dest"
}

open_url() {
  if [ "$OS" = mac ]; then open "$1" >/dev/null 2>&1
  elif command -v wslview >/dev/null 2>&1; then wslview "$1" >/dev/null 2>&1
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1
  else return 1; fi
}

copy_to_clipboard() {
  if command -v pbcopy >/dev/null 2>&1; then printf '%s' "$1" | pbcopy
  elif [ -n "${WAYLAND_DISPLAY:-}" ] && command -v wl-copy >/dev/null 2>&1; then printf '%s' "$1" | wl-copy
  elif command -v xclip >/dev/null 2>&1; then printf '%s' "$1" | xclip -selection clipboard
  elif command -v clip.exe >/dev/null 2>&1; then printf '%s' "$1" | clip.exe
  else return 1; fi
}

rand() { local n; n=$(od -An -N4 -tu4 /dev/urandom | tr -d ' \n'); printf '%d' $((n % $1)); }

generate_password() {
  local words=(toucan pivot comet lantern maple harbor sparkle cactus walrus mango falcon quartz
               velvet ember glacier meadow orbit sonar tango waffle zephyr median scatter funnel
               cohort gauge widget nimbus pixel rocket bagel canyon cobalt dingo fjord gecko
               hazel igloo jigsaw kiwi lagoon marble nectar otter pepper quokka radish saffron
               tundra umbra violet willow yonder zinnia badger cinder dune fable garnet hollow)
  printf '%s-%s-%s-%04d' "${words[$(rand ${#words[@]})]}" "${words[$(rand ${#words[@]})]}" \
    "${words[$(rand ${#words[@]})]}" "$(rand 10000)"
}

urldecode() { local s=${1//\\/\\\\}; s=${s//%/\\x}; printf '%b' "$s"; }

# Parses a Postgres connection string (URL, JDBC URL, or libpq key=value) into PG_* variables.
parse_pg() {
  local s=$1 re rest userinfo hostport query kv k v
  PG_HOST=""; PG_PORT="5432"; PG_DB=""; PG_USER=""; PG_PASS=""; PG_SSLMODE=""; PG_EXTRA=""
  # tolerate `psql "postgres://…"` and stray quotes/whitespace
  s=$(printf '%s' "$s" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^psql[[:space:]]*//' -e "s/^[\"']//" -e "s/[\"']\$//")
  s=${s#jdbc:}
  case "$s" in
    postgres://*|postgresql://*)
      re='^[a-z]+://(([^@]*)@)?([^/?#]*)(/([^?#]*))?(\?([^#]*))?'
      [[ $s =~ $re ]] || return 1
      userinfo=${BASH_REMATCH[2]}; hostport=${BASH_REMATCH[3]}; PG_DB=$(urldecode "${BASH_REMATCH[5]}"); query=${BASH_REMATCH[7]}
      if [ -n "$userinfo" ]; then
        case "$userinfo" in
          *:*) PG_USER=$(urldecode "${userinfo%%:*}"); PG_PASS=$(urldecode "${userinfo#*:}") ;;
          *)   PG_USER=$(urldecode "$userinfo") ;;
        esac
      fi
      case "$hostport" in
        \[*\]:*) PG_HOST=${hostport%%]*}; PG_HOST=${PG_HOST#[}; PG_PORT=${hostport##*]:} ;;
        \[*\])   PG_HOST=${hostport#[}; PG_HOST=${PG_HOST%]} ;;
        *:*)     PG_HOST=${hostport%:*}; PG_PORT=${hostport##*:} ;;
        *)       PG_HOST=$hostport ;;
      esac
      local IFS='&'
      for kv in $query; do
        k=${kv%%=*}; v=$(urldecode "${kv#*=}")
        case "$k" in
          sslmode) PG_SSLMODE=$v ;;
          user) PG_USER=$v ;;
          password) PG_PASS=$v ;;
          # client-library flags that mean nothing to (or break) the JDBC driver
          channel_binding|pgbouncer|connection_limit|pool_timeout|schema|connect_timeout|application_name|"") ;;
          *) PG_EXTRA="${PG_EXTRA:+$PG_EXTRA&}$kv" ;;
        esac
      done
      ;;
    *host=*|*dbname=*)
      for kv in $s; do
        k=${kv%%=*}; v=${kv#*=}; v=${v#\'}; v=${v%\'}
        case "$k" in
          host|hostaddr) PG_HOST=$v ;; port) PG_PORT=$v ;; dbname) PG_DB=$v ;;
          user) PG_USER=$v ;; password) PG_PASS=$v ;; sslmode) PG_SSLMODE=$v ;;
        esac
      done
      ;;
    *) return 1 ;;
  esac
  [ -z "$PG_HOST" ] && PG_HOST=localhost
  [ -z "$PG_DB" ] && PG_DB=${PG_USER:-postgres}
  case "$PG_PORT" in ''|*[!0-9]*) return 1 ;; esac
  return 0
}

mask_pg() {
  local auth=""
  [ -n "$PG_USER" ] && auth="$PG_USER${PG_PASS:+:$(repeat "$S_INFO" 6)}@"
  printf 'postgres://%s%s:%s/%s' "$auth" "$PG_HOST" "$PG_PORT" "$PG_DB"
}

# ───────────────────────────────────────────────────────────────────────────────
#  Step 1 — toolbox
# ───────────────────────────────────────────────────────────────────────────────

detect_platform() {
  case "$(uname -s)" in
    Darwin) OS=mac ;;
    Linux)  OS=linux ;;
    *) die "Sorry, $(uname -s) isn't supported" "This script runs on macOS and Linux (including WSL)." ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) ARCH=arm64 ;;
    x86_64|amd64)  ARCH=x64 ;;
    *) die "Sorry, $(uname -m) isn't supported" ;;
  esac
  # Apple Silicon running this shell under Rosetta still wants native binaries
  [ "$OS" = mac ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ] && ARCH=arm64
}

ensure_jq() {
  local v
  if command -v jq >/dev/null 2>&1; then
    v=$(jq --version 2>/dev/null | sed 's/^jq-//')
    case "$v" in 1.[6-9]*|1.[1-9][0-9]*|[2-9].*) JQ=$(command -v jq); ok "jq $v"; return ;; esac
  fi
  JQ="$MBQ_HOME/bin/jq"
  if [ -x "$JQ" ]; then ok "jq ${D}(private copy)$R"; return; fi
  local asset
  case "$OS-$ARCH" in
    mac-arm64) asset=jq-macos-arm64 ;; mac-x64) asset=jq-macos-amd64 ;;
    linux-arm64) asset=jq-linux-arm64 ;; linux-x64) asset=jq-linux-amd64 ;;
  esac
  mkdir -p "$MBQ_HOME/bin"
  spin_start "Fetching a private copy of jq"
  if curl -fsSL --retry 3 -o "$JQ.part" "https://github.com/jqlang/jq/releases/latest/download/$asset" \
     && chmod +x "$JQ.part" && "$JQ.part" -n 1 >/dev/null 2>&1; then
    mv "$JQ.part" "$JQ"
    spin_stop ok "jq ${D}(fetched a private copy into $(tilde "$MBQ_HOME/bin"))$R"
  else
    rm -f "$JQ.part"
    die "Couldn't download jq" "Install it yourself (https://jqlang.org/download) and run this again."
  fi
}

find_claude() {
  CLAUDE=$(command -v claude 2>/dev/null)
  local c
  if [ -z "$CLAUDE" ]; then
    for c in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude; do
      [ -x "$c" ] && CLAUDE=$c && break
    done
  fi
}

ensure_claude() {
  find_claude
  if [ -z "$CLAUDE" ]; then
    warn "Claude Code isn't installed"
    if confirm "Install it now with Anthropic's official installer?" Y; then
      printf '\n'
      curl -fsSL https://claude.ai/install.sh | bash
      printf '\n'
      find_claude
    fi
    [ -z "$CLAUDE" ] && die "Claude Code is required" \
      "Install it:  curl -fsSL https://claude.ai/install.sh | bash" "Then run this script again."
  fi

  local ver auth logged who
  ver=$("$CLAUDE" --version 2>/dev/null | awk '{ print $1 }')
  "$CLAUDE" --help 2>&1 | grep -q -- '--json-schema' \
    || die "Claude Code $ver is too old for this" "Update it:  claude update" "Then run this script again."

  auth=$("$CLAUDE" auth status 2>/dev/null)
  logged=$(printf '%s' "$auth" | "$JQ" -r '.loggedIn // empty' 2>/dev/null)
  if [ "$logged" = false ] && [ -z "${ANTHROPIC_API_KEY:-}${CLAUDE_CODE_USE_BEDROCK:-}${CLAUDE_CODE_USE_VERTEX:-}${CLAUDE_CODE_USE_FOUNDRY:-}" ]; then
    warn "Claude Code isn't logged in"
    if confirm "Log in now?" Y; then
      "$CLAUDE" auth login < /dev/tty
      auth=$("$CLAUDE" auth status 2>/dev/null)
      logged=$(printf '%s' "$auth" | "$JQ" -r '.loggedIn // empty' 2>/dev/null)
    fi
    [ "$logged" = false ] && die "Claude Code needs to be logged in" "Run:  claude auth login" "Then run this script again."
  fi
  CLAUDE_EMAIL=$(printf '%s' "$auth" | "$JQ" -r '.email // empty' 2>/dev/null)
  who=${CLAUDE_EMAIL:-$(printf '%s' "$auth" | "$JQ" -r '.authMethod // empty' 2>/dev/null)}
  ok "Claude Code $ver${who:+ ${D}· $who$R}"
}

java_major() { "$1" -version 2>&1 | awk -F'"' '/version/ { print $2; exit }' | sed -e 's/^1\.//' -e 's/[^0-9].*//'; }

ensure_java() {
  local cands=() c m jh
  [ -n "${JAVA_HOME:-}" ] && cands+=("$JAVA_HOME/bin/java")
  [ -n "$ST_JAVA" ] && cands+=("$ST_JAVA")
  if [ "$OS" = mac ]; then
    jh=$(/usr/libexec/java_home -v 21+ 2>/dev/null) && cands+=("$jh/bin/java")
    c=$(command -v java 2>/dev/null)
    # /usr/bin/java on a Mac without a JDK pops up an "install Java" dialog, so leave it alone
    [ -n "$c" ] && [ "$c" != /usr/bin/java ] && cands+=("$c")
    cands+=("$MBQ_HOME/jre/Contents/Home/bin/java")
  else
    c=$(command -v java 2>/dev/null); [ -n "$c" ] && cands+=("$c")
    cands+=("$MBQ_HOME/jre/bin/java")
  fi
  for c in "${cands[@]}"; do
    [ -x "$c" ] || continue
    m=$(java_major "$c")
    if [ -n "$m" ] && [ "$m" -ge 21 ] 2>/dev/null; then
      JAVA=$c; ST_JAVA=$c
      ok "Java $m ${D}($(tilde "$c"))$R"
      return
    fi
  done

  local os=$OS arch=aarch64
  [ "$ARCH" = x64 ] && arch=x64
  [ "$OS" = linux ] && ldd --version 2>&1 | grep -qi musl && os=alpine-linux
  info "No Java 21+ found ${D}— fetching a private Temurin 21 runtime (nothing is installed system-wide)$R"
  mkdir -p "$MBQ_HOME"
  download "https://api.adoptium.net/v3/binary/latest/21/ga/$os/$arch/jre/hotspot/normal/eclipse" "$TMPQ/jre.tar.gz" \
    || die "Couldn't download Java" "Install Java 21 yourself (https://adoptium.net) and run this again."
  rm -rf "$MBQ_HOME/jre.tmp" && mkdir -p "$MBQ_HOME/jre.tmp"
  tar -xzf "$TMPQ/jre.tar.gz" -C "$MBQ_HOME/jre.tmp" --strip-components=1 || die "Couldn't unpack Java"
  rm -rf "$MBQ_HOME/jre" && mv "$MBQ_HOME/jre.tmp" "$MBQ_HOME/jre"
  for c in "$MBQ_HOME/jre/Contents/Home/bin/java" "$MBQ_HOME/jre/bin/java"; do
    [ -x "$c" ] && JAVA=$c && ST_JAVA=$c
  done
  [ -n "$JAVA" ] || die "Java downloaded, but I can't find the java binary in it"
  ok "Java $(java_major "$JAVA") ${D}(private copy)$R"
}

step_toolbox() {
  step "Checking your toolbox"
  detect_platform
  command -v curl >/dev/null 2>&1 || die "curl is required"
  command -v tar  >/dev/null 2>&1 || die "tar is required"
  mkdir -p "$MBQ_HOME" && touch "$MARKER"
  # keep a copy of this script around, so there's something to run `stop` with later
  if [ -f "$0" ] && [ "$(basename "$0")" != bash ] && ! [ "$0" -ef "$MBQ_HOME/init.sh" ]; then
    cp "$0" "$MBQ_HOME/init.sh" 2>/dev/null
  fi
  ensure_jq
  ensure_claude
  ensure_java
}

# ───────────────────────────────────────────────────────────────────────────────
#  Step 2 — Metabase
# ───────────────────────────────────────────────────────────────────────────────

BOOT_QUIPS=(
  "Warming up the JVM"
  "Running database migrations"
  "Teaching the toucan to count"
  "Sharpening the query processor"
  "Fluffing the pie charts"
  "Snapping the dashboard grid into place"
  "Unpacking the Sample Database"
  "Asking Jetty to please listen"
)

fetch_jar() {
  local v url jar old
  spin_start "Looking up the latest Metabase release"
  v=$(curl -fsSL --max-time 15 https://static.metabase.com/version-info.json 2>/dev/null | "$JQ" -r '.latest.version // empty' 2>/dev/null)
  [ -z "$v" ] && v=$(curl -fsSL --max-time 15 https://api.github.com/repos/metabase/metabase/releases/latest 2>/dev/null | "$JQ" -r '.tag_name // empty' 2>/dev/null)
  spin_stop
  case "$v" in
    v0.*) ;;
    v1.*) v="v0.${v#v1.}" ;;  # enterprise tags mirror the OSS ones
    *) v="" ;;
  esac
  mkdir -p "$MBQ_HOME/cache"
  if [ -z "$v" ]; then
    # offline? fall back to whatever we already have
    old=$(ls -t "$MBQ_HOME"/cache/metabase-*.jar 2>/dev/null | head -1)
    if [ -n "$old" ]; then
      MBQ_JAR=$old; ST_VERSION=$(basename "$old" .jar); ST_VERSION=${ST_VERSION#metabase-}
      warn "Couldn't check for the latest release; using cached Metabase $ST_VERSION"
      return
    fi
    v=latest
  fi
  jar="$MBQ_HOME/cache/metabase-$v.jar"
  url="https://downloads.metabase.com/$v/metabase.jar"
  if [ -s "$jar" ]; then
    ok "Metabase $v ${D}(cached)$R"
  else
    info "Downloading Metabase $B$v$R ${D}— the one slow part, promise$R"
    download "$url" "$jar" || die "Couldn't download Metabase" "Check your connection and run this again (the download resumes)."
    ok "Downloaded Metabase $v"
    for old in "$MBQ_HOME"/cache/metabase-*.jar; do
      [ "$old" != "$jar" ] && [ -f "$old" ] && rm -f "$old"
    done
  fi
  MBQ_JAR=$jar; ST_VERSION=$v; ST_JAR=$jar
}

pick_port() {
  local p
  if [ -n "${MBQ_PORT:-}" ]; then
    port_in_use "$MBQ_PORT" && die "Port $MBQ_PORT is already in use" "Pick another one with --port."
    ST_PORT=$MBQ_PORT; return
  fi
  if [ -n "$ST_PORT" ] && ! port_in_use "$ST_PORT"; then return; fi
  for ((p = 3000; p < 3100; p++)); do
    if ! port_in_use "$p"; then ST_PORT=$p; return; fi
  done
  die "Couldn't find a free port between 3000 and 3099" "Pick one with --port."
}

launch_metabase() {
  mkdir -p "$MBQ_HOME/data"
  printf '\n──── %s · starting Metabase %s on port %s ────\n' "$(date)" "$ST_VERSION" "$ST_PORT" >> "$LOG_FILE"
  (
    cd "$MBQ_HOME" || exit 1
    # Don't let a Metabase developer's MB_* environment leak into this instance
    for v in $(compgen -e | grep '^MB_'); do unset "$v"; done
    export MB_JETTY_HOST=127.0.0.1 MB_JETTY_PORT="$ST_PORT" MB_DB_TYPE=h2 MB_DB_FILE="$MBQ_HOME/data/metabase" \
           MB_SITE_URL="http://localhost:$ST_PORT"
    exec nohup "$JAVA" -jar "$MBQ_JAR" >> "$LOG_FILE" 2>&1 < /dev/null
  ) &
  printf '%s\n' "$!" > "$PID_FILE"
  disown 2>/dev/null
}

wait_healthy() {
  local t0=$SECONDS el tick=0 status pct=0 p quip frame
  $IS_TTY && printf '%s' "$HIDE_CURSOR"
  $IS_TTY || info "Booting Metabase (usually under a minute)"
  while :; do
    if [ $((tick % 4)) -eq 0 ]; then
      mb GET /api/health >/dev/null
      status=$(body '.status // empty')
      [ "$status" = ok ] && break
      p=$(body '((.progress // 0) * 100) | floor')
      [ -n "$p" ] && [ "$p" -gt "$pct" ] 2>/dev/null && pct=$p
      if ! pid_alive; then
        $IS_TTY && printf '\r\033[K%s' "$SHOW_CURSOR"
        printf '\n'
        fail "${B}Metabase stopped while starting up$R ${D}— last lines of $(tilde "$LOG_FILE"):$R"
        tail -n 15 "$LOG_FILE" | sed "s/^/     $D/;s/\$/$R/"
        exit 1
      fi
    fi
    el=$((SECONDS - t0))
    [ "$el" -gt 600 ] && die "Metabase is taking too long to start" "See $(tilde "$LOG_FILE")"
    if $IS_TTY; then
      quip=${BOOT_QUIPS[$((el / 4 % ${#BOOT_QUIPS[@]}))]}
      frame=${SPIN[tick % ${#SPIN[@]}]}
      progress_bar "$pct" 100 "$C_BLUE$frame$R $quip$S_ELL $D$(elapsed "$el")$R"
    fi
    tick=$((tick + 1))
    sleep 0.25
  done
  $IS_TTY && printf '\r\033[K%s' "$SHOW_CURSOR"
  BOOT_SECONDS=$((SECONDS - t0))
}

step_metabase() {
  step "Launching Metabase"
  if pid_alive && [ -n "$ST_PORT" ]; then
    MB_API="http://127.0.0.1:$ST_PORT"; MB_URL="http://localhost:$ST_PORT"
    wait_healthy
    ok "Metabase ${ST_VERSION:-} is already running at $B$MB_URL$R"
    return
  fi
  fetch_jar
  pick_port
  MB_API="http://127.0.0.1:$ST_PORT"; MB_URL="http://localhost:$ST_PORT"
  save_state
  launch_metabase
  wait_healthy
  ok "Metabase $ST_VERSION is up at $B$MB_URL$R ${D}(booted in $(elapsed "$BOOT_SECONDS"))$R"
}

# ───────────────────────────────────────────────────────────────────────────────
#  Step 3 — setup
# ───────────────────────────────────────────────────────────────────────────────

create_api_key() {
  local gid name="Claude Code" json
  mb GET /api/permissions/group >/dev/null
  gid=$(body '[.[] | select(.magic_group_type == "admin")][0].id // 2')
  json=$("$JQ" -nc --arg n "$name" --argjson g "$gid" '{name: $n, group_id: $g}')
  if [ "$(mb POST /api/api-key "$json")" != 200 ]; then
    json=$("$JQ" -nc --arg n "$name $(date +%Y%m%d-%H%M%S)" --argjson g "$gid" '{name: $n, group_id: $g}')
    [ "$(mb POST /api/api-key "$json")" = 200 ] || die "Couldn't create an API key" "$(api_error)"
  fi
  ST_API_KEY=$(body '.unmasked_key')
}

step_setup() {
  step "Setting up Metabase"
  local token has_user email first last name pw json sid
  mb GET /api/session/properties >/dev/null
  token=$(body '."setup-token" // empty')
  has_user=$(body '."has-user-setup"')

  if [ "$has_user" = true ]; then
    if [ -n "$ST_API_KEY" ]; then
      set_auth "X-API-Key: $ST_API_KEY"
      if [ "$(mb GET /api/user/current)" = 200 ]; then ok "Already set up ${D}· admin: $ST_EMAIL$R"; return; fi
    fi
    [ -n "$ST_PASSWORD" ] || die "This Metabase was set up without this script" \
      "Start fresh with:  $(self_cmd) uninstall"
    set_auth ""
    json=$("$JQ" -nc --arg u "$ST_EMAIL" --arg p "$ST_PASSWORD" '{username: $u, password: $p}')
    [ "$(mb POST /api/session "$json")" = 200 ] || die "Couldn't log in to Metabase as $ST_EMAIL" "$(api_error)"
    set_auth "X-Metabase-Session: $(body .id)"
    create_api_key
    set_auth "X-API-Key: $ST_API_KEY"
    save_state
    ok "Already set up ${D}· minted a fresh API key$R"
    return
  fi

  # Fresh instance: invent everything so nobody has to fill in a form.
  # (On a Mac without developer tools, /usr/bin/git pops up an installer, so only ask git when it's real.)
  email=${CLAUDE_EMAIL:-}
  if [ "$OS" != mac ] || xcode-select -p >/dev/null 2>&1; then
    [ -z "$email" ] && email=$(git config --global user.email 2>/dev/null)
    name=$(git config --global user.name 2>/dev/null)
  fi
  local email_re='^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$'
  [[ $email =~ $email_re ]] || email="admin@metabase.local"
  [ -z "$name" ] && [ "$OS" = mac ] && name=$(id -F 2>/dev/null)
  first=${name%% *}; last=""; [ "$name" != "$first" ] && last=${name#* }
  pw=$(generate_password)

  spin_start "Creating your admin account"
  json=$("$JQ" -nc --arg t "$token" --arg e "$email" --arg p "$pw" --arg f "$first" --arg l "$last" \
    '{token: $t,
      user: ({email: $e, password: $p} + (if $f != "" then {first_name: $f} else {} end) + (if $l != "" then {last_name: $l} else {} end)),
      prefs: {site_name: (if $f != "" then "\($f)’s Metabase" else "Metabase" end), site_locale: "en"}}')
  [ "$(mb POST /api/setup "$json")" = 200 ] || die "Metabase setup failed" "$(api_error)"
  sid=$(body .id)
  ST_EMAIL=$email; ST_PASSWORD=$pw
  save_state
  set_auth "X-Metabase-Session: $sid"
  spin_msg "Minting an API key for Claude Code"
  create_api_key
  set_auth "X-API-Key: $ST_API_KEY"
  save_state
  FRESH_SETUP=true
  spin_stop ok "Admin account ${D}$email$R"
  ok "API key for Claude Code ${D}(saved in $(tilde "$STATE_FILE"))$R"
}

# ───────────────────────────────────────────────────────────────────────────────
#  Step 4 — data
# ───────────────────────────────────────────────────────────────────────────────

use_sample_db() {
  mb GET /api/database >/dev/null
  ST_DB_ID=$(body '[(.data // .)[] | select(.is_sample)][0].id // empty')
  ST_DB_NAME=$(body '[(.data // .)[] | select(.is_sample)][0].name // empty')
  [ -n "$ST_DB_ID" ]
}

connect_pg() { # uses PG_* → sets ST_DB_ID/ST_DB_NAME, or returns 1 with CONNECT_ERROR
  local ssl=true mode=prefer details json existing
  case "$PG_SSLMODE" in
    disable) ssl=false; mode="" ;;
    allow|prefer|require|verify-ca|verify-full) mode=$PG_SSLMODE ;;
  esac
  mb GET /api/database >/dev/null
  existing=$("$JQ" -r --arg h "$PG_HOST" --arg p "$PG_PORT" --arg d "$PG_DB" \
    '[(.data // .)[] | select(.engine == "postgres" and .details.host == $h and ((.details.port // 5432) | tostring) == $p and .details.dbname == $d)][0] | select(.) | "\(.id)\t\(.name)"' "$MB_BODY" 2>/dev/null)
  if [ -n "$existing" ]; then
    IFS=$'\t' read -r ST_DB_ID ST_DB_NAME <<< "$existing"
    return 0
  fi
  json=$("$JQ" -nc --arg h "$PG_HOST" --argjson port "$PG_PORT" --arg db "$PG_DB" --arg u "$PG_USER" --arg pw "$PG_PASS" \
    --argjson ssl "$ssl" --arg mode "$mode" --arg extra "$PG_EXTRA" \
    '{engine: "postgres", name: $db, is_full_sync: true, is_on_demand: false, auto_run_queries: true,
      details: ({host: $h, port: $port, dbname: $db, user: $u, password: $pw, ssl: $ssl}
                + (if $mode != "" then {"ssl-mode": $mode} else {} end)
                + (if $extra != "" then {"additional-options": $extra} else {} end))}')
  MB_TIMEOUT=120
  if [ "$(mb POST /api/database "$json")" = 200 ]; then
    MB_TIMEOUT=60
    ST_DB_ID=$(body .id); ST_DB_NAME=$(body .name)
    return 0
  fi
  MB_TIMEOUT=60
  CONNECT_ERROR=$(api_error)
  [ -z "$CONNECT_ERROR" ] && CONNECT_ERROR="Metabase couldn't connect (no details given)"
  return 1
}

wait_sync() {
  local t0=$SECONDS status n done_n
  spin_start "Reading your schema"
  while :; do
    mb GET "/api/database/$ST_DB_ID?include=tables" >/dev/null
    status=$(body '.initial_sync_status // empty')
    n=$(body '[.tables[]? | select(.visibility_type == null)] | length')
    done_n=$(body '[.tables[]? | select(.visibility_type == null and .initial_sync_status == "complete")] | length')
    [ "$status" = complete ] && break
    [ "$status" = aborted ] && { spin_stop warn "Metabase had trouble syncing some tables; carrying on"; break; }
    if [ $((SECONDS - t0)) -gt 600 ]; then spin_stop warn "Still syncing after 10 minutes; carrying on anyway"; break; fi
    if [ "${n:-0}" -gt 0 ]; then spin_msg "Reading your schema $D· $done_n/$n tables$R"; fi
    sleep 1
  done
  spin_stop
  DB_ENGINE=$(body '.engine // "postgres"')
  TABLES_COUNT=$(body '[.tables[]? | select(.visibility_type == null)] | length')
  TABLES_DISPLAY=$(body '[.tables[]? | select(.visibility_type == null) | .display_name] | sort | (if length > 8 then (.[0:8] | join(", ")) + ", and \(length - 8) more" else join(", ") end)')
  TABLES_FOR_PROMPT=$(body '[.tables[]? | select(.visibility_type == null) | (if .schema then "\(.schema).\(.name)" else .name end) + " (table id \(.id))"] | .[0:80] | join(", ")')
  ok "Synced $B$ST_DB_NAME$R ${D}· $TABLES_COUNT tables: $TABLES_DISPLAY$R"
}

step_data() {
  step "Connecting your data"
  if [ -n "$ST_DB_ID" ] && ! $NEW_DB && [ "$(mb GET "/api/database/$ST_DB_ID")" = 200 ]; then
    ST_DB_NAME=$(body .name)
    info "Using $B$ST_DB_NAME$R ${D}(connected on a previous run · --new-db to connect another)$R"
    wait_sync
    return
  fi

  local url="${MBQ_DB_URL:-}" from_flag=false
  [ -n "$url" ] && from_flag=true
  if [ -z "$url" ] && [ -n "${DATABASE_URL:-}" ] && parse_pg "$DATABASE_URL"; then
    if confirm "Found \$DATABASE_URL ($(mask_pg)). Use it?" Y; then url=$DATABASE_URL; fi
  fi

  while :; do
    if [ -z "$url" ]; then
      $HAS_TTY_IN || die "No database to connect" "Pass one with --db-url 'postgres://…' (or MBQ_DB_URL)."
      printf '   Paste a %sPostgres connection string%s %s(input is hidden)%s\n' "$B" "$R" "$D" "$R"
      note "postgres://user:password@host:5432/database"
      note "or just press ⏎ to take Metabase's Sample Database for a spin"
      ask_secret
      url=$REPLY
      if [ -z "$url" ]; then
        use_sample_db || die "Couldn't find the Sample Database"
        ok "Using Metabase's $B$ST_DB_NAME$R"
        break
      fi
    fi
    if ! parse_pg "$url"; then
      fail "That doesn't look like a Postgres connection string"
      $from_flag && exit 1
      url=""; printf '\n'; continue
    fi
    spin_start "Connecting to $(mask_pg)"
    if connect_pg; then
      spin_stop ok "Connected to $B$ST_DB_NAME$R ${D}($(mask_pg))$R"
      break
    fi
    spin_stop fail "Couldn't connect to $(mask_pg)"
    note "$CONNECT_ERROR"
    case "$PG_HOST" in
      localhost|127.*|::1) note "Tip: Metabase runs on this machine, so localhost means this machine (not a container)." ;;
    esac
    $from_flag && exit 1
    url=""; printf '\n'
  done
  save_state
  wait_sync
}

# ───────────────────────────────────────────────────────────────────────────────
#  Step 5 — Claude Code
# ───────────────────────────────────────────────────────────────────────────────

step_claude() {
  step "Plugging Metabase into Claude Code"
  local mcp_url="$MB_API/api/metabase-mcp" code existing

  (umask 077; "$JQ" -n --arg name "$MCP_NAME" --arg url "$mcp_url" --arg key "$ST_API_KEY" \
    '{mcpServers: {($name): {type: "http", url: $url, headers: {"X-API-Key": $key}}}}' > "$MCP_JSON")

  spin_start "Saying hello to the Metabase MCP server"
  code=$(curl -s -o "$TMPQ/mcp.out" -w '%{http_code}' -X POST "$mcp_url" --max-time 20 \
    -H "@$MB_AUTH_FILE" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    --data-binary '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"metabase-quickstart","version":"1"}}}' 2>/dev/null)
  if [ "$code" != 200 ]; then
    spin_stop fail "The MCP server didn't answer (HTTP $code)"
    die "Metabase's MCP server isn't available" "It ships with Metabase 0.61+ and needs AI features switched on (Admin › AI)."
  fi
  spin_stop ok "MCP server is live ${D}· $mcp_url$R"

  REGISTERED=false
  existing=$("$CLAUDE" mcp get "$MCP_NAME" 2>/dev/null)
  if [ -n "$existing" ] && ! printf '%s' "$existing" | grep -q '/api/metabase-mcp'; then
    warn "You already have an MCP server called '$MCP_NAME' that isn't this Metabase, so I left it alone"
    return
  fi
  spin_start "Registering it with Claude Code"
  "$CLAUDE" mcp remove -s user "$MCP_NAME" >/dev/null 2>&1
  if "$CLAUDE" mcp add -s user --transport http "$MCP_NAME" "$mcp_url" -H "X-API-Key: $ST_API_KEY" >/dev/null 2>&1; then
    REGISTERED=true
    spin_stop ok "Added to Claude Code as $B$MCP_NAME$R ${D}· every claude session can now use your Metabase$R"
  else
    spin_stop warn "Couldn't register the MCP server globally ${D}(this run still works)$R"
  fi
}

# ───────────────────────────────────────────────────────────────────────────────
#  Step 6 — question
# ───────────────────────────────────────────────────────────────────────────────

step_question() {
  step "Ask your data a question"
  QUESTION="${MBQ_QUESTION:-}"
  if [ -n "$QUESTION" ]; then
    info "$B$QUESTION$R"
    return
  fi
  if ! $HAS_TTY_IN; then
    QUESTION="Give me an overview of the most important metrics and trends in this data."
    info "$QUESTION"
    return
  fi
  local examples=(
    "How is revenue trending, and what's driving it?"
    "Who are our best customers, and what do they have in common?"
    "What changed in the last 90 days?"
    "Which products are growing fastest, and which are slipping?"
    "Where are we losing people, and when?"
  )
  printf '   What do you want to know about %s%s%s?\n' "$B" "$ST_DB_NAME" "$R"
  note "e.g. \"${examples[$(rand ${#examples[@]})]}\"  ·  ⏎ for a general overview"
  ask_line
  QUESTION=$REPLY
  [ -z "$QUESTION" ] && QUESTION="Give me an overview of the most important metrics and trends in this data."
}

# ───────────────────────────────────────────────────────────────────────────────
#  Step 7 — Claude builds the dashboard
# ───────────────────────────────────────────────────────────────────────────────

IFS= read -r -d '' JQ_FEED <<'JQ'
def clean: tostring | gsub("[[:cntrl:]]+"; " ") | gsub("\\s+"; " ") | sub("^ "; "");
(fromjson? // empty) as $e
| if $e.type == "assistant" then
    $e.message.content[]?
    | if .type == "tool_use" then
        (.name | sub("^mcp__[^_]+__"; "")) as $t
        | (.input // {}) as $i
        | ["tool", $t,
           ( if $t == "search" then [$i.term_queries[]?, $i.semantic_queries[]?] | map(tostring) | join(", ")
             elif $t == "read_resource" then [$i | .. | strings | select(startswith("metabase://"))] | unique | join("  ")
             elif ($t == "execute_sql" or $t == "construct_native_query") then ($i.sql // $i.query // "")
             elif ($t == "create_question" or $t == "create_metric") then ($i.name // "") + (if $i.display then "  · " + $i.display else "" end)
             elif ($t == "create_dashboard" or $t == "create_collection") then ($i.name // "")
             elif $t == "update_dashboard" then [$i.dashcards[]? | select(.action == "add")] | length | if . > 0 then "placing \(.) cards" else "" end
             else "" end | clean )]
      elif .type == "text" then ["text", (.text | clean)]
      else empty end
  elif $e.type == "user" then
    $e.message.content[]?
    | select(type == "object" and .type == "tool_result" and .is_error == true)
    | ["error", ((.content | if type == "array" then map(.text? // "") | join(" ") else tostring end) | clean)]
  else empty end
| map(tostring) | join("")
JQ

FEED_LAST=""; FEED_REPEAT=1
feed_line() { # icon color label detail [detail-style]
  local width=$((COLS - 32)) detail up="" count=""
  [ "$width" -lt 20 ] && width=20
  detail=$(trunc "$4" "$width")
  # In a real terminal, fold repeats of a detail-less line ("Shaping a query") into one line with a counter
  if [ -n "$CLR" ] && [ -z "$4" ] && [ -n "$3" ] && [ "$FEED_LAST" = "$3" ]; then
    FEED_REPEAT=$((FEED_REPEAT + 1)); up=$'\033[1A'; count=" $D×$FEED_REPEAT$R"
  else
    FEED_REPEAT=1
  fi
  FEED_LAST=$3; [ -n "$4" ] && FEED_LAST=""
  printf '%s%s   %s  %s%-17s%s %s%s%s%s\n' "$up" "$CLR" "$1" "$2" "$3" "$R" "${5:-$D}" "$detail" "$R" "$count"
}

render_feed() {
  local kind a b saved=0 icon color label
  while IFS=$'\x1f' read -r kind a b; do
    case "$kind" in
      tool)
        case "$a" in
          search)                 icon="🔎"; color=$C_BLUE;   label="Searching" ;;
          read_resource)          icon="📖"; color=$C_BLUE;   label="Reading" ;;
          construct_query)        icon="🧩"; color=$C_PURPLE; label="Shaping a query" ;;
          construct_native_query) icon="🧩"; color=$C_PURPLE; label="Writing SQL" ;;
          execute_query|query)    icon="🚀"; color=$C_PURPLE; label="Running a query" ;;
          execute_sql)            icon="🚀"; color=$C_PURPLE; label="Running SQL" ;;
          execute_question)       icon="🚀"; color=$C_PURPLE; label="Re-running" ;;
          create_collection)      icon="📁"; color=$C_GREEN;  label="New collection" ;;
          create_question)        icon="📊"; color=$C_GREEN;  label="Saved a chart"; saved=$((saved + 1)) ;;
          create_metric)          icon="📐"; color=$C_GREEN;  label="Saved a metric" ;;
          create_dashboard)       icon="🎨"; color=$C_ORANGE; label="New dashboard" ;;
          update_dashboard)       icon="🧱"; color=$C_ORANGE; label="Arranging cards" ;;
          update_question|update_metric) icon="🔧"; color=$C_ORANGE; label="Tweaking" ;;
          StructuredOutput)       icon="📝"; color=$C_ORANGE; label="Writing it up" ;;
          *)                      icon="🔧"; color=$C_BLUE;   label=$a ;;
        esac
        $UTF8 || icon="$S_INFO"
        case "$a" in
          create_question|create_dashboard|create_collection|create_metric) feed_line "$icon" "$color$B" "$label" "$b" "$B" ;;
          *) feed_line "$icon" "$color" "$label" "$b" ;;
        esac
        case "$a" in
          create_question)  spin_msg "Claude is building charts $D· $saved saved so far$R" ;;
          create_dashboard) spin_msg "Claude is laying out your dashboard" ;;
          StructuredOutput) spin_msg "Wrapping up" ;;
          execute_*|query)  spin_msg "Claude is checking the numbers" ;;
          *) [ "$saved" -eq 0 ] && spin_msg "Claude is exploring your data" ;;
        esac
        ;;
      text)
        $UTF8 && icon="💭" || icon=" "
        feed_line "$icon" "$D" "" "$a" "$D$I"
        ;;
      error)
        $UTF8 && icon="🔁" || icon="$S_WARN"
        feed_line "$icon" "$C_YELLOW" "Adjusting" "$a"
        ;;
    esac
  done
}

build_prompt() {
  IFS= read -r -d '' PROMPT <<EOF
Build a Metabase dashboard that answers this question:

  "$QUESTION"

Context
- Metabase: $MB_URL (a fresh local instance; you're an admin).
- Data: database id $ST_DB_ID, "$ST_DB_NAME" ($DB_ENGINE).
- Tables: $TABLES_FOR_PROMPT
- Only use database $ST_DB_ID. Ignore any other database.

How to work
1. Explore before designing. Read the relevant tables' fields with read_resource (metabase://table/{id}/fields, up to 5 URIs per call). Run a few small queries to learn date ranges, grain, and what the key columns contain.
2. Decide on the story: the direct answer, what explains it, and what someone should look at next.
3. Create a collection for this analysis with create_collection, named after the topic.
4. Build 7 to 9 questions that tell that story, top to bottom:
   - 4 headline numbers first (display "scalar", or "smartscalar" for a metric with a date breakout so it shows the change vs the previous period).
   - Then the main trend over time (display "line", "area" or "bar", at a sensible time grain).
   - Then 2 or 4 breakdowns that explain the headline (display "bar", "row" or "line", sorted descending, top 10; "pie" only for 5 or fewer slices).
   - Optionally, a detail "table" at the end.
   Prefer construct_query (MBQL). Use construct_native_query (SQL) only when MBQL can't express it. Before saving a question, run its query and check the result is non-empty and makes sense. If a tool call fails, read the error and fix the call.
   Save every question into the collection with a short, human title (no "Chart of…") and a one-sentence description.
5. Create the dashboard in the same collection with create_dashboard, with question_ids null. Give it a punchy title (6 words max) and a one-sentence description. Then add the questions in story order with a single update_dashboard call. Cards fill a 24-column grid left to right: headline numbers with display_size null (4 fit in a row), the main trend with "full", breakdowns with display_size null (they sit side by side in pairs), and a table with "full".
6. Don't modify or delete anything you didn't create.

Finish with the structured output: the dashboard id, its title, a one-sentence headline that directly answers the question, and 3 to 5 insights. Each insight is one short sentence with a concrete number from the data.
EOF
  SYSTEM_PROMPT="You are running headless inside the Metabase quickstart script. Nobody can answer follow-up questions, so make sensible assumptions and keep going. You can only act through the $MCP_NAME MCP tools."
  SCHEMA='{"type":"object","additionalProperties":false,"required":["dashboard_id","title","headline","insights"],"properties":{"dashboard_id":{"type":"integer","description":"Id of the dashboard you created"},"title":{"type":"string"},"headline":{"type":"string","description":"One sentence that directly answers the question"},"insights":{"type":"array","items":{"type":"string"},"description":"3-5 short findings, each with a concrete number"}}}'
}

step_build() {
  step "Claude is building your dashboard"
  build_prompt
  mkdir -p "$MBQ_HOME/logs"
  local stamp raw err st t0=$SECONDS result is_error
  stamp=$(date +%Y%m%d-%H%M%S)
  raw="$MBQ_HOME/logs/claude-$stamp.jsonl"
  err="$MBQ_HOME/logs/claude-$stamp.err"
  local args=(-p "$PROMPT" --append-system-prompt "$SYSTEM_PROMPT"
              --mcp-config "$MCP_JSON" --strict-mcp-config
              --allowedTools "mcp__$MCP_NAME" --tools ""
              --permission-mode dontAsk
              --output-format stream-json --verbose
              --json-schema "$SCHEMA")
  [ -n "${MBQ_MODEL:-}" ] && args+=(--model "$MBQ_MODEL")

  note "Watch Claude work. This usually takes 2 to 5 minutes."
  printf '\n'
  spin_start "Claude is exploring your data"
  ( cd "$MBQ_HOME" && exec "$CLAUDE" "${args[@]}" < /dev/null 2> "$err" ) \
    | tee "$raw" | "$JQ" --unbuffered -Rr "$JQ_FEED" 2>/dev/null | render_feed
  st=${PIPESTATUS[0]}
  spin_stop
  BUILD_SECONDS=$((SECONDS - t0))

  result=$("$JQ" -Rc 'fromjson? | select(.type == "result")' "$raw" 2>/dev/null | tail -n 1)
  is_error=$(printf '%s' "$result" | "$JQ" -r '.is_error // false' 2>/dev/null)
  SESSION_ID=$(printf '%s' "$result" | "$JQ" -r '.session_id // empty' 2>/dev/null)
  DASH_ID=$(printf '%s' "$result" | "$JQ" -r '.structured_output.dashboard_id // empty' 2>/dev/null)
  DASH_HEADLINE=$(printf '%s' "$result" | "$JQ" -r '.structured_output.headline // empty' 2>/dev/null)
  printf '%s' "$result" | "$JQ" -r '.structured_output.insights[]? // empty' > "$TMPQ/insights" 2>/dev/null

  if [ -z "$result" ] || [ "$is_error" = true ] || { [ "$st" -ne 0 ] && [ -z "$DASH_ID" ]; }; then
    printf '\n'
    fail "${B}Claude didn't finish$R"
    local msg
    msg=$(printf '%s' "$result" | "$JQ" -r '.result // empty' 2>/dev/null | head -c 600)
    [ -n "$msg" ] && note "$msg"
    [ -s "$err" ] && tail -n 5 "$err" | while IFS= read -r l; do note "$l"; done
    note "Your Metabase is still running at $MB_URL. Run the script again to retry."
    note "Full transcript: $(tilde "$raw")"
    printf '\n'
    exit 1
  fi

  if [ -z "$DASH_ID" ]; then
    # no structured output: fall back to the newest dashboard
    mb GET "/api/search?models=dashboard" >/dev/null
    DASH_ID=$(body '[.data[]?.id] | max // empty')
  fi
  [ -n "$DASH_ID" ] || die "Claude finished, but I can't find the dashboard it made" "Transcript: $(tilde "$raw")"

  mb GET "/api/dashboard/$DASH_ID" >/dev/null
  DASH_TITLE=$(body '.name // empty')
  DASH_CARDS=$(body '[.dashcards[]? | select(.card_id != null)] | length')
  DASH_URL="$MB_URL/dashboard/$DASH_ID"
  printf '\n'
  ok "Built $B${DASH_TITLE:-your dashboard}$R ${D}· $DASH_CARDS cards in $(elapsed "$BUILD_SECONDS")$R"
}

# ───────────────────────────────────────────────────────────────────────────────
#  Finale
# ───────────────────────────────────────────────────────────────────────────────

rail() { printf '   %s%s%s %s\n' "$C_ORANGE" "$S_RAIL" "$R" "$*"; }

wrap_rail() { # prefix-first prefix-rest text
  local first=true line
  printf '%s\n' "$3" | fold -s -w $((W - 12)) | while IFS= read -r line; do
    if $first; then rail "$1$line"; first=false; else rail "$2$line"; fi
  done
}

finale() {
  printf '\n'
  confetti
  local copied=""
  if ${FRESH_SETUP:-false} && $IS_TTY && copy_to_clipboard "$ST_PASSWORD" 2>/dev/null; then copied=" ${D}(copied to your clipboard)$R"; fi

  rail
  rail "$B$(gradient "${DASH_TITLE:-Your dashboard}")$R"
  [ -n "$DASH_HEADLINE" ] && wrap_rail "$I" "$I" "$DASH_HEADLINE$R"
  if [ -s "$TMPQ/insights" ]; then
    rail
    while IFS= read -r line; do
      wrap_rail "$C_BLUE$S_INFO$R " "  " "$line"
    done < "$TMPQ/insights"
  fi
  rail
  rail "${D}Dashboard$R  $B$DASH_URL$R"
  rail "${D}Log in$R     $ST_EMAIL"
  rail "${D}Password$R   $ST_PASSWORD$copied"
  rail
  rail "${D}Next$R"
  rail "  Ask another question   $C_BLUE$(self_cmd)$R"
  rail "  Chat with your data    ${C_BLUE}claude$R ${D}(Metabase is connected as $MCP_NAME)$R"
  rail "  Stop Metabase          $C_BLUE$(self_cmd) stop$R"
  rail
  printf '\n'

  if ! $NO_BROWSER && open_url "$DASH_URL"; then
    info "Opened it in your browser"
  fi

  if ! $NO_CHAT && $HAS_TTY_IN && [ -n "$SESSION_ID" ]; then
    printf '\n   %s%s%s Press %s⏎%s to keep refining it with Claude, or %sq%s to wrap up ' \
      "$C_ORANGE" "$S_ARROW" "$R" "$B" "$R" "$B" "$R"
    local key=""
    IFS= read -r -n 1 key < /dev/tty
    printf '\n'
    if [ -z "$key" ]; then
      printf '\n'
      info "Resuming Claude's session ${D}— try \"add a chart of …\" or \"make the headline numbers compare to last year\"$R"
      printf '\n'
      local cargs=(--resume "$SESSION_ID" --allowedTools "mcp__$MCP_NAME")
      $REGISTERED || cargs+=(--mcp-config "$MCP_JSON")
      on_exit; trap - EXIT INT TERM
      cd "$MBQ_HOME" && exec "$CLAUDE" "${cargs[@]}" < /dev/tty
    fi
  fi
  printf '\n   %s%s%s\n\n' "$B" "$(gradient "Have fun!")" "$R"
}

# ───────────────────────────────────────────────────────────────────────────────
#  Commands
# ───────────────────────────────────────────────────────────────────────────────

cmd_run() {
  banner
  load_state
  step_toolbox
  step_metabase
  step_setup
  step_data
  step_claude
  step_question
  step_build
  finale
}

cmd_stop() {
  load_state
  if ! pid_alive; then info "Metabase isn't running"; rm -f "$PID_FILE"; return; fi
  local pid i; pid=$(cat "$PID_FILE")
  spin_start "Stopping Metabase"
  kill "$pid" 2>/dev/null
  for ((i = 0; i < 60; i++)); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
  rm -f "$PID_FILE"
  spin_stop ok "Stopped Metabase ${D}(your data and dashboards are kept; run the script again to start it)$R"
}

cmd_status() {
  load_state
  JQ=$(command -v jq 2>/dev/null); [ -x "$MBQ_HOME/bin/jq" ] && [ -z "$JQ" ] && JQ="$MBQ_HOME/bin/jq"
  printf '\n'
  if pid_alive; then ok "Metabase ${ST_VERSION:-} running at ${B}http://localhost:$ST_PORT$R ${D}(pid $(cat "$PID_FILE"))$R"
  else info "Metabase isn't running"; fi
  [ -n "$ST_DB_NAME" ] && info "Database: $ST_DB_NAME"
  [ -n "$ST_EMAIL" ] && info "Admin: $ST_EMAIL ${D}/ $ST_PASSWORD$R"
  find_claude
  if [ -n "$CLAUDE" ] && "$CLAUDE" mcp get "$MCP_NAME" >/dev/null 2>&1; then info "Claude Code: connected as $MCP_NAME"
  else info "Claude Code: not connected"; fi
  [ -d "$MBQ_HOME" ] && info "Home: $(tilde "$MBQ_HOME") ${D}($(du -sh "$MBQ_HOME" 2>/dev/null | awk '{ print $1 }'))$R"
  printf '\n'
}

cmd_uninstall() {
  printf '\n'
  warn "This stops Metabase, removes '$MCP_NAME' from Claude Code, and deletes $(tilde "$MBQ_HOME")"
  note "including the local Metabase's questions and dashboards. Your Postgres database isn't touched."
  if ! confirm "Go ahead?" N; then info "Nothing changed"; return; fi
  cmd_stop
  find_claude
  if [ -n "$CLAUDE" ] && "$CLAUDE" mcp get "$MCP_NAME" 2>/dev/null | grep -q '/api/metabase-mcp'; then
    "$CLAUDE" mcp remove -s user "$MCP_NAME" >/dev/null 2>&1 && ok "Removed $MCP_NAME from Claude Code"
  fi
  if [ -f "$MARKER" ] && [ "$MBQ_HOME" != "$HOME" ] && [ "$MBQ_HOME" != / ]; then
    rm -rf "$MBQ_HOME" && ok "Deleted $(tilde "$MBQ_HOME")"
  fi
  printf '\n'
}

cmd_help() {
  cat <<EOF

  ${B}Metabase × Claude Code quickstart$R ${D}v$SCRIPT_VERSION$R
  Postgres connection string in, AI-built dashboard out.

  ${B}Usage$R
    bash init.sh [command] [options]

  ${B}Commands$R
    ${C_BLUE}(none)$R         Set everything up (or pick up where you left off) and build a dashboard
    ${C_BLUE}status$R         Show what's running
    ${C_BLUE}stop$R           Stop the local Metabase
    ${C_BLUE}uninstall$R      Stop Metabase, disconnect Claude Code, delete $(tilde "$MBQ_HOME")

  ${B}Options$R
    --db-url URL     Postgres connection string (skips the prompt)
    --new-db         Connect a different database than last time
    --question TEXT  What to ask (skips the prompt)
    --port N         Port for Metabase (default: first free port from 3000)
    --no-browser     Don't open the dashboard in a browser
    --no-chat        Don't offer to keep chatting with Claude at the end
    -h, --help       Show this help

  ${B}Environment$R
    MBQ_HOME         Where everything lives (default: ~/.metabase-quickstart)
    MBQ_DB_URL       Same as --db-url
    MBQ_QUESTION     Same as --question
    MBQ_PORT         Same as --port
    MBQ_MODEL        Claude model to use (e.g. opus, sonnet)
    NO_COLOR         Turn off colors

EOF
}

main() {
  CMD=run; NEW_DB=false; NO_BROWSER=false; NO_CHAT=false; FRESH_SETUP=false; REGISTERED=false
  while [ $# -gt 0 ]; do
    case "$1" in
      run|start) CMD=run ;;
      stop|status|uninstall|help) CMD=$1 ;;
      -h|--help) CMD=help ;;
      --db-url|--question|--port)
        [ $# -ge 2 ] || die "$1 needs a value"
        case "$1" in --db-url) MBQ_DB_URL=$2 ;; --question) MBQ_QUESTION=$2 ;; --port) MBQ_PORT=$2 ;; esac
        shift ;;
      --db-url=*)   MBQ_DB_URL=${1#*=} ;;
      --question=*) MBQ_QUESTION=${1#*=} ;;
      --port=*)     MBQ_PORT=${1#*=} ;;
      --new-db)     NEW_DB=true ;;
      --no-browser) NO_BROWSER=true ;;
      --no-chat)    NO_CHAT=true ;;
      *) die "Unknown option: $1" "Run with --help to see what's available." ;;
    esac
    shift
  done

  case "$CMD" in
    run) cmd_run ;;
    stop) cmd_stop ;;
    status) cmd_status ;;
    uninstall) cmd_uninstall ;;
    help) cmd_help ;;
  esac
}

# One line, so a half-downloaded `curl | bash` never runs a partial script.
main "$@"; exit $?
