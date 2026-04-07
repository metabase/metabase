# nix/security/ddl-audit.nix
#
# Static DDL security audit. Scans Clojure source for unsafe patterns in
# workspace isolation DDL: manual quoting, unescaped passwords, unparameterized
# WHERE clauses.
#
# No JVM, no database, no network. Pure ripgrep. <1 second.
#
# Usage:
#   nix run .#check-ddl-audit
#
{ pkgs, src }:

pkgs.writeShellApplication {
  name = "mb-check-ddl-audit";
  runtimeInputs = [
    pkgs.ripgrep
    pkgs.coreutils
  ];
  text = ''
    set -euo pipefail

    echo "=== DDL Security Audit ==="
    echo ""

    SRC="${src}"
    ERRORS=0
    WARNINGS=0

    # Helper: run a ripgrep check. Args: name, severity (error|warn), rg args...
    check() {
      local name="$1"
      local severity="$2"
      shift 2

      echo "  [$name]"
      HITS=$(rg "$@" 2>/dev/null || true)
      if [ -n "$HITS" ]; then
        echo "$HITS" | while IFS= read -r line; do
          echo "    $line"
        done
        if [ "$severity" = "error" ]; then
          ERRORS=$((ERRORS + 1))
          echo "    ^ ERROR"
        else
          WARNINGS=$((WARNINGS + 1))
          echo "    ^ WARNING"
        fi
      else
        echo "    PASS"
      fi
      echo ""
    }

    echo "── Identifier Quoting ──"
    echo ""

    # Check 1: Manual backtick quoting in DDL
    # Flags:  (format "CREATE ... `%s`")  — should use sql.u/quote-name
    # shellcheck disable=SC2016
    BACKTICK_PAT='format.*(CREATE|DROP|GRANT|ALTER|REVOKE).*`%s`'
    check "manual-backtick-in-ddl" "error" \
      -n --glob '*.clj' \
      "$BACKTICK_PAT" \
      "$SRC/src/metabase/driver" "$SRC/modules/drivers"

    # Check 2: Manual bracket quoting in DDL
    # Flags:  (format "CREATE LOGIN [%s]")  — should use sql.u/quote-name
    BRACKET_PAT='format.*(CREATE|DROP|GRANT|ALTER|REVOKE).*\[%s\]'
    check "manual-bracket-in-ddl" "warn" \
      -n --glob '*.clj' \
      "$BRACKET_PAT" \
      "$SRC/src/metabase/driver" "$SRC/modules/drivers"

    # Check 3: Manual double-quote quoting in user/schema DDL
    # Flags:  (format "CREATE USER \"%s\"")  — should use sql.u/quote-name
    # Only check USER/SCHEMA/DATABASE context to reduce false positives
    DQUOTE_PAT='format.*(CREATE USER|DROP USER|CREATE SCHEMA|DROP SCHEMA|CREATE DATABASE|DROP DATABASE).*\\"%s\\"'
    check "manual-dquote-in-user-ddl" "warn" \
      -n --glob '*.clj' \
      "$DQUOTE_PAT" \
      "$SRC/src/metabase/driver" "$SRC/modules/drivers"

    echo "── Password Escaping ──"
    echo ""

    # Check 4: PASSWORD in format string — verify escape-sql is used
    # Find files that interpolate passwords into DDL but don't call escape-sql
    echo "  [password-escaped-before-interpolation]"
    # shellcheck disable=SC2016
    PW_PAT='format.*PASSWORD.*'"'"'%s'"'"
    PW_FILES=$(rg -l "$PW_PAT" \
                   --glob '*.clj' \
                   "$SRC/src/metabase/driver" "$SRC/modules/drivers" 2>/dev/null || true)
    if [ -n "$PW_FILES" ]; then
      PW_FAIL=false
      while IFS= read -r f; do
        if ! rg -q 'escape-sql' "$f" 2>/dev/null; then
          echo "    FAIL: $f"
          echo "      Has PASSWORD '%s' in format string but no escape-sql call"
          PW_FAIL=true
        fi
      done <<< "$PW_FILES"
      if [ "$PW_FAIL" = "true" ]; then
        ERRORS=$((ERRORS + 1))
        echo "    ^ ERROR"
      else
        echo "    PASS (all files with PASSWORD interpolation also call escape-sql)"
      fi
    else
      echo "    PASS (no PASSWORD interpolation found)"
    fi
    echo ""

    echo "── WHERE Clause Parameterization ──"
    echo ""

    # Check 5: WHERE with string interpolation instead of ? parameters
    # Flags:  format "...WHERE name = '%s'..."
    # shellcheck disable=SC2016
    WHERE_PAT='format.*WHERE.*=.*'"'"'%s'"'"
    check "where-clause-interpolation" "warn" \
      -n --glob '*.clj' \
      "$WHERE_PAT" \
      "$SRC/src/metabase/driver" "$SRC/modules/drivers"

    # ── Summary ─────────────────────────────────────────────────────
    echo "========================================"
    echo "  DDL Audit Summary"
    echo "========================================"
    echo "  Errors:   $ERRORS"
    echo "  Warnings: $WARNINGS"

    if [ "$ERRORS" -gt 0 ]; then
      echo ""
      echo "  FAIL: $ERRORS error(s) found — fix before merge"
      exit 1
    else
      echo ""
      echo "  PASS (with $WARNINGS warning(s))"
      exit 0
    fi
  '';
}
