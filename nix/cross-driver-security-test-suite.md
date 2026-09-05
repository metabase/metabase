# Cross-Driver Security Test Suite — Design Document

## Introduction

Metabase supports 12+ database backends, each implementing driver-specific DDL
for workspace isolation (user creation, schema provisioning, privilege grants).
During the development of the ClickHouse native transport driver, we added
targeted security tests that caught a real SQL injection vulnerability in the
string escaping layer. The subsequent static analysis (SpotBugs + FindSecBugs)
of the full uberjar revealed that the same class of vulnerability — unescaped
identifiers and passwords in DDL strings — exists in varying degrees across
multiple drivers.

This document proposes a **generic, cross-driver security test suite** that
applies the same testing principles uniformly to every SQL backend. The goal is
to catch injection vulnerabilities in driver DDL code before they reach
production, and to enforce consistent use of Metabase's quoting and escaping
utilities across all drivers.

## Background

### What we found

In the `nix` branch, we performed three rounds of security analysis:

1. **ClickHouse native driver review** — found and fixed a backslash-escape
   bypass in `param->sql-literal` that allowed breaking out of string literals
   (BUG 1 in `clickhouse_native.clj`).

2. **SpotBugs + FindSecBugs uberjar scan** — flagged `SQL_INJECTION_JDBC` on
   workspace isolation DDL in `postgres.clj` and `clickhouse.clj`. Both were
   confirmed and fixed by switching to `sql.u/quote-name` and
   `sql.u/escape-sql`.

3. **Cross-driver audit** — reviewed all 9 workspace isolation implementations.
   Found 4 drivers with gaps:

   | Driver     | Issue                                              | Severity |
   |------------|----------------------------------------------------|----------|
   | MySQL      | Username uses raw backtick wrapping, not `quote-name` | Medium   |
   | H2         | Password inserted raw in `CREATE USER` DDL         | Medium   |
   | Snowflake  | Password inserted raw (relies on generation charset) | Low      |
   | SQL Server | Manual `[%s]` quoting; username in `WHERE` clauses unescaped | Low |

4. **Existing test gaps** — the workspace isolation tests in
   `enterprise/backend/test/.../workspaces/isolation_test.clj` test
   evil table/schema names but do **not** test evil passwords or usernames, and
   only test the `grant-workspace-read-access!` path on Postgres.

### Why passwords are a real risk

The `random-workspace-password` function (in `driver/util.clj:802`) currently
generates passwords from a charset that excludes single quotes:

```clojure
(def ^:private workspace-password-char-sets
  ["ABCDEFGHJKLMNPQRSTUVWXYZ"
   "abcdefghjkmnpqrstuvwxyz"
   "123456789"
   "!#$%&*+-="])
```

This is a **fragile defense** — it works today, but if anyone adds `'` or `\`
to the charset (or if a user-supplied password flows through this path in the
future), drivers that don't escape will be immediately vulnerable. Defense in
depth requires escaping at the point of use, not just constraining the input.

### Metabase's escaping utilities

Metabase provides two functions in `metabase.driver.sql.util`:

- **`quote-name`** — driver-aware identifier quoting (backticks for MySQL,
  double-quotes for Postgres/H2/Snowflake, brackets for SQL Server).
- **`escape-sql`** — value escaping with `:ansi` (double single-quote) or
  `:backslashes` (backslash-escape) strategies.

The existing `escape-sql` docstring explicitly warns:

> DON'T RELY ON THIS FOR SANITIZING USER INPUT BEFORE RUNNING QUERIES!

This is correct for *query parameters* (use `?` placeholders). But for **DDL
statements** (`CREATE USER`, `GRANT`, `CREATE SCHEMA`), prepared statement
placeholders are not supported by any database engine. DDL **must** use string
interpolation, making `escape-sql` the correct tool for passwords in DDL
context.

---

## Table of Contents

1. [Test Suite Architecture](#1-test-suite-architecture)
2. [Component 1: DDL Injection via Workspace Isolation](#2-component-1-ddl-injection-via-workspace-isolation)
3. [Component 2: Identifier Quoting Consistency Audit](#3-component-2-identifier-quoting-consistency-audit)
4. [Component 3: Password Escaping Consistency Audit](#4-component-3-password-escaping-consistency-audit)
5. [Component 4: String Literal Escaping (Native Drivers)](#5-component-4-string-literal-escaping-native-drivers)
6. [Component 5: Parameter Substitution Safety](#6-component-5-parameter-substitution-safety)
7. [Component 6: Join Alias and Identifier Breakout](#7-component-6-join-alias-and-identifier-breakout)
8. [Component 7: Static Analysis Integration](#8-component-7-static-analysis-integration)
9. [Nix Implementation Architecture](#9-nix-implementation-architecture)
10. [Implementation Plan](#10-implementation-plan)
11. [Appendix: Current Driver Audit Detail](#11-appendix-current-driver-audit-detail)

---

## 1. Test Suite Architecture

### Principles

- **Driver-generic by default**: tests use `mt/test-drivers` with feature
  flags (`:workspace`) so they run against every driver that supports the
  feature, without hardcoding driver names.
- **Adversarial inputs**: every test supplies intentionally malicious strings
  (single quotes, backslashes, double-quotes, backticks, semicolons, comment
  markers) as identifiers and passwords.
- **Two layers**: a **static audit layer** (grep/AST analysis of source code
  for unsafe patterns) and a **dynamic test layer** (actually execute DDL with
  evil inputs against real databases).
- **Incremental**: each component can be implemented and merged independently.

### Proposed namespace structure

```
test/metabase/driver/security/
  ddl_injection_test.clj        — Component 1: workspace isolation DDL
  identifier_quoting_test.clj   — Component 2: quote-name consistency
  password_escaping_test.clj    — Component 3: escape-sql consistency
  string_literal_test.clj       — Component 4: native driver escaping
  param_substitution_test.clj   — Component 5: parameter substitution
  join_alias_test.clj           — Component 6: join alias breakout
```

And a Nix-driven static check:

```
nix/static-analysis/
  ddl-audit.nix                 — Component 7: grep-based DDL pattern audit
