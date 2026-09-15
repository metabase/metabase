#!/usr/bin/env bash
# Self-test for bench-sync.sh — verifies public CLI behavior only, runs offline.
# Usage: bash modules/drivers/athena/scripts/bench-self-test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/bench-sync.sh"

PASS=0; FAIL=0
check() { # check <label> <condition-result>
  if [ "$2" -eq 0 ]; then PASS=$((PASS+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1"; fi
}

# --- 1. --help exits 0, prints usage, leaks no secret values -------------
export MB_ATHENA_TEST_SECRET_KEY="FAKESECRETVALUE123"
OUT="$(bash "$SCRIPT" --help 2>&1)"; RC=$?
check "--help exits 0" $([ $RC -eq 0 ]; echo $?)
check "--help prints usage" $(echo "$OUT" | grep -qi 'usage'; echo $?)
check "--help does not echo secret env values" $(echo "$OUT" | grep -q 'FAKESECRETVALUE123'; [ $? -ne 0 ]; echo $?)

# --- 2. --full without creds fails cleanly, naming the missing var -------
for v in MB_ATHENA_TEST_REGION MB_ATHENA_TEST_ACCESS_KEY MB_ATHENA_TEST_SECRET_KEY MB_ATHENA_TEST_S3_STAGING_DIR; do
  unset "$v"
done
OUT="$(bash "$SCRIPT" --full 2>&1)"; RC=$?
check "--full without creds exits non-zero" $([ $RC -ne 0 ]; echo $?)
check "--full without creds names MB_ATHENA_TEST_REGION" $(echo "$OUT" | grep -q 'MB_ATHENA_TEST_REGION'; echo $?)
check "--full without creds leaks no secret values" $(echo "$OUT" | grep -q 'FAKESECRETVALUE123'; [ $? -ne 0 ]; echo $?)

# --- 3. --dry-run with creds present passes the guard without running ----
export MB_ATHENA_TEST_REGION="us-east-1"
export MB_ATHENA_TEST_ACCESS_KEY="AKIAFAKEFAKEFAKE"
export MB_ATHENA_TEST_SECRET_KEY="FAKESECRETVALUE123"
export MB_ATHENA_TEST_S3_STAGING_DIR="s3://fake-staging/bench/"
STUBDIR="$(mktemp -d)"
printf '#!/usr/bin/env bash\necho CLOJURE-WAS-INVOKED >&2\nexit 42\n' > "$STUBDIR/clojure"
chmod +x "$STUBDIR/clojure"
OUT="$(PATH="$STUBDIR:$PATH" bash "$SCRIPT" --full --dry-run 2>&1)"; RC=$?
check "--dry-run with creds exits 0" $([ $RC -eq 0 ]; echo $?)
check "--dry-run does not invoke clojure" $(echo "$OUT" | grep -q 'CLOJURE-WAS-INVOKED'; [ $? -ne 0 ]; echo $?)
rm -rf "$STUBDIR"

# --- 4. script is POSIX-safe: runs under sh/dash, not just bash ----------
OUT="$(sh "$SCRIPT" --help 2>&1)"; RC=$?
check "sh --help exits 0 (no bashisms)" $([ $RC -eq 0 ]; echo $?)
check "sh --help prints usage" $(echo "$OUT" | grep -qi 'usage'; echo $?)
unset MB_ATHENA_TEST_REGION MB_ATHENA_TEST_ACCESS_KEY MB_ATHENA_TEST_SECRET_KEY MB_ATHENA_TEST_S3_STAGING_DIR
OUT="$(sh "$SCRIPT" --full 2>&1)"; RC=$?
check "sh --full without creds exits non-zero" $([ $RC -ne 0 ]; echo $?)
check "sh --full names MB_ATHENA_TEST_REGION" $(echo "$OUT" | grep -q 'MB_ATHENA_TEST_REGION'; echo $?)

# --- 5. DEPS_EDN override is detected and reported clearly ----------------
export MB_ATHENA_TEST_REGION="us-east-1"
export MB_ATHENA_TEST_S3_STAGING_DIR="s3://fake-staging/bench/"
export MB_ATHENA_TEST_ACCESS_KEY="AKIAFAKEFAKEFAKE"
export MB_ATHENA_TEST_SECRET_KEY="FAKESECRETVALUE123"
STUBDIR2="$(mktemp -d)"
printf '#!/usr/bin/env bash\necho CLOJURE-WAS-INVOKED >&2\nexit 42\n' > "$STUBDIR2/clojure"
chmod +x "$STUBDIR2/clojure"
export DEPS_EDN="$STUBDIR2/fake-deps.edn"
printf '{:aliases {}}\n' > "$DEPS_EDN"
OUT="$(PATH="$STUBDIR2:$PATH" bash "$SCRIPT" --full 2>&1)"; RC=$?
check "DEPS_EDN override exits non-zero" $([ $RC -ne 0 ]; echo $?)
check "DEPS_EDN override names DEPS_EDN" $(echo "$OUT" | grep -q 'DEPS_EDN'; echo $?)
check "DEPS_EDN override does not invoke clojure" $(echo "$OUT" | grep -q 'CLOJURE-WAS-INVOKED'; [ $? -ne 0 ]; echo $?)
rm -rf "$STUBDIR2"
unset DEPS_EDN

# --- 6. exec runs clojure from the athena module dir (root-cause of the ----
#         'undeclared :bench' / 'all (No such file or directory)' report)
STUBDIR3="$(mktemp -d)"
CWDLOG="$STUBDIR3/cwd.txt"
printf '#!/usr/bin/env bash\npwd > "%s"\nexit 42\n' "$CWDLOG" > "$STUBDIR3/clojure"
chmod +x "$STUBDIR3/clojure"
export MB_ATHENA_TEST_REGION="us-east-1"
export MB_ATHENA_TEST_S3_STAGING_DIR="s3://fake-staging/bench/"
export MB_ATHENA_TEST_ACCESS_KEY="AKIAFAKEFAKEFAKE"
export MB_ATHENA_TEST_SECRET_KEY="FAKESECRETVALUE123"
PATH="$STUBDIR3:$PATH" bash "$SCRIPT" --full >/dev/null 2>&1; RC=$?
check "--full invokes clojure (stub ran)" $([ "$RC" -eq 42 ] && [ -f "$CWDLOG" ]; echo $?)
check "exec cwd is the athena module dir" $(case "$(cat "$CWDLOG" 2>/dev/null)" in */modules/drivers/athena) echo 0;; *) echo 1;; esac; echo $?)
rm -rf "$STUBDIR3"

echo "----"
echo "self-test: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