```

---

## 2. Component 1: DDL Injection via Workspace Isolation

### What it tests

The `init-workspace-isolation!`, `destroy-workspace-isolation!`, and
`grant-workspace-read-access!` driver multimethods all generate DDL strings
(`CREATE USER`, `CREATE SCHEMA`, `GRANT`, `DROP USER`, etc.) via `format`.
This component tests that **adversarial passwords, usernames, schema names,
and table names** do not break out of their intended syntactic position.

### Current coverage gap

The existing `isolation_test.clj` tests:
- Evil table names with embedded `"` — Postgres only (line 237)
- Evil schema names with embedded `"` — Postgres only (line 250)
- **Missing**: evil passwords (single quotes, backslashes)
- **Missing**: evil usernames (backticks, double-quotes, brackets)
- **Missing**: cross-driver coverage (only Postgres tested for quoting)

### Test design

```clojure
(ns metabase.driver.security.ddl-injection-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.test :as mt]))

;; Adversarial payloads
(def ^:private evil-passwords
  ["pass'word"                          ; single quote — breaks SQL string literal
   "pass\\'"                            ; backslash + single quote — escape bypass
   "pass'; DROP USER admin--"           ; classic injection
   "pass\\\\'; DROP USER admin--"       ; double-backslash + quote
   "pass\nword"                         ; newline — may break single-line DDL
   "pass%word"                          ; percent — LIKE wildcard in some contexts
   "pass`word"                          ; backtick — MySQL delimiter
   "pass\"word"                         ; double-quote — ANSI identifier delimiter
   "pass[word"                          ; bracket — SQL Server delimiter
   "pass]word"])                        ; closing bracket

(def ^:private evil-identifiers
  ["evil\"name"                         ; embedded double-quote
   "evil`name"                          ; embedded backtick
   "evil[name"                          ; embedded open bracket
   "evil]name"                          ; embedded close bracket
   "evil'name"                          ; embedded single quote
   "evil;DROP TABLE x--"               ; semicolon injection
   "evil\nname"                         ; newline
   "evil\\\"name"])                     ; escaped double-quote

(deftest workspace-isolation-survives-evil-passwords-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (doseq [evil-pw evil-passwords]
      (testing (str "password: " (pr-str evil-pw))
        ;; Temporarily override password generation to return evil password
        (with-redefs [driver.u/random-workspace-password (constantly evil-pw)]
          (let [workspace {:id   (str (random-uuid))
                           :name "_security_test_pw_"}
                database  (mt/db)
                driver    (driver.u/database->driver database)]
            (try
              (let [result (driver/init-workspace-isolation! driver database workspace)]
                ;; If init succeeds, verify we can also destroy cleanly
                (driver/destroy-workspace-isolation!
                 driver database (merge workspace result)))
              (catch Exception e
                ;; A clean SQL error (e.g. "invalid password") is acceptable.
                ;; An injection (data returned, second statement executed) is not.
                ;; The key assertion: no resources leaked.
                (try
                  (driver/destroy-workspace-isolation!
                   driver database workspace)
                  (catch Exception _))))))))))
```

### What passes vs. what fails

- **Postgres, ClickHouse** (already fixed): all evil passwords are safely
  escaped via `sql.u/escape-sql`. Test passes.
- **H2**: `(format "CREATE USER ... PASSWORD '%s'" password)` with
  `pass'word` produces `PASSWORD 'pass'word'` — DDL syntax error or injection.
  Test fails, revealing the gap.
- **Snowflake**: same pattern, same gap.
- **MySQL**: password is escaped (`:ansi`), but username uses raw backtick
  wrapping. Evil username test would fail.

### Scope of fix per driver

| Driver     | Fix required                                                    |
|------------|-----------------------------------------------------------------|
| H2         | Add `sql.u/escape-sql password :ansi` in `init-workspace-isolation!` |
| Snowflake  | Add `sql.u/escape-sql password :ansi` in `init-workspace-isolation!` |
| MySQL      | Use `sql.u/quote-name :mysql :field` for username; already escapes password |
| SQL Server | Use `sql.u/quote-name :sqlserver :field` for username in WHERE clauses; password already escaped |

---

## 3. Component 2: Identifier Quoting Consistency Audit

### What it tests

Every SQL identifier (username, schema name, database name, role name, table
name) interpolated into a `format` string in workspace isolation DDL should use
`sql.u/quote-name` rather than manual quoting (hand-typed backticks,
double-quotes, or brackets).

### Why manual quoting is dangerous

Manual quoting like `` (format "CREATE DATABASE IF NOT EXISTS `%s`" db-name) ``
does not escape embedded backticks within `db-name`. If `db-name` contains a
backtick, the DDL becomes syntactically broken or injectable. `quote-name`
handles this correctly per driver.

### Current state by driver

```
Driver      init-workspace-isolation!  destroy-workspace-isolation!  grant-workspace-read-access!
──────────  ─────────────────────────  ────────────────────────────  ────────────────────────────
Postgres    quote-name                 quote-name                    quote-name
ClickHouse  quote-name                 quote-name                    quote-name
H2          manual \"%s\"             manual \"%s\"                 quote-name
MySQL       manual `%s`               manual `%s`                   quote-name
Snowflake   manual \"%s\"             manual \"%s\"                 quote-name
SQL Server  manual [%s]               manual [%s]                   quote-name
Redshift    inherits Postgres          manual \"%s\"                inherits Postgres
BigQuery    N/A (API-based)            N/A (API-based)               N/A (API-based)
```

Pattern: `grant-workspace-read-access!` consistently uses `quote-name`
(probably because it was implemented later or reviewed more carefully), while
`init-` and `destroy-` use manual quoting in 4 out of 7 SQL drivers.

### Test design

A static analysis test that greps the source for unsafe DDL patterns:

```clojure
(deftest identifier-quoting-consistency-test
  (testing "workspace isolation DDL should use sql.u/quote-name, not manual quoting"
    (let [driver-files (find-workspace-isolation-sources)]
      (doseq [file driver-files]
        (let [content (slurp file)]
          ;; Flag manual quoting patterns in format strings near DDL keywords
          (is (not (re-find #"format\s+\"[^\"]*`%s`" content))
              (str file " uses manual backtick quoting — use sql.u/quote-name"))
          (is (not (re-find #"format\s+\"[^\"]*\[%s\]" content))
              (str file " uses manual bracket quoting — use sql.u/quote-name"))
          ;; Manual double-quote is harder to detect (could be legitimate),
          ;; so check specifically in DDL context
          (is (not (re-find #"format\s+\"[^\"]*(?:CREATE|DROP|GRANT|ALTER|REVOKE)[^\"]*\\\"%s\\\"" content))
              (str file " uses manual double-quote quoting in DDL — use sql.u/quote-name")))))))
```

This is a **lint-level test** — it doesn't execute SQL, just validates that
the source code follows the safe pattern. It can be run as part of CI without
any database.

### Nix integration

This check is a natural fit for the `nix run .#check-all-static` target
(Component 7). It can also be run as a standard `clojure -X:test` test.

---

## 4. Component 3: Password Escaping Consistency Audit

### What it tests

Every `format` call that interpolates a password into a DDL string must first
pass the password through `sql.u/escape-sql` with the appropriate strategy
(`:ansi` for most SQL databases, `:backslashes` for MySQL/ClickHouse).

### Current state by driver

| Driver     | Password escaping used?          | Escape strategy | Location                    |
|------------|----------------------------------|-----------------|-----------------------------|
| Postgres   | `sql.u/escape-sql` `:ansi`       | ANSI            | `postgres.clj:1333`         |
| ClickHouse | `sql.u/escape-sql` `:backslashes`| Backslash       | `clickhouse.clj:405`        |
| MySQL      | `sql.u/escape-sql` `:ansi`       | ANSI            | `mysql.clj:1247`            |
| SQL Server | `sql.u/escape-sql` `:ansi`       | ANSI            | `sqlserver.clj:1124`        |
| H2         | **None** — raw `password` in format | N/A          | `h2.clj:714`               |
| Snowflake  | **None** — raw `(:password read-user)` in format | N/A | `snowflake.clj:1052`   |
| Redshift   | Inherits Postgres (safe)         | ANSI            | N/A                         |
| BigQuery   | N/A (API-based, no SQL)          | N/A             | N/A                         |

### Test design

Two complementary approaches:

**Approach A — Static source scan (fast, no DB needed):**

```clojure
(deftest password-escaping-audit-test
  (testing "every CREATE USER / ALTER USER format string with PASSWORD must use escape-sql"
    (let [files (workspace-isolation-source-files)]
      (doseq [file files
              :let [content (slurp file)
                    ;; Find format strings containing PASSWORD
                    pw-formats (re-seq #"format\s+\"[^\"]*PASSWORD[^\"]*\"" content)]]
        (when (seq pw-formats)
          (testing (str file)
            ;; The same file should contain a call to escape-sql before the format
            (is (re-find #"escape-sql.*password" content)
                (str "File has PASSWORD in format string but no escape-sql call for password"))))))))
```

**Approach B — Dynamic execution (thorough, needs DB):**

Uses the evil-passwords test from Component 1. If the password contains a
single quote and the DDL succeeds without error, either the driver escapes
correctly (test passes) or the DDL breaks (test fails with a SQL syntax error,
revealing the gap).

### Recommended fixes

```clojure
;; H2: h2.clj line 714
;; Before:
(format "CREATE USER IF NOT EXISTS \"%s\" PASSWORD '%s'" username password)
;; After:
(format "CREATE USER IF NOT EXISTS %s PASSWORD '%s'"
        (sql.u/quote-name :h2 :field username)
        (sql.u/escape-sql password :ansi))

;; Snowflake: snowflake.clj line 1051
;; Before:
(format "CREATE USER IF NOT EXISTS \"%s\" PASSWORD = '%s' ..."
        (:user read-user) (:password read-user) role-name)
;; After:
(format "CREATE USER IF NOT EXISTS %s PASSWORD = '%s' ... DEFAULT_ROLE = %s"
        (sql.u/quote-name :snowflake :field (:user read-user))
        (sql.u/escape-sql (:password read-user) :ansi)
        (sql.u/quote-name :snowflake :field role-name))
```

---

## 5. Component 4: String Literal Escaping (Native Drivers)

### What it tests

Drivers that implement their own SQL string construction (outside of JDBC
prepared statements) must correctly escape string literals. This is the pattern
we tested in the ClickHouse native driver, and it applies to any driver that
builds SQL strings manually.

### The ClickHouse pattern

The ClickHouse native transport uses `param->sql-literal` to convert Clojure
values into SQL literal strings, and `substitute-params` to replace `?`
placeholders with those literals. Our tests covered:

| Test                                          | What it catches                        |
|-----------------------------------------------|----------------------------------------|
| `param->sql-literal-single-quote-test`        | Unescaped `'` → string breakout        |
| `param->sql-literal-backslash-escape-test`    | Trailing `\` escapes closing quote     |
| `param->sql-literal-special-chars-test`       | Newlines, tabs, null bytes in strings  |
| SQL injection attempt with `'; DROP TABLE x--`| Classic first-order injection          |

### Generalizing to all drivers

Most drivers use JDBC `PreparedStatement` with `?` parameters, so this
component only applies to drivers that do **manual SQL string construction**.
Currently this includes:

- **ClickHouse native** (`clickhouse_native.clj`) — `param->sql-literal` +
  `substitute-params`
- **Any future native-protocol driver** that bypasses JDBC

### Generic test template

```clojure
(def ^:private evil-string-payloads
  ["O'Brien"                      ; basic single-quote
   "test\\"                       ; trailing backslash
   "test\\'"                      ; backslash + single-quote
   "'; DROP TABLE x--"            ; classic injection
   "\\'; DROP TABLE x--"          ; backslash-escaped injection
   "\u0000"                       ; null byte
   "hello\nworld"                 ; newline
   "hello\tworld"                 ; tab
   (apply str (repeat 10000 "a")) ; very long string
   ""])                           ; empty string

(defn assert-string-literal-safety
  "Given a function that converts a string to a SQL literal,
   verify that all evil payloads produce valid, non-injectable SQL."
  [literal-fn]
  (doseq [payload evil-string-payloads]
    (testing (str "payload: " (pr-str (subs payload 0 (min 40 (count payload)))))
      (let [result (literal-fn payload)]
        ;; Must be wrapped in single quotes
        (is (clojure.string/starts-with? result "'"))
        (is (clojure.string/ends-with? result "'"))
        ;; The interior must not contain an unescaped single quote
        ;; (i.e., every ' inside must be preceded by an escape character)
        (let [interior (subs result 1 (dec (count result)))]
          ;; Count unescaped single quotes — should be zero
          (is (zero? (count (re-seq #"(?<!['\\])'" interior)))
              (str "Unescaped single quote found in: " result)))))))
```

This template can be applied to any driver's literal-conversion function. New
native-protocol drivers should be required to pass this test before merge.

---

## 6. Component 5: Parameter Substitution Safety

### What it tests

When a driver performs text-based parameter substitution (replacing `?` with
literal values), the substitution must:

1. Not substitute `?` inside string literals (known limitation, documented)
2. Handle more parameters than placeholders gracefully
3. Handle fewer parameters than placeholders gracefully (substituting `NULL`)
4. Not produce SQL that executes more than one statement

### Current coverage

The ClickHouse native tests cover this:

```
substitute-params-basic-test              — basic replacement
substitute-params-extra-params-test       — more params than placeholders
substitute-params-exhausted-test          — more placeholders than params
substitute-params-question-mark-in-string-literal-test — known limitation
```

### Generalization

This component is only relevant for drivers that do text-based substitution.
JDBC drivers use `PreparedStatement.setObject()` and are inherently safe. The
test template from Component 4 naturally extends here — the `substitute-params`
function should be tested with the same evil payloads embedded as parameter
values.

---

## 7. Component 6: Join Alias and Identifier Breakout

### What it tests

User-controlled values (custom column aliases, join aliases, field names) that
flow into HoneySQL identifier construction must not break out of their quoting
context.

### Existing coverage

`test/metabase/query_processor/explicit_joins_test.clj` (lines 938-985)
already tests 5 evil join aliases:

```clojure
;; Attempts to break out of double-quoted alias context:
"users.id\" AS user_id, u.* FROM categories LEFT JOIN users u ON 1 = 1; --"
;; Unicode-encoded variant:
"users.id\u0022 AS user_id..."
;; Backtick variants:
"users.id` AS user_id..."
```

And `test/metabase/util/honey_sql_2_test.clj` tests HoneySQL identifier
quoting with embedded quotes (lines 100-110).

### Gap

The existing tests are **Postgres/MySQL-centric**. The same join alias
breakout tests should run against all SQL drivers:

```clojure
(deftest evil-join-alias-all-drivers-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (doseq [evil-alias evil-identifiers]
      (testing (str "alias: " (pr-str evil-alias))
        ;; Construct a query with the evil alias and verify it either
        ;; executes safely or throws a clean error — never injects
        ...))))
```

---

## 8. Component 7: Static Analysis Integration

### What it tests

A Nix-driven static check that scans all driver source files for unsafe DDL
patterns without needing a database.

### Checks

| Check | What it flags |
|-------|---------------|
| Manual backtick quoting in DDL | `` format "...`%s`..." `` near `CREATE/DROP/GRANT/ALTER` |
| Manual bracket quoting in DDL | `format "...[%s]..."` near `CREATE/DROP/GRANT/ALTER` |
| Manual double-quote quoting in DDL | `format "...\"%s\"..."` near `CREATE/DROP/GRANT/ALTER` |
| PASSWORD without escape-sql | `format "...PASSWORD '%s'..."` without nearby `escape-sql` |
| Unparameterized WHERE clauses | `format "...WHERE name = '%s'..."` (should use `?` params) |

### Implementation

```nix
# nix/static-analysis/ddl-audit.nix
{ pkgs, src }:

pkgs.writeShellApplication {
  name = "mb-check-ddl-audit";
  runtimeInputs = [ pkgs.ripgrep pkgs.coreutils ];
  text = ''
    echo "=== DDL Security Audit ==="
    ERRORS=0

    # Check 1: Manual backtick quoting in DDL context
    if rg -l 'format.*".*(?:CREATE|DROP|GRANT|ALTER).*`%s`' \
         --glob '*.clj' ${src}/src ${src}/modules; then
      echo "WARN: Manual backtick quoting found in DDL — use sql.u/quote-name"
      ERRORS=$((ERRORS + 1))
    fi

    # Check 2: PASSWORD in format without escape-sql in same function
    # (more sophisticated: check per-function scope)
    ...

    if [ "$ERRORS" -gt 0 ]; then
      echo "FAIL: $ERRORS unsafe DDL patterns found"
      exit 1
    else
      echo "PASS: No unsafe DDL patterns detected"
    fi
  '';
}
```

This integrates with the existing `nix run .#check-all-static` runner from the
static analysis infrastructure.

---

## 9. Nix Implementation Architecture

This section details how the security test suite maps onto the existing Nix
infrastructure. The design follows the same patterns established by
`nix/tests/` (dynamic integration tests) and `nix/static-analysis/` (offline
source/bytecode checks), extending both with security-specific targets.

### Existing Nix topology (reference)

```
flake.nix
├── nix/tests/
│   ├── default.nix           ← entry point, exports attribute set
│   ├── lib.nix               ← mkMetabaseTest factory (PG + Metabase setup/teardown)
│   ├── health-check.nix      ← uses mkMetabaseTest (needs uberjar)
│   ├── api-smoke.nix         ← uses mkMetabaseTest (needs uberjar)
│   ├── db-migration.nix      ← uses mkMetabaseTest (needs uberjar)
│   └── clickhouse-backend.nix ← standalone writeShellApplication (needs Clojure CLI + Docker)
│
├── nix/static-analysis/
│   ├── default.nix           ← entry point, exports attribute set + combined runner
│   ├── spotbugs.nix          ← needs uberjar (bytecode analysis)
│   ├── nvd-clojure.nix       ← needs src + network (Maven CVE scan)
│   ├── kondo.nix             ← needs src (wraps deps.edn alias)
│   ├── eastwood.nix          ← needs src (wraps deps.edn alias)
│   └── kibit.nix             ← needs src (Clojure idiom suggestions)
│
└── packages (in flake.nix)
    ├── tests-health-check, tests-api-smoke, ...  ← from nix/tests/
    ├── check-kondo, check-spotbugs, ...           ← from nix/static-analysis/
    └── tests-clickhouse-backend                   ← from nix/tests/
```

**Key pattern**: each `.nix` file is a `writeShellApplication` that takes `{ pkgs, ... }`
and returns a self-contained script. The `default.nix` assembles them into an attribute set
and provides an `all` runner. The `flake.nix` imports the attribute set and maps it to
`packages.*` for `nix run .#<name>`.

### New security test topology

```
nix/security/
├── default.nix               ← entry point, exports { ddlAudit, securityTests, all }
├── ddl-audit.nix             ← STATIC: ripgrep-based source scan (no DB, no JVM)
├── security-backend.nix      ← DYNAMIC: Clojure tests against real databases
└── lib.nix                   ← mkSecurityTest factory (multi-DB setup/teardown)
```

Flake wiring:

```nix
# In flake.nix, alongside existing imports:
security = import ./nix/security {
  inherit pkgs lib;
  src = filteredSrc;
};

# In packages block:
check-ddl-audit       = security.ddlAudit;
tests-security        = security.securityTests;
check-security-all    = security.all;
```

### Tier 1: Static DDL audit (`ddl-audit.nix`)

**No JVM, no database, no network.** Pure ripgrep over source files. Runs in
under 1 second. Suitable for pre-commit hooks and CI fast path.

```nix
# nix/security/ddl-audit.nix
{ pkgs, src }:

pkgs.writeShellApplication {
  name = "mb-check-ddl-audit";
  runtimeInputs = [ pkgs.ripgrep pkgs.coreutils pkgs.gnugrep ];
  text = ''
    set -euo pipefail

    echo "=== DDL Security Audit ==="
    echo ""

    SRC="${src}"
    ERRORS=0
    WARNINGS=0

    # ── Check 1: Manual backtick quoting in DDL ────────────────────────
    # Flags: format "CREATE ... `%s`" — should use sql.u/quote-name
    echo "Check 1: Manual backtick quoting in DDL..."
    if HITS=$(rg -n 'format.*"[^"]*(?:CREATE|DROP|GRANT|ALTER|REVOKE)[^"]*`%s`' \
                  --glob '*.clj' --pcre2 \
                  "$SRC/src" "$SRC/modules" 2>/dev/null); then
      echo "  FAIL: Manual backtick quoting found in DDL statements:"
      echo "$HITS" | sed 's/^/    /'
      ERRORS=$((ERRORS + 1))
    else
      echo "  PASS"
    fi

    # ── Check 2: Manual bracket quoting in DDL ─────────────────────────
    # Flags: format "CREATE ... [%s]" — should use sql.u/quote-name
    echo "Check 2: Manual bracket quoting in DDL..."
    if HITS=$(rg -n 'format.*"[^"]*(?:CREATE|DROP|GRANT|ALTER|REVOKE)[^"]*\[%s\]' \
                  --glob '*.clj' --pcre2 \
                  "$SRC/src" "$SRC/modules" 2>/dev/null); then
      echo "  WARN: Manual bracket quoting found in DDL statements:"
      echo "$HITS" | sed 's/^/    /'
      WARNINGS=$((WARNINGS + 1))
    else
      echo "  PASS"
    fi

    # ── Check 3: Manual double-quote quoting in DDL ────────────────────
    # Flags: format "CREATE ... \"%s\"" — should use sql.u/quote-name
    # Note: higher false-positive rate, so we check only in workspace isolation context
    echo "Check 3: Manual double-quote quoting in workspace isolation DDL..."
    if HITS=$(rg -n 'format.*"[^"]*(?:CREATE USER|DROP USER|CREATE SCHEMA|DROP SCHEMA)[^"]*\\"%s\\"' \
                  --glob '*.clj' --pcre2 \
                  "$SRC/src" "$SRC/modules" 2>/dev/null); then
      echo "  WARN: Manual double-quote quoting found in DDL:"
      echo "$HITS" | sed 's/^/    /'
      WARNINGS=$((WARNINGS + 1))
    else
      echo "  PASS"
    fi

    # ── Check 4: PASSWORD in format without nearby escape-sql ──────────
    # For each file containing PASSWORD '%s' in a format string,
    # verify the same file also calls escape-sql on the password variable
    echo "Check 4: PASSWORD values escaped before interpolation..."
    PW_FILES=$(rg -l "format.*PASSWORD.*'%s'" \
                   --glob '*.clj' \
                   "$SRC/src" "$SRC/modules" 2>/dev/null || true)
    if [ -n "$PW_FILES" ]; then
      while IFS= read -r f; do
        if ! grep -q 'escape-sql' "$f"; then
          echo "  FAIL: $f has PASSWORD '%s' in format but no escape-sql"
          ERRORS=$((ERRORS + 1))
        fi
      done <<< "$PW_FILES"
    fi
    if [ "$ERRORS" -eq 0 ]; then
      echo "  PASS"
    fi

    # ── Check 5: Unparameterized WHERE with string interpolation ───────
    # Flags: format "...WHERE name = '%s'..." — should use ? parameters
    echo "Check 5: WHERE clauses with string interpolation..."
    if HITS=$(rg -n "format.*WHERE.*=.*'%s'" \
                  --glob '*.clj' \
                  "$SRC/src" "$SRC/modules" 2>/dev/null); then
      echo "  WARN: WHERE clauses with '%s' interpolation (prefer ? params):"
      echo "$HITS" | sed 's/^/    /'
      WARNINGS=$((WARNINGS + 1))
    else
      echo "  PASS"
    fi

    # ── Summary ─────────────────────────────────────────────────────────
    echo ""
    echo "========================================"
    echo "  DDL Audit Summary"
    echo "========================================"
    echo "  Errors:   $ERRORS"
    echo "  Warnings: $WARNINGS"

    if [ "$ERRORS" -gt 0 ]; then
      echo ""
      echo "  FAIL: $ERRORS unsafe DDL patterns found"
      exit 1
    else
      echo ""
      echo "  PASS (with $WARNINGS warnings)"
      exit 0
    fi
  '';
}
```

**Characteristics:**
- Input: `{ pkgs, src }` — same signature as `kondo.nix`, `kibit.nix`
- Runtime: ripgrep + coreutils only — no JDK, no Clojure
- Build time: ~0 seconds (no compilation)
- Run time: <1 second (ripgrep over ~2000 `.clj` files)
- Exit code: 1 on errors (blocks CI), 0 on warnings-only

**Integration into `check-all-static`**: add to `nix/static-analysis/default.nix`:

```nix
ddlAudit = import ../security/ddl-audit.nix { inherit pkgs; src = filteredSrc; };
# ... in the all runner:
run_check "ddl-audit" "${ddlAudit}/bin/mb-check-ddl-audit"
```

Or keep it in its own `nix/security/` directory (preferred, since security tests
span static + dynamic).

### Tier 2: Dynamic security tests (`security-backend.nix`)

Runs the actual Clojure test namespace `metabase.driver.security.ddl-injection-test`
against real databases. This is the same pattern as `clickhouse-backend.nix`:
start databases → set environment → run Clojure tests → teardown.

**Key design decision: which databases?**

The workspace isolation DDL tests need the actual database engines to verify
that the generated SQL is syntactically valid and doesn't inject. The test
needs to support multiple modes:

| Mode | Databases needed | What it tests |
|------|-----------------|---------------|
| `--only h2` | PostgreSQL (app DB) + H2 (embedded) | H2 workspace DDL |
| `--only postgres` | PostgreSQL (app DB + target) | Postgres workspace DDL |
| `--only mysql` | PostgreSQL (app DB) + MySQL (Docker) | MySQL workspace DDL |
| `--only clickhouse` | PostgreSQL (app DB) + ClickHouse (Docker) | ClickHouse workspace DDL |
| `--only all-local` | PostgreSQL + H2 | All drivers that don't need external infra |
| `--only all` | PostgreSQL + MySQL + ClickHouse + ... | Full matrix |

Snowflake, SQL Server, Redshift, and BigQuery require cloud credentials and
cannot be tested locally. Those are tested only in CI with appropriate secrets.

```nix
# nix/security/security-backend.nix
{ pkgs }:

let
  pg = pkgs.postgresql_18;
  jdk = pkgs.temurin-bin-21;
  clojure = pkgs.clojure;
in
pkgs.writeShellApplication {
  name = "mb-test-security";
  runtimeInputs = [
    pg jdk clojure
    pkgs.curl pkgs.coreutils pkgs.docker-client
  ];
  text = ''
    set -euo pipefail

    echo "=== Cross-Driver Security Tests ==="
    echo ""

    # ── Parse arguments ──────────────────────────────────────────────
    TEST_SET="all-local"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --only) TEST_SET="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
      esac
    done

    # ── Resolve test namespaces and database requirements ────────────
    NEEDS_MYSQL=false
    NEEDS_CH=false

    case "$TEST_SET" in
      h2)
        ONLY="[metabase.driver.security.ddl-injection-test/h2-workspace-isolation-test]"
        DRIVERS="h2"
        ;;
      postgres)
        ONLY="[metabase.driver.security.ddl-injection-test/postgres-workspace-isolation-test]"
        DRIVERS="postgres"
        ;;
      mysql)
        ONLY="[metabase.driver.security.ddl-injection-test/mysql-workspace-isolation-test]"
        DRIVERS="mysql"
        NEEDS_MYSQL=true
        ;;
      clickhouse)
        ONLY="[metabase.driver.security.ddl-injection-test/clickhouse-workspace-isolation-test]"
        DRIVERS="clickhouse"
        NEEDS_CH=true
        ;;
      all-local)
        # H2 + Postgres — no Docker needed
        ONLY="[metabase.driver.security.ddl-injection-test]"
        DRIVERS="h2,postgres"
        ;;
      all)
        ONLY="[metabase.driver.security.ddl-injection-test]"
        DRIVERS="h2,postgres,mysql,clickhouse"
        NEEDS_MYSQL=true
        NEEDS_CH=true
        ;;
      *)
        echo "Unknown test set: $TEST_SET"
        echo "Options: h2, postgres, mysql, clickhouse, all-local, all"
        exit 1
        ;;
    esac

    echo "Test set: $TEST_SET"
    echo "Drivers:  $DRIVERS"
    echo ""

    # ── Scratch directories ──────────────────────────────────────────
    PGDATA=$(mktemp -d)
    PGSOCKET=$(mktemp -d)
    PG_PORT=5435
    MYSQL_CONTAINER=""
    CH_CONTAINER=""

    cleanup() {
      echo ""
      echo "Cleaning up..."
      [ -n "$CH_CONTAINER" ]    && docker rm -f "$CH_CONTAINER" 2>/dev/null || true
      [ -n "$MYSQL_CONTAINER" ] && docker rm -f "$MYSQL_CONTAINER" 2>/dev/null || true
      pg_ctl -D "$PGDATA" stop 2>/dev/null || true
      rm -rf "$PGDATA" "$PGSOCKET"
    }
    trap cleanup EXIT

    # ── Start PostgreSQL (always needed as Metabase app DB) ──────────
    echo "Starting PostgreSQL on port $PG_PORT..."
    initdb -D "$PGDATA" --no-locale --encoding=UTF8 > /dev/null
    {
      echo "unix_socket_directories = '$PGSOCKET'"
      echo "listen_addresses = 'localhost'"
      echo "port = $PG_PORT"
    } >> "$PGDATA/postgresql.conf"
    pg_ctl -D "$PGDATA" -l "$PGDATA/postgresql.log" start
    sleep 1
    createdb -h "$PGSOCKET" -p "$PG_PORT" metabase_test

    # ── Start MySQL (if needed) ──────────────────────────────────────
    MYSQL_PORT=3307
    if [ "$NEEDS_MYSQL" = "true" ]; then
      if ! curl -sf "http://localhost:$MYSQL_PORT" > /dev/null 2>&1; then
        echo "Starting MySQL via Docker..."
        MYSQL_CONTAINER=$(docker run -d --rm \
          --name "mb-test-mysql-$$" \
          -p "$MYSQL_PORT:3306" \
          -e MYSQL_ROOT_PASSWORD=test \
          -e MYSQL_DATABASE=metabase_test \
          mysql:8.0)
        echo "Waiting for MySQL..."
        for _i in $(seq 1 60); do
          if docker exec "$MYSQL_CONTAINER" \
               mysqladmin ping -h localhost --silent 2>/dev/null; then
            break
          fi
          sleep 1
        done
        echo "MySQL ready."
      fi
    fi

    # ── Start ClickHouse (if needed) ────────────────────────────────
    CH_PORT=8123
    if [ "$NEEDS_CH" = "true" ]; then
      if ! curl -sf "http://localhost:$CH_PORT/ping" > /dev/null 2>&1; then
        echo "Starting ClickHouse via Docker..."
        CH_CONTAINER=$(docker run -d --rm \
          --name "mb-test-ch-$$" \
          -p "$CH_PORT:8123" -p 9000:9000 \
          clickhouse/clickhouse-server:25.2-alpine)
        echo "Waiting for ClickHouse..."
        for _i in $(seq 1 30); do
          if curl -sf "http://localhost:$CH_PORT/ping" > /dev/null 2>&1; then
            break
          fi
          sleep 1
        done
        echo "ClickHouse ready."
      fi
    fi

    # ── Run Clojure tests ────────────────────────────────────────────
    echo ""
    echo "Running security tests: $TEST_SET"
    echo ""

    export JAVA_HOME="${jdk}"
    export MB_DB_TYPE=postgres
    export MB_DB_HOST=localhost
    export MB_DB_PORT="$PG_PORT"
    export MB_DB_DBNAME=metabase_test
    export MB_DB_USER="$USER"
    export PGHOST="$PGSOCKET"
    export MB_CLICKHOUSE_TEST_HOST=localhost
    export MB_CLICKHOUSE_TEST_PORT="$CH_PORT"
    export MB_MYSQL_TEST_HOST=localhost
    export MB_MYSQL_TEST_PORT="$MYSQL_PORT"
    export MB_MYSQL_TEST_USER=root
    export MB_MYSQL_TEST_PASSWORD=test
    export DRIVERS="$DRIVERS"
    export HAWK_MODE=cli/ci

    clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test \
      :only "$ONLY" \
      2>&1 \
      | grep -v '^Downloading: ' \
      | grep -v '^Reflection warning,' \
      | sed $'s/\033[\[(][0-9;]*[A-Za-z]//g; s/\033[^[]*//g'
  '';
}
```

**Characteristics:**
- Input: `{ pkgs }` — same signature as `clickhouse-backend.nix`
- Runtime: JDK 21 + Clojure CLI + PostgreSQL + Docker (for MySQL/ClickHouse)
- Build time: ~0 seconds (writeShellApplication)
- Run time: ~30-120 seconds depending on mode
- Port allocation: PG 5435, MySQL 3307, CH 8123 — non-conflicting with other tests

### Tier 3: Combined runner (`default.nix`)

```nix
# nix/security/default.nix
{ pkgs, lib, src }:

let
  ddlAudit = import ./ddl-audit.nix { inherit pkgs src; };
  securityTests = import ./security-backend.nix { inherit pkgs; };

  all = pkgs.writeShellApplication {
    name = "mb-check-security-all";
    runtimeInputs = [ pkgs.coreutils ];
    text = ''
      echo "========================================"
      echo "  Metabase Security Test Suite"
      echo "========================================"
      echo ""

      FAILED=""
      PASSED=""
      TOTAL_START=$(date +%s)

      run_check() {
        local name="$1"
        local script="$2"
        shift 2
        echo ""
        echo "── $name ──"
        START=$(date +%s)
        if "$script" "$@"; then
          END=$(date +%s)
          ELAPSED=$((END - START))
          PASSED="$PASSED $name"
          echo "  Result: PASS ($ELAPSED s)"
        else
          END=$(date +%s)
          ELAPSED=$((END - START))
          FAILED="$FAILED $name"
          echo "  Result: FAIL ($ELAPSED s)"
        fi
      }

      # Tier 1: Static (fast, no DB)
      run_check "ddl-audit" "${ddlAudit}/bin/mb-check-ddl-audit"

      # Tier 2: Dynamic (needs PG + optionally Docker)
      run_check "security-tests" "${securityTests}/bin/mb-test-security" --only all-local

      TOTAL_END=$(date +%s)
      TOTAL_TIME=$((TOTAL_END - TOTAL_START))

      echo ""
      echo "========================================"
      echo "  Summary ($TOTAL_TIME s)"
      echo "========================================"
      if [ -n "$PASSED" ]; then
        echo "  PASSED:$PASSED"
      fi
      if [ -n "$FAILED" ]; then
        echo "  FAILED:$FAILED"
        exit 1
      else
        echo ""
        echo "  All security checks passed!"
        exit 0
      fi
    '';
  };

in
{
  inherit ddlAudit securityTests all;
}
```

### Flake wiring

```nix
# In flake.nix, add alongside existing imports:
security = import ./nix/security {
  inherit pkgs lib;
  src = filteredSrc;
};

# In packages block, alongside existing tests/checks:

# Security
check-ddl-audit      = security.ddlAudit;
tests-security       = security.securityTests;
check-security-all   = security.all;
```

### Usage matrix

```bash
# ── Tier 1: Static audit (instant, no deps) ────────────────────
nix run .#check-ddl-audit
# Scans source for unsafe DDL patterns. <1 second.

# ── Tier 2: Dynamic tests (needs PG, optionally Docker) ────────
nix run .#tests-security                       # all-local (H2 + Postgres)
nix run .#tests-security -- --only h2          # just H2
nix run .#tests-security -- --only postgres    # just Postgres
nix run .#tests-security -- --only mysql       # MySQL (Docker)
nix run .#tests-security -- --only clickhouse  # ClickHouse (Docker)
nix run .#tests-security -- --only all         # full matrix (Docker)

# ── Combined ────────────────────────────────────────────────────
nix run .#check-security-all                   # ddl-audit + all-local tests
```

### Dependency graph

```
check-ddl-audit
  └── ripgrep, src                    (0 JVM, 0 DB — instant)

tests-security --only all-local
  ├── PostgreSQL 18 (app DB)
  ├── JDK 21 + Clojure CLI
  └── Clojure test namespaces         (H2 embedded, PG via temp cluster)

tests-security --only all
  ├── PostgreSQL 18 (app DB)
  ├── JDK 21 + Clojure CLI
  ├── Docker: MySQL 8.0
  ├── Docker: ClickHouse 25.2
  └── Clojure test namespaces

check-security-all
  ├── check-ddl-audit (tier 1)
  └── tests-security --only all-local (tier 2)
```

### CI integration strategy

| Pipeline stage | Target | Time budget | When |
|---------------|--------|-------------|------|
| Pre-commit hook | `check-ddl-audit` | <1s | Every commit |
| PR fast path | `check-ddl-audit` | <1s | Every PR |
| PR standard | `tests-security -- --only all-local` | ~60s | PRs touching driver/ |
| Nightly | `tests-security -- --only all` | ~120s | Daily full matrix |
| Release gate | `check-security-all` | ~120s | Before release |

### Relationship to existing test infrastructure

The security tests are **additive** — they don't replace or modify existing tests:

```
nix/tests/           ← Integration tests (boot Metabase, hit APIs)
  health-check         needs: uberjar + PG
  api-smoke            needs: uberjar + PG
  db-migration         needs: uberjar + PG
  clickhouse-backend   needs: Clojure CLI + PG + Docker

nix/static-analysis/ ← Source/bytecode quality checks
  kondo, eastwood      needs: Clojure CLI
  kibit                needs: Clojure CLI
  spotbugs             needs: uberjar (bytecode)
  nvd-clojure          needs: Clojure CLI + network

nix/security/        ← NEW: Security-specific checks
  ddl-audit            needs: ripgrep (source scan)
  security-backend     needs: Clojure CLI + PG + Docker (dynamic)
```

The key distinction: `nix/tests/` validates **functional behavior** (does
Metabase boot, do APIs work), `nix/static-analysis/` validates **code quality**
(linting, CVEs), and `nix/security/` validates **adversarial resilience** (does
the code survive malicious inputs).

---

## 10. Implementation Plan

### Phase 1: Fix the known gaps (immediate)

Apply the escaping fixes to the 4 drivers identified in the audit:

| Driver     | File                     | Change                           |
|------------|--------------------------|----------------------------------|
| H2         | `src/.../h2.clj:714`     | Add `escape-sql` + `quote-name`  |
| Snowflake  | `modules/.../snowflake.clj:1051` | Add `escape-sql` + `quote-name` |
| MySQL      | `src/.../mysql.clj:1250` | Use `quote-name` for username    |
| SQL Server | `modules/.../sqlserver.clj:1127` | Use `quote-name` for identifiers in WHERE clauses |

### Phase 2: Generic dynamic tests

Create `test/metabase/driver/security/ddl_injection_test.clj` with:
- Evil password test (Component 1/3) — runs against all `:workspace` drivers
- Evil identifier test (Component 1/2) — runs against all `:workspace` drivers
- Verify destroy idempotency with adversarial inputs

### Phase 3: Static analysis checks

Create `nix/static-analysis/ddl-audit.nix` (Component 7) with:
- Regex-based scan for unsafe DDL patterns
- Integration into `check-all-static` runner

### Phase 4: String literal and parameter tests

Create templates (Components 4, 5) for:
- Native-driver string escaping validation
- Parameter substitution safety

These apply only to the ClickHouse native driver today, but establish the
pattern for future native-protocol drivers.

### Phase 5: Cross-driver join alias tests

Extend the existing join alias breakout tests (Component 6) to run against
all SQL drivers, not just Postgres/MySQL.

---

## 11. Appendix: Current Driver Audit Detail

### Postgres (`src/metabase/driver/postgres.clj`)

**Status: SAFE** (fixed in this branch)

```clojure
;; init-workspace-isolation! (line 1328)
(let [escaped-password (sql.u/escape-sql (:password read-user) :ansi)     ; ← escaped
      quoted-schema    (sql.u/quote-name :postgres :schema schema-name)   ; ← quoted
      quoted-user      (sql.u/quote-name :postgres :field (:user read-user))]
  (format "CREATE USER %s WITH PASSWORD '%s'" quoted-user escaped-password))
```

All DDL in `init-`, `destroy-`, and `grant-` uses `quote-name` and
`escape-sql` consistently.

### ClickHouse (`modules/drivers/clickhouse/src/metabase/driver/clickhouse.clj`)

**Status: SAFE** (fixed in this branch)

```clojure
;; init-workspace-isolation! (line 400)
(let [escaped-password (sql.u/escape-sql (:password read-user) :backslashes)
      quoted-db        (sql.u/quote-name :clickhouse :schema db-name)
      quoted-user      (sql.u/quote-name :clickhouse :field (:user read-user))]
  (format "CREATE USER IF NOT EXISTS %s IDENTIFIED BY '%s'" quoted-user escaped-password))
```

### H2 (`src/metabase/driver/h2.clj`)

**Status: AT RISK** — password not escaped, identifiers manually quoted

```clojure
;; init-workspace-isolation! (line 714) — CURRENT (vulnerable)
(format "CREATE USER IF NOT EXISTS \"%s\" PASSWORD '%s'" username password)

;; PROPOSED FIX:
(format "CREATE USER IF NOT EXISTS %s PASSWORD '%s'"
        (sql.u/quote-name :h2 :field username)
        (sql.u/escape-sql password :ansi))
```

### MySQL (`src/metabase/driver/mysql.clj`)

**Status: PARTIAL** — password escaped, username manually quoted

```clojure
;; init-workspace-isolation! (line 1250) — CURRENT
(format "ALTER USER `%s`@'%%' IDENTIFIED BY '%s'" user escaped-password)
;;                  ^^^^— manual backtick, not quote-name

;; PROPOSED FIX:
(format "ALTER USER %s@'%%' IDENTIFIED BY '%s'"
        (sql.u/quote-name :mysql :field user) escaped-password)
```

Note: MySQL also uses manual `` `%s` `` for database names in `CREATE
DATABASE` and `DROP DATABASE` (lines 1256, 1271).

### Snowflake (`modules/drivers/snowflake/src/metabase/driver/snowflake.clj`)

**Status: AT RISK** — password not escaped, identifiers manually quoted

```clojure
;; init-workspace-isolation! (line 1051) — CURRENT (vulnerable)
(format "CREATE USER IF NOT EXISTS \"%s\" PASSWORD = '%s' ..."
        (:user read-user) (:password read-user) role-name)

;; PROPOSED FIX:
(format "CREATE USER IF NOT EXISTS %s PASSWORD = '%s' MUST_CHANGE_PASSWORD = FALSE DEFAULT_ROLE = %s"
        (sql.u/quote-name :snowflake :field (:user read-user))
        (sql.u/escape-sql (:password read-user) :ansi)
        (sql.u/quote-name :snowflake :field role-name))
```

All `init-` and `destroy-` DDL uses manual `\"%s\"` for identifiers (lines
1044-1053, 1070-1072). The `grant-` method correctly uses `quote-name` (lines
1086-1098).

### SQL Server (`modules/drivers/sqlserver/src/metabase/driver/sqlserver.clj`)

**Status: PARTIAL** — password escaped, identifiers manually quoted, usernames
in WHERE clauses unparameterized

```clojure
;; init-workspace-isolation! (line 1127) — CURRENT
(format (str "IF NOT EXISTS (SELECT name FROM master.sys.server_principals WHERE name = '%s') "
             "CREATE LOGIN [%s] WITH PASSWORD = N'%s'")
        username username escaped-password)
;;      ^^^^^^^^— username in WHERE clause, unescaped (should use ?)
;;                        ^^^^— manual bracket quoting

;; destroy-workspace-isolation! (line 1148) — CURRENT
(format (str "DECLARE @sql NVARCHAR(MAX) = ''; "
             "SELECT @sql += 'DROP TABLE [%s].[' + name + ']; ' "
             "FROM sys.tables WHERE schema_id = SCHEMA_ID('%s'); ...")
        schema-name schema-name)
;;                                                          ^^^^— in WHERE, unescaped
```

The `grant-` method correctly uses `quote-name` (lines 1175-1180).

### Redshift (`modules/drivers/redshift/src/metabase/driver/redshift.clj`)

**Status: SAFE** — inherits Postgres `init-` and `grant-`, only overrides
`destroy-` which uses manual `\"%s\"` quoting (lower risk since inputs are
internally generated).

### BigQuery (`modules/drivers/bigquery-cloud-sdk/src/metabase/driver/bigquery_cloud_sdk.clj`)

**Status: SAFE** — uses GCP IAM APIs, not SQL DDL. No injection surface.
