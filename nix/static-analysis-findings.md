# Static Analysis Findings

Initial baseline run of all static analysis tools against the Metabase codebase. Run date: 2026-04-03.

## Table of Contents

- [Executive Summary](#executive-summary)
- [clj-kondo](#clj-kondo)
- [Eastwood](#eastwood)
- [Kibit](#kibit)
- [SpotBugs + FindSecBugs](#spotbugs--findsecbugs)
- [nvd-clojure (CVE Scanning)](#nvd-clojure-cve-scanning)
- [Prioritized Action Plan](#prioritized-action-plan)

## Executive Summary

| Tool | Status | Findings | Actionable |
|------|--------|----------|------------|
| clj-kondo | Ran successfully | 5,244 errors, 191 warnings | ~6 real issues; 4 "wrong-arity" are false positives (Potemkin macro) |
| Eastwood | Ran successfully | 0 warnings, 0 exceptions | Clean — no action needed |
| Kibit | Ran successfully | 526 suggestions | Style only — optional cleanup |
| SpotBugs + FindSecBugs | Ran (full + targeted) | 33 Metabase (1 real, 5 accepted risk, 27 FP), 3,122 third-party | 1 real: streaming encryption lacks auth |
| nvd-clojure | Ran successfully | 52 findings (28 false positives, 24 real) | 1 CRITICAL, 10 HIGH worth investigating |

**Key takeaway**: The codebase is in good shape. Eastwood found zero issues. SpotBugs found 1 real Metabase security issue (streaming encryption uses unauthenticated AES/CBC — padding oracle risk) plus 5 accepted-risk items. No PATH_TRAVERSAL or SQL_INJECTION in PostgreSQL or ClickHouse driver code. Kondo's 5,244 "errors" are almost entirely false positives from a missing `with-temp` hook. Log4j is at 2.25.3 (well past Log4Shell). The remaining issues are CVE upgrades in transitive dependencies.

---

## clj-kondo

**Version**: 2025.10.23 (pinned in deps.edn)
**Runtime**: 90 seconds
**Summary**: 5,244 errors, 191 warnings

### Error Breakdown

| Category | Count | Verdict |
|----------|-------|---------|
| Unresolved symbol (test code) | 4,457 | False positive — missing `with-temp` hook |
| Unresolved symbol (production code) | 730 | False positive — same root cause |
| Wrong arity calls | 4 | **Real bugs** — investigate |
| Other | 1 | Expected (macro edge case) |

#### Unresolved Symbols (5,239 of 5,244 errors)

These are almost entirely destructured bindings from `metabase.test/with-temp` and similar Toucan macros. The kondo config references `hooks.toucan2.tools.with-temp` but the hook namespace doesn't exist:

```
WARNING: file hooks/toucan2/tools/with_temp not found while loading hook
WARNING: error while trying to read hook for metabase.test/with-temp:
  Could not find namespace: hooks.toucan2.tools.with-temp.
```

This means every `(mt/with-temp [...])` binding appears as an "Unresolved symbol". This accounts for ~99.9% of all findings.

**Distribution by path**:
- `test/` — 2,718 errors
- `enterprise/backend/test/` — 1,739 errors
- `src/` — 596 errors
- `enterprise/backend/src/` — 139 errors
- `modules/` — 52 errors

**Top unresolved symbols**: `_` (214), `_model` (108), `card-id` (108), `card` (100), `db` (81), `_conn` (75), `user-id` (60), `db-id` (59)

#### Wrong Arity Calls (4 errors) — FALSE POSITIVES

All 4 are in `src/metabase/util/snake_hating_map.clj` inside a `potemkin/def-map-type` macro:

| Line | Error | Actual Code |
|------|-------|-------------|
| 41 | `assoc` called with 2 args | `(assoc [this k v] ...)` — protocol method definition, not a call |
| 51 | `keys` called with 2 args | `(keys [_this] (keys m))` — protocol method definition |
| 53 | `meta` called with 2 args | `(meta [_this] (meta m))` — protocol method definition |
| 69 | `count` called with 2 args | `(count [this] (count m))` — protocol method definition |

These are protocol method implementations inside `def-map-type` where the method name shadows the core function. Kondo lacks a hook for the Potemkin macro and incorrectly interprets `(assoc [this k v] ...)` as a function call rather than a method definition.

**No action required.** These could be suppressed with a `:clj-kondo/ignore` annotation or a Potemkin kondo hook.

### Warning Breakdown

| Category | Count | Verdict |
|----------|-------|---------|
| Unresolved var | 171 | Mix of real and hook-related |
| Use metabase.util.log instead of println | 7 | **Real** — should use proper logging (see [detail](#println-calls)) |
| Use metabase.util.performance/* | 5 | **Real** — performance-preferred alternatives |
| Unused/unsorted namespace | 7 | Minor cleanup |
| Unresolved namespace | 1 | Likely real |

**Top unresolved vars**:
- `perms/all-users-group` (40) — likely a renamed or moved function
- `mt/malli=?` (26) — test helper, possibly missing require
- `driver-api/qp.error-type.invalid-query` (12) — possibly moved
- `perms/admin-group` (9)
- `perms/all-external-users-group` (7)
- `driver-api/secret-value-as-string` (7)

#### println Calls

All 7 are marked with `#_{:clj-kondo/ignore [:discouraged-var]}` — intentional but should still be converted to proper logging.

| # | File | Line | Code | Suggested Replacement |
|---|------|------|------|-----------------------|
| 1 | `src/metabase/logger/core.clj` | 245 | `(println "Created a new logger for" (logger-name a-namespace))` | `(log/info ...)` |
| 2 | `src/metabase/cmd/reset_password.clj` | 23 | `(println (str (deferred-trs "Resetting password for {0}..." email-address) "\n"))` | `(log/info ...)` — CLI output, may need stdout |
| 3 | `src/metabase/cmd/reset_password.clj` | 26 | `(println (trs "OK [[[{0}]]]" (set-reset-token! email-address)))` | `(log/info ...)` — CLI output |
| 4 | `src/metabase/cmd/reset_password.clj` | 29 | `(println (trs "FAIL [[[{0}]]]" (.getMessage e)))` | `(log/error ...)` |
| 5 | `enterprise/.../metabot_v3/repl.clj` | 30 | `(println message)` | `(log/info ...)` — REPL output, may be intentional |
| 6 | `enterprise/.../metabot_v3/repl.clj` | 35 | `(println (u/format-color :magenta "<REACTION>\n%s" ...))` | `(log/info ...)` — REPL output |
| 7 | `enterprise/.../metabot_v3/repl.clj` | 85 | `(println "Starting MetaBot REPL... 🤖")` | `(log/info ...)` — REPL output |

**Note**: The `reset_password.clj` and `repl.clj` calls are CLI/REPL tools that write directly to stdout for user interaction. Converting to `log/info` would route output through the logging framework instead of stdout, which may not be desirable for interactive CLI tools. These may be intentional uses of `println`.

---

## Eastwood

**Version**: 1.4.3
**Runtime**: 641 seconds (~10.7 minutes)
**Summary**: 0 warnings, 0 exceptions

Eastwood loads every namespace, compiles it, and runs correctness linters. A clean Eastwood run is a strong signal — it means there are no reflection issues, suspicious expressions, or unused bindings in production source paths.

**No action required.**

---

## Kibit

**Version**: 0.1.8
**Runtime**: ~8 minutes (scanned src, enterprise/backend/src, modules/drivers/clickhouse/src)
**Summary**: 526 suggestions

All findings are style suggestions, not errors. They suggest more idiomatic Clojure.

### Suggestion Categories

| Category | Count | Example |
|----------|-------|---------|
| Thread-first simplification | 360 | `(-> x f)` -> `(f x)` when single-form |
| `when-not` instead of `(when (not ...))` | 44 | Idiomatic negation |
| `set` instead of `(into #{} ...)` | 17 | Simpler set construction |
| `when` instead of `(if ... nil)` | 13 | Idiomatic nil-branch if |
| `if-not` instead of `(if (not ...))` | 12 | Idiomatic negation |
| `not=` instead of `(not (= ...))` | 10 | Simpler inequality |
| `str` instead of `.toString` | 8 | Clojure-idiomatic string conversion |
| Other | 62 | Various minor patterns |

### Top Files by Finding Count

| File | Count |
|------|-------|
| `enterprise/.../semantic_search/index.clj` | 32 |
| `enterprise/.../transforms_python/settings.clj` | 20 |
| `enterprise/.../remote_sync/spec.clj` | 20 |
| `enterprise/.../metabot_v3/tools/entity_details.clj` | 18 |
| `enterprise/.../dependencies/metadata_update.clj` | 18 |
| `enterprise/.../semantic_search/task/index_cleanup.clj` | 16 |
| `enterprise/.../dependencies/api.clj` | 16 |
| `modules/drivers/clickhouse/.../clickhouse_qp.clj` | 14 |

**Assessment**: These are all valid suggestions but none are bugs. The thread-first simplifications (360 of 526) are often a matter of taste — `(-> x f)` vs `(f x)` is a style choice where the threaded form may improve readability in context. The `when-not`, `if-not`, `not=`, and `str` suggestions are clearer wins.

---

## SpotBugs + FindSecBugs

**Version**: SpotBugs 4.8.6, FindSecBugs 1.13.0
**Configuration**: `config/static-analysis/spotbugs-exclude.xml` — suppresses Clojure AOT false positives, keeps all SECURITY findings

### Targeted Analysis (ClickHouse driver + JDBC)

**Scope**: `metabase.driver.clickhouse.*`, `metabase.driver.clickhouse_qp.*`, `metabase.driver.clickhouse_native.*`, `com.clickhouse.*`
**Effort**: max
**Runtime**: ~5 minutes
**Result**: **0 bugs found**

The targeted scan completed cleanly. No SQL injection, resource leaks, null dereference, or other findings in the ClickHouse driver code or clickhouse-jdbc library.

Non-blocking issues observed:
- Apache SSHD classes compiled with Java 24 (class file version 68) — SpotBugs 4.8.6's bundled ASM doesn't support this yet. Harmless.
- ~400 missing optional dependency classes (hadoop, grpc, netty-tcnative, etc.) — normal for a fat JAR with optional transitive deps.

### Full Uberjar Analysis

**Status**: Completed 2026-04-05 ~14:00 (effort:max, 24GB heap, ~17 hours)
**Result**: 149,235 total findings (3,155 security)

Previous attempts:

| Configuration | Heap | Result |
|---------------|------|--------|
| `effort:max`, `-Xmx768m` (SpotBugs default — our `_JAVA_OPTIONS` was silently overridden) | 768MB | Ran 11+ hours in GC death spiral, never completed |
| `effort:default`, `-maxHeap 16384` (proper SpotBugs flag) | 16GB | RSS stable at ~12GB, ran 10+ hours single-threaded in `IsNullValueAnalysis`, never completed |
| `effort:max`, `-maxHeap 24576` | 24GB | **Completed** ~17 hours, 149,235 findings |

**Root cause of slowness**: SpotBugs' null-pointer dataflow analysis (`IsNullValueAnalysis`) is single-threaded and has near-exponential complexity on Clojure AOT bytecode. The bottleneck is CPU time, not memory — RSS stabilizes well below the heap limit. The ~400MB uberjar contains thousands of AOT-compiled Clojure namespaces whose bytecode patterns are pathological for interprocedural analysis.

**Recommendation**: Use `--only-analyze` to target specific packages. See `nix/static-analysis.md` for details.

#### Full Scan Results Summary

| Category | Count |
|----------|-------|
| Total findings | 149,235 |
| Bad practice (B) | 104,245 |
| Vulnerability (V) | 21,523 |
| Performance (P) | 6,544 |
| Correctness (C) | 6,520 |
| Dodgy code (D) | 5,906 |
| **Security (S)** | **3,155** |
| Multithreaded (M) | 604 |
| Internationalization (I) | 592 |
| Experimental (X) | 146 |

The vast majority (145,000+) are Clojure AOT bytecode noise — class naming conventions, public primitive attributes, reference comparisons — all generated by the Clojure compiler and not actionable.

#### Security Findings by Origin

| Origin | Count | Actionable |
|--------|-------|------------|
| Metabase code | 33 | 1 real issue, 5 accepted risk, 27 false positives |
| Clojure runtime (`clojure.*`) | 1 | Not actionable |
| Third-party libraries | 3,121 | See breakdown below |

**Note**: The initial automated triage undercounted Metabase findings (reported 1) because SpotBugs reports Clojure files by source filename (e.g., `postgres.clj`) not by Java package name. Manual investigation identified 33 findings across Metabase-authored `.clj` files.

#### Metabase Code — 33 Security Findings (Investigated)

##### REAL ISSUE: Streaming Encryption Lacks Authentication (HIGH)

| Priority | Bug Type | File | Line | Detail |
|----------|----------|------|------|--------|
| H | CIPHER_INTEGRITY | `src/metabase/util/encryption.clj` | 121 | AES/CBC/PKCS5Padding without HMAC |
| H | PADDING_ORACLE | `src/metabase/util/encryption.clj` | 121 | CBC padding oracle vulnerability |

**The problem**: The streaming encryption codepath (`encrypt-stream` / `maybe-decrypt-stream`, added in v0.53.0) uses `AES/CBC/PKCS5Padding` **without authentication**:

```clojure
;; src/metabase/util/encryption.clj:32
(def ^:private ^:const aes-streaming-spec "AES/CBC/PKCS5Padding")  ;; ← NO HMAC

;; src/metabase/util/encryption.clj:118-124 — encrypt-stream
(let [spec   aes-streaming-spec
      ...
      cipher (Cipher/getInstance spec)              ;; ← bare CBC, no integrity check
      iv     (nonce/random-bytes 16)]
  (.init cipher Cipher/ENCRYPT_MODE
         (SecretKeySpec. (bytes/slice secret-key 32 64) "AES")
         (IvParameterSpec. iv))
  (SequenceInputStream.                             ;; format: [32-byte spec header][16-byte IV][ciphertext]
    (ByteArrayInputStream. (bytes/concat spec-header iv))
    (CipherInputStream. input-stream cipher)))
```

**Why it matters**: Without authentication (HMAC or GCM tag), an attacker who can modify stored ciphertext can:
1. **Padding oracle attack** — flip ciphertext bits, observe whether decryption succeeds or throws a `BadPaddingException`, and iteratively recover plaintext
2. **Ciphertext malleability** — modify encrypted data without detection

**Contrast with the non-streaming path** (v0.41.0), which is properly authenticated:

```clojure
;; src/metabase/util/encryption.clj:82-86 — encrypt-bytes (CORRECT)
(crypto/encrypt b
                secret-key
                initialization-vector
                {:algorithm :aes256-cbc-hmac-sha512})  ;; ← authenticated: HMAC-SHA512
```

**Fix options** (in order of preference):
1. **AES-GCM** (`AES/GCM/NoPadding`) — authenticated encryption, standard for streaming. Provides both confidentiality and integrity in a single pass.
2. **Encrypt-then-MAC** — keep AES/CBC but append HMAC-SHA256 over `(IV || ciphertext)` and verify before decryption.

The fix must be backward-compatible: `maybe-decrypt-stream` reads the 32-byte spec header to determine the algorithm, so a new spec string (e.g., `"AES/GCM/NoPadding"`) can coexist with old data.

##### FALSE POSITIVE: Static IV (encryption.clj)

| Priority | Bug Type | File | Line | Detail |
|----------|----------|------|------|--------|
| M | STATIC_IV | `src/metabase/util/encryption.clj` | 123 | IV flagged as not properly generated |
| M | STATIC_IV | `src/metabase/util/encryption.clj` | 152 | Same |

SpotBugs flagged the `IvParameterSpec` constructor but can't trace through Clojure bytecode. The actual IV generation is secure:

```clojure
;; src/metabase/util/encryption.clj:122 — IV is SecureRandom
iv (nonce/random-bytes 16)   ;; buddy.core.nonce/random-bytes uses java.security.SecureRandom
```

**Not a real issue.** The IV is freshly random per call.

##### SQL_INJECTION_JDBC in PostgreSQL Driver (8 findings)

All 8 PostgreSQL findings are in **workspace isolation DDL** — administrative schema/user management, not query execution. SpotBugs flags `Statement.addBatch(String)` because the SQL is built with `format` rather than parameterized queries. However, the identifiers come from **internal helper functions**, not user input.

**Finding 1** — `postgres.clj:1124` — Table renaming during CSV upload:

```clojure
;; src/metabase/driver/postgres.clj:1113-1125
(defmethod driver/rename-tables!* :postgres
  [driver db-id sorted-rename-map]
  (let [sqls (mapv (fn [[from-table to-table]]
                     (first (sql/format {:alter-table (keyword from-table)
                                         :rename-table (keyword (name to-table))}
                                        :quoted true                    ;; ← HoneySQL handles quoting
                                        :dialect (sql.qp/quote-style driver))))
                   sorted-rename-map)]                                  ;; ← rename-map from internal upload logic
    (jdbc/with-db-transaction [t-conn ...]
      (with-open [stmt (.createStatement ...)]
        (doseq [sql sqls]
          (.addBatch ^java.sql.Statement stmt ^String sql))             ;; ← SpotBugs flags this
        (.executeBatch ^java.sql.Statement stmt)))))
```

**Why it's safe**: `sorted-rename-map` comes from `metabase.upload/rename-tables!` — an internal mapping of old→new table names during CSV append/replace operations. The table names are Metabase-generated (e.g., `upload_1234`), and HoneySQL's `:quoted true` handles identifier quoting.

**Finding 2** — `postgres.clj:1340-1351` — Workspace isolation setup (CREATE SCHEMA, CREATE USER, GRANT):

```clojure
;; src/metabase/driver/postgres.clj:1330-1351
(let [schema-name (driver.u/workspace-isolation-namespace-name workspace)   ;; ← internal helper
      read-user   {:user     (driver.u/workspace-isolation-user-name workspace)
                   :password (driver.u/random-workspace-password)}]
  ...
  (with-open [^Statement stmt (.createStatement ...)]
    (doseq [sql [;; CREATE SCHEMA IF NOT EXISTS "<schema>"
                 (format "CREATE SCHEMA IF NOT EXISTS \"%s\"" schema-name)
                 user-sql                                                   ;; CREATE/ALTER USER
                 (format "GRANT ALL PRIVILEGES ON SCHEMA \"%s\" TO \"%s\""  ;; ← DDL with double-quoted identifiers
                         schema-name (:user read-user))
                 (format "ALTER DEFAULT PRIVILEGES IN SCHEMA \"%s\" GRANT ALL ON TABLES TO \"%s\""
                         schema-name (:user read-user))
                 (format "GRANT \"%s\" TO CURRENT_USER" (:user read-user))]]
      (.addBatch ^Statement stmt ^String sql))                              ;; ← SpotBugs flags this
    (.executeBatch ^Statement stmt)))
```

**Why it's safe**: `schema-name` and `read-user` come from `driver.u/workspace-isolation-namespace-name` and `driver.u/workspace-isolation-user-name` — internal functions that generate names like `mb_workspace_abc123`. These are not derived from user input. The identifiers are double-quoted per PostgreSQL convention.

**Finding 3** — `postgres.clj:1361-1366` — Workspace teardown (DROP SCHEMA, DROP USER):

```clojure
;; src/metabase/driver/postgres.clj:1355-1366
(defmethod driver/destroy-workspace-isolation! :postgres
  [_driver database workspace]
  (let [schema-name (:schema workspace)     ;; ← from workspace record, not user input
        username    (-> workspace :database_details :user)]
    ...
    (doseq [sql (cond-> [(format "DROP SCHEMA IF EXISTS \"%s\" CASCADE" schema-name)]
                  (user-exists? t-conn username)
                  (into [(format "DROP OWNED BY \"%s\"" username)
                         (format "DROP USER IF EXISTS \"%s\"" username)]))]
      (.addBatch ^Statement stmt ^String sql))))                ;; ← SpotBugs flags this
```

**Why it's safe**: Same as above — `schema-name` and `username` come from the workspace record stored in the app database, not from end-user input.

**Finding 4** — `postgres.clj:1389-1393` — Granting read access on specific tables:

```clojure
;; src/metabase/driver/postgres.clj:1376-1393
(let [sqls (concat
             (for [s source-schemas]
               (format "GRANT USAGE ON SCHEMA %s TO %s"
                       (sql.u/quote-name :postgres :schema s) qu))   ;; ← sql.u/quote-name handles quoting
             (for [{s :schema, t :name} tables]
               (format "GRANT SELECT ON TABLE %s.%s TO %s"
                       (sql.u/quote-name :postgres :schema s)
                       (sql.u/quote-name :postgres :table t) qu)))]
  ...
  (doseq [sql sqls]
    (.addBatch ^Statement stmt ^String sql)))                         ;; ← SpotBugs flags this
```

**Why it's safe**: Schema and table names come from the Metabase metadata catalog (synced from the database). The `sql.u/quote-name` function properly double-quotes identifiers for PostgreSQL.

**Verdict**: All 8 PostgreSQL findings are **false positives**. The DDL statements use internally-generated identifiers or `sql.u/quote-name`-quoted metadata. No user-supplied text reaches these SQL strings.

##### SQL_INJECTION_JDBC in Other Metabase Code (16 findings)

| File | Lines | Code Example | Verdict |
|------|-------|-------------|---------|
| `mysql.clj` | 1260, 1274, 1293 | `.addBatch` for workspace isolation DDL — same pattern as PostgreSQL with backtick quoting | **False positive** — internal workspace names |
| `h2.clj` | 717, 731, 743, 748 | `.addBatch` for workspace isolation DDL — same pattern with `sql.u/quote-name` | **False positive** — internal workspace names |
| `copy.clj` | 341 | `(.addBatch stmt (format "TRUNCATE TABLE %s;" (name table-name)))` where `table-name` is a Toucan2 entity | **False positive** — hardcoded model names |

**`cluster_lock.clj:38`** — Uses HoneySQL with a `[:raw "?"]` placeholder, then binds via `.setString`:

```clojure
;; src/metabase/app_db/cluster_lock.clj:35-46
(defn- prepare-statement
  ^PreparedStatement [^Connection conn lock-name-str timeout]
  (let [stmt (.prepareStatement conn                                    ;; ← SpotBugs flags this
               ^String (first (mdb.query/compile {:select [:lock.lock_name]
                                                  :from [[:metabase_cluster_lock :lock]]
                                                  :where [:= :lock.lock_name [:raw "?"]]  ;; ← placeholder
                                                  :for :update})))]
    (doto stmt
      (.setQueryTimeout timeout)
      (.setString 1 lock-name-str)                                      ;; ← bound as parameter, safe
      (.setMaxRows 1))))
```

**False positive** — this is a parameterized query. The `[:raw "?"]` generates a `?` placeholder in the SQL, and the value is bound via `.setString`.

**`sql_jdbc.clj:306`** — Enterprise impersonation SET ROLE:

```clojure
;; src/metabase/driver/sql_jdbc.clj:302-306
(defmethod driver/set-role! :sql-jdbc
  [driver conn role]
  (let [sql (driver.sql/set-role-statement driver role)]    ;; ← driver-specific "SET ROLE <role>"
    (with-open [stmt (.createStatement ^Connection conn)]
      (.execute stmt sql))))                                ;; ← SpotBugs flags this
```

**Accepted risk** — the `role` value comes from enterprise impersonation settings configured by admins. Each driver's `set-role-statement` should properly quote the role name.

**`execute.clj:239`** — Setting timezone on connection:

```clojure
;; src/metabase/driver/sql_jdbc/execute.clj:230-239
(let [sql (format format-string (str \' timezone-id \'))]   ;; ← timezone-id in single quotes
  (with-open [stmt (.createStatement conn)]
    (.execute stmt sql)))                                    ;; ← SpotBugs flags this
```

**Accepted risk** — timezone ID comes from admin-configured report timezone setting, wrapped in single quotes.

**`execute.clj:514, 600, 869, 884`** — Core query execution:

```clojure
;; src/metabase/driver/sql_jdbc/execute.clj:600 — execute-statement!
(defmethod execute-statement! :sql-jdbc
  [driver ^Statement stmt ^String sql]
  (if (.execute stmt sql)                                   ;; ← SpotBugs flags this
    (.getResultSet stmt)
    (throw ...)))
```

**By design** — Metabase is a BI tool. These are the core paths that execute user-written SQL and HoneySQL-compiled queries. The SQL in `execute.clj:514` comes from HoneySQL compilation (parameterized); `execute.clj:600` is the native query path where user SQL is intentionally executed.

##### PATH_TRAVERSAL_IN — All False Positive / Accepted Risk (12 findings)

None of these are in PostgreSQL or ClickHouse driver code. The 1,053 PATH_TRAVERSAL findings in the full scan are overwhelmingly in utility libraries:

| Library | Findings | Source Files |
|---------|----------|-------------|
| fastutil (it.unimi.dsi) | 212 | `BinIO.java` (170), `TextIO.java` (42) — binary/text file I/O utilities |
| H2 database engine | 23 | `FilePathDisk.java` — H2's internal file storage |
| JGit | 20 | `RefDirectory.java`, `BaseRepositoryBuilder.java`, `GC.java` |
| Apache Commons IO | 16 | `FileUtils.java`, `IOUtils.java` |
| Jetty | 8 | `RolloverFileOutputStream.java` |

These are all `new File(string)` or `Paths.get(uri)` calls **inside library code** where SpotBugs can't determine whether the string originates from user input. In context, they don't — Metabase controls the paths passed to these libraries.

**Metabase PATH_TRAVERSAL findings (12)**:

| File | Line | Code | Verdict |
|------|------|------|---------|
| `response.clj` | 90, 91, 100, 121 | `(File. ...)` for static resources and GeoJSON file serving | **Accepted risk** — GeoJSON URLs validated by `valid-host? :external-only` |
| `secret.clj` | 243 | `(File. ^String secret-value)` for admin-configured file-path secrets (e.g., TLS certs) | **Accepted risk** — admin-only DB connection settings |
| `secret.clj` | 254 | `(File/createTempFile ...)` | **False positive** — hardcoded prefix, system temp dir |
| `api.clj` | 80 | `(File. ...)` in GeoJSON API endpoint | **Accepted risk** — URL validated by GeoJSON settings module |
| `files.clj` | 130 | `(Paths/get (.toURI (io/resource ...)))` | **False positive** — classpath resource lookup with `:pre` assertion |
| `temp_storage.clj` | 44 | `(File/createTempFile "notification-" ".npy" @temp-dir)` | **False positive** — hardcoded prefix |
| `result_attachment.clj` | 64 | `(File/createTempFile "metabase_attachment" suffix)` | **False positive** — hardcoded prefix |
| `mysql.clj` | 977 | `(File/createTempFile (name table-name) ".tsv")` for LOAD DATA LOCAL INFILE | **False positive** — table name as prefix, system temp dir |

##### REDOS — All False Positive (5 findings)

| File | Line | Regex | Verdict |
|------|------|-------|---------|
| `setting.clj` | 892 | `[+-]?([0-9]*[.])?[0-9]+` | **False positive** — no nested quantifiers, linear matching |
| `gzip.clj` | 63 | `(gzip|\*)(;q=((0\|1)(.\\d+)?))?` | **False positive** — bounded alternatives, no backtracking |
| `data_source.clj` | 100 | `^jdbc:(postgresql\|mysql)://...` | **False positive** — non-overlapping character classes |
| `query_processor.clj` | 41 | `;([\\s;]*(--.*\\n?)*)*$` | **Low risk** — nested quantifiers exist but input is trailing SQL whitespace/comments, bounded |
| `combination.clj` | 116 | `\\[\\[(\\w+)...\\]\\]` | **False positive** — simple word matching |

##### URLCONNECTION_SSRF — False Positive / Accepted Risk (3 findings)

| File | Line | Verdict |
|------|------|---------|
| `password.clj` | 78 | **False positive** — opens `(io/resource "common_passwords.txt")`, hardcoded classpath resource |
| `response.clj` | 294 | **Accepted risk** — GeoJSON proxy with `valid-host? :external-only` protection |
| `spreadsheet.clj` | 99 | **Accepted risk** — opens URL for card export, URL from internal query results |

##### Other Metabase Findings (2)

| File | Line | Bug Type | Verdict |
|------|------|----------|---------|
| `jvm.clj` | 39 | UNENCRYPTED_SOCKET | **Accepted risk** — `host-port-up?` TCP connectivity probe, not data transfer |
| `insights.clj` | 54 | PREDICTABLE_RANDOM | **False positive** — `java.util.Random` seeded with `n` for deterministic reservoir sampling. Docstring: "Uses java.util.Random with a seed of n to ensure a consistent sample if a dataset has not changed." Not security-sensitive. |

#### Third-Party Security Findings — Top Bug Types (3,153 findings)

| Bug Type | Count | Priority H | Priority M | Assessment |
|----------|-------|-----------|-----------|------------|
| PATH_TRAVERSAL_IN | 1,053 | 0 | 1,053 | JDK file API calls in utility libraries — not exploitable in Metabase context |
| SQL_INJECTION_JDBC | 539 | 0 | 539 | JDBC wrapper/delegate classes (Quartz, H2, MariaDB) — parametrized internally |
| PREDICTABLE_RANDOM | 183 | 0 | 183 | `java.util.Random` usage in metrics/sampling libs — not security-sensitive |
| OBJECT_DESERIALIZATION | 180 | 180 | 0 | Serializable classes in commons, Guava, Quartz, fastutil — risk depends on untrusted input exposure |
| INFORMATION_EXPOSURE | 152 | 0 | 152 | Error messages in LDAP/TLS utility code |
| URLCONNECTION_SSRF_FD | 138 | 0 | 138 | URL connections in various libs — Metabase controls the URLs |
| REDOS | 126 | 0 | 126 | Regex patterns in version parsers, EDN readers — not user-facing |
| POTENTIAL_XML_INJECTION | 70 | 0 | 70 | XML construction in POI, Woodstox, SAML — mostly internal |
| CRLF_INJECTION_LOGS | 61 | 0 | 61 | Log output in various libs |
| XXE (all variants) | 122 | 0 | 122 | XML parsers in Woodstox, isorelax, SAML — needs review for user-facing XML |
| WEAK_MESSAGE_DIGEST (MD5/SHA1) | 73 | 28 | 45 | Commons-codec DigestUtils, Apache HC NTLM |
| COMMAND_INJECTION | 39 | 4 | 35 | ProcessBuilder in babashka.process, clojure.java.shell |
| WEAK_TRUST_MANAGER | 35 | 0 | 35 | TLS trust manager impls in HTTP clients |
| CIPHER_INTEGRITY / DES / ECB | 39 | 25 | 14 | NTLMEngineImpl (Apache HC) — legacy auth protocol, inherently weak crypto |
| STATIC_IV | 29 | 5 | 24 | Hardcoded IVs in various crypto code |
| LDAP_INJECTION | 27 | 0 | 27 | JNDI lookups in JDBC, directory libs |
| HARD_CODE_PASSWORD / KEY | 43 | 0 | 43 | Test/example credentials in various libs |

#### Third-Party Findings by Library (top 20)

| Library | Findings | H | M | Top Bug Types |
|---------|----------|---|---|---------------|
| it.unimi.dsi (fastutil) | 68 | 68 | 0 | OBJECT_DESERIALIZATION |
| org.apache.commons | 48 | 36 | 12 | OBJECT_DESERIALIZATION, UNENCRYPTED_SOCKET |
| Quartz JDBC delegates | 113 | 0 | 113 | SQL_INJECTION_JDBC (parametrized SQL building) |
| org.apache.logging (log4j2) | 13 | 0 | 13 | POTENTIAL_XML_INJECTION |
| org.h2 | 22 | 6 | 16 | POTENTIAL_XML_INJECTION, SQL_NONCONSTANT |
| org.eclipse.jetty | 11 | 3 | 8 | POTENTIAL_XML_INJECTION, OBJECT_DESERIALIZATION |
| org.apache.http/hc | 20 | 5 | 15 | UNENCRYPTED_SOCKET, CIPHER_INTEGRITY, DES_USAGE |
| org.quartz.impl | 10 | 10 | 0 | OBJECT_DESERIALIZATION |
| org.mariadb.jdbc | 9 | 0 | 9 | SQL_NONCONSTANT, UNENCRYPTED_SOCKET |
| org.apache.tika | 8 | 7 | 1 | OBJECT_DESERIALIZATION |
| com.google.common (Guava) | 7 | 7 | 0 | OBJECT_DESERIALIZATION |
| org.apache.poi | 7 | 0 | 7 | POTENTIAL_XML_INJECTION |
| org.postgresql | 9 | 9 | 0 | OBJECT_DESERIALIZATION, SQL_NONCONSTANT |
| org.bouncycastle | 7 | 3 | 4 | OBJECT_DESERIALIZATION, CUSTOM_MESSAGE_DIGEST |
| com.clearspring.analytics | 5 | 5 | 0 | OBJECT_DESERIALIZATION |
| com.onelogin.saml2 | 5 | 0 | 5 | POTENTIAL_XML_INJECTION |
| com.mchange (c3p0) | 5 | 5 | 0 | OBJECT_DESERIALIZATION |
| io.netty | 3 | 2 | 1 | OBJECT_DESERIALIZATION, UNENCRYPTED_SOCKET |
| javassist | 6 | 4 | 2 | OBJECT_DESERIALIZATION |
| kotlin.collections | 4 | 4 | 0 | OBJECT_DESERIALIZATION |

#### Assessment

**One real security issue in Metabase code**: the streaming encryption path (`encrypt-stream`/`maybe-decrypt-stream`) uses unauthenticated AES/CBC, making it vulnerable to padding oracle attacks. The non-streaming path is properly authenticated. This should be fixed.

All other Metabase findings (32 of 33) are false positives, accepted risks, or by-design behavior (BI tool executing SQL).

**No PATH_TRAVERSAL in PostgreSQL or ClickHouse drivers.** The 1,053 PATH_TRAVERSAL findings are overwhelmingly in utility libraries like fastutil's `BinIO.java` (170), `TextIO.java` (42), H2's `FilePathDisk.java` (23), and JGit's repository builders. These are `new File(string)` / `Paths.get(uri)` calls inside library code where SpotBugs can't determine whether the string comes from user input. In Metabase's own code, PATH_TRAVERSAL findings hit temp file creation (hardcoded prefixes — false positive) and admin-configured file paths (accepted risk).

**No SQL_INJECTION in ClickHouse driver.** PostgreSQL has 8 findings, all in workspace isolation DDL (`.addBatch` for `CREATE SCHEMA` / `GRANT` — identifiers from internal helpers, not user input). The PostgreSQL JDBC driver itself (PgConnection.java, PgResultSet.java) has 12 findings which are the standard JDBC `prepareStatement(String)` API — these are how all JDBC works.

Third-party findings are dominated by:
1. **OBJECT_DESERIALIZATION (180 H)** — Serializable classes in fastutil, commons, Quartz, Guava. Quartz's `org.quartz.impl.jdbcjobstore.PostgreSQLDelegate` (line 73) deserializes job data from the app database — worth reviewing if untrusted data could reach job storage.
2. **SQL_INJECTION_JDBC (539 M)** — Quartz JDBC delegates and H2 building SQL strings. Internal to the libraries and use parametrized values.
3. **Weak crypto in Apache HC NTLMEngineImpl** — DES, ECB mode, no cipher integrity. Inherent to the NTLM protocol, not fixable without removing NTLM support.
4. **XXE findings (122)** — XML parsers in Woodstox, isorelax, SAML. The SAML XXE findings (OneLogin, 5 findings) are worth reviewing if Metabase processes user-supplied SAML responses.

#### Log4j Status

**Log4Shell (CVE-2021-44228) is fully mitigated.** Metabase uses Log4j **2.25.3** — the infamous remote code execution vulnerability was fixed in 2.17.0 (December 2021). Metabase is 8 major versions past the fix.

Current Log4j dependency versions in `deps.edn`:

```clojure
;; deps.edn:123-131
org.apache.logging.log4j/log4j-1.2-api              {:mvn/version "2.25.3"}   ;; ✅
org.apache.logging.log4j/log4j-api                   {:mvn/version "2.25.3"}   ;; ✅
org.apache.logging.log4j/log4j-core                  {:mvn/version "2.25.3"}   ;; ✅
org.apache.logging.log4j/log4j-jcl                   {:mvn/version "2.25.3"}   ;; ✅
org.apache.logging.log4j/log4j-jul                   {:mvn/version "2.25.3"}   ;; ✅
org.apache.logging.log4j/log4j-layout-template-json  {:mvn/version "2.25.3"}   ;; ✅
org.apache.logging.log4j/log4j-slf4j2-impl           {:mvn/version "2.25.2"}   ;; ⚠️ one patch behind
```

**One remaining issue**: `log4j-slf4j2-impl` is at **2.25.2** while all other Log4j packages are at 2.25.3. This triggers:

**CVE-2025-68161** — Log4j Socket Appender TLS hostname verification bypass (CVSS 4.8, MEDIUM)
- **What**: The Socket Appender ignores the `verifyHostName` configuration option, allowing MITM attacks on remote log shipping over TLS
- **Actual risk**: LOW for most deployments — only affects setups that ship logs to a remote syslog/log aggregator via Log4j's Socket Appender with TLS. Standard `console` or `file` appender configurations (the default) are not affected.
- **Fix**: Change `deps.edn:131` from `"2.25.2"` to `"2.25.3"` — a 1-character version bump that aligns all Log4j packages:

```clojure
;; deps.edn:130-131 — BEFORE
org.apache.logging.log4j/log4j-slf4j2-impl
{:mvn/version "2.25.2"}

;; deps.edn:130-131 — AFTER
org.apache.logging.log4j/log4j-slf4j2-impl
{:mvn/version "2.25.3"}
```

SpotBugs found 14 POTENTIAL_XML_INJECTION findings in Log4j's `HtmlLayout.java` and `XmlLayout.java` — these are internal to the logging framework's layout formatters and not exploitable through Metabase.

#### PostgreSQL OBJECT_DESERIALIZATION (7 findings in org.postgresql)

SpotBugs found 7 OBJECT_DESERIALIZATION findings in the PostgreSQL JDBC driver, all HIGH priority:

| File | Line | Class/Method |
|------|------|-------------|
| `BaseDataSource.java` | 1674-1680 | `org.postgresql.ds.common.BaseDataSource.readBaseObject(ObjectInputStream)` — 6 findings |
| `PostgreSQLDelegate.java` | 73 | `org.quartz.impl.jdbcjobstore.PostgreSQLDelegate.getObjectFromBlob(ResultSet, String)` — 1 finding |

**BaseDataSource (6 findings)**: The PostgreSQL JDBC driver's `BaseDataSource` (used by connection pools) implements `Serializable` and its `readBaseObject` method calls `ObjectInputStream.readObject()` to deserialize connection pool configuration. This is a concern if serialized `DataSource` objects are read from untrusted sources — but in Metabase, connection pool configuration comes from the encrypted app database settings, not from external serialized data.

**PostgreSQLDelegate (1 finding)**: Quartz's `PostgreSQLDelegate.getObjectFromBlob` deserializes job data stored as PostgreSQL `bytea` blobs in the `qrtz_job_details` and `qrtz_triggers` tables. This is relevant because:
- Metabase uses Quartz (via quartzite) for scheduled tasks
- The Quartz tables are in the **application database** (typically PostgreSQL in production)
- If an attacker gains write access to the Quartz tables, they could store a malicious serialized object that gets deserialized when the scheduler reads job data

**Actual risk**: LOW — exploiting this requires write access to the Metabase application database, which is already a full compromise. However, defense-in-depth suggests configuring Quartz to use `org.quartz.impl.jdbcjobstore.StdJDBCDelegate` with `useProperties=true` (stores job data as key-value strings instead of serialized objects) if practical.

---

## nvd-clojure (CVE Scanning)

**Version**: nvd-clojure 5.3.0, OWASP DependencyCheck 12.2.0
**Runtime**: ~12 minutes (11 min NVD database download + 8 sec analysis)
**Summary**: 52 vulnerabilities (13 CRITICAL, 18 HIGH, 21 MEDIUM)

**Note**: nvd-clojure 4.0.0 failed with 403 errors from the NVD API despite a valid key. Upgrading to 5.3.0 (which bundles DependencyCheck 12.2.0) resolved the issue.

### False Positives — Metabase Self-Matching

OWASP DependencyCheck matched several of Metabase's own internal libraries (`connection-pool`, `hawk`, `macaw`, `throttle`) against **Metabase's own historical CVEs**. These are false positives — these JARs are internal Metabase components, not vulnerable third-party dependencies:

| Library | CVEs Matched | Reason |
|---------|-------------|--------|
| `connection-pool-1.2.0.jar` | CVE-2023-37470, CVE-2023-38646, CVE-2023-32680, CVE-2026-33725, CVE-2026-27464, CVE-2023-23629, CVE-2023-23628 | Internal Metabase lib matched to Metabase CVEs |
| `hawk-1.0.13.jar` | Same as above | Internal Metabase lib |
| `macaw-0.2.36.jar` | Same + CVE-2022-43776, CVE-2018-0697 | Metabase SQL parser lib |
| `throttle-1.0.2.jar` | Same as connection-pool | Internal Metabase lib |

These 28 findings (of 52) should be suppressed via a DependencyCheck suppression file.

### Real Findings — Detailed

#### CVE-2023-39017 — Quartz Code Injection (CRITICAL, CVSS 9.8)

- **Library**: `org.quartz-scheduler/quartz` 2.3.2
- **Declared in**: `deps.edn:28` — `clojurewerkz/quartzite {:mvn/version "2.2.0"}` (transitive)
- **Vulnerability**: `SendQueueMessageJob.execute` in quartz-jobs allows code injection via unchecked arguments
- **Used by**: Enterprise backend scheduled tasks (`metabase_enterprise/semantic_search/task/indexer.clj`, `metabase_enterprise/cache/task/refresh_cache_configs.clj`, many others via `clojurewerkz.quartzite`)
- **Actual risk**: MEDIUM — Metabase uses quartzite for cron-based scheduled task management, not `SendQueueMessageJob` (JMS-based). The vulnerable class is unlikely to be in any active code path.
- **Fix**: Upgrade `clojurewerkz/quartzite` to a version that depends on `quartz >= 2.3.3`, or add explicit override in deps.edn
- **Fixed version**: `org.quartz-scheduler/quartz >= 2.3.3`

#### CVE-2022-45868 — H2 Web Console RCE (HIGH, CVSS 7.8)

- **Library**: `com.h2database/h2` 2.1.214
- **Declared in**: `deps.edn:55` — `com.h2database/h2 {:mvn/version "2.1.214"}` (direct, marked `^:antq/exclude`)
- **Vulnerability**: Web admin console password in cleartext via `-webAdminPassword` CLI argument
- **Used by**: `src/metabase/driver/h2.clj` — embedded test database driver (superseded/deprecated for production)
- **Actual risk**: LOW — H2 web console is not automatically started by Metabase. Requires local access and explicit CLI configuration. The `^:antq/exclude` marker suggests deliberate pinning (likely for compatibility).
- **Fix**: Upgrade to `com.h2database/h2 >= 2.2.220` and remove `^:antq/exclude`
- **Ref**: https://metaboat.slack.com/archives/CKZEMT1MJ/p1727191010259979

#### CVE-2026-33871 / CVE-2026-33870 — Netty Transport DoS + Smuggling (HIGH, CVSS 7.5)

- **Libraries**: `io.netty/netty-transport` 4.2.9.Final, 4.1.130.Final, 4.1.127.Final
- **Declared in**:
  - `deps.edn:91` — `io.netty/netty-codec-http {:mvn/version "4.2.9.Final"}` (direct override for AWS S3)
  - `modules/drivers/bigquery-cloud-sdk/deps.edn:28-29` — `netty-common` and `netty-buffer` 4.2.7.Final
  - Transitive via `athena-jdbc-3.7.0.jar` (shaded `netty-transport` 4.1.127.Final)
- **CVE-2026-33871**: HTTP/2 CONTINUATION frame flood DoS — zero-byte frames bypass size mitigations
- **CVE-2026-33870**: HTTP/1.1 chunked transfer encoding request smuggling
- **Actual risk**: MEDIUM — Netty is used indirectly through AWS SDK and database connectors
- **Fix**: Upgrade to `>= 4.2.10.Final` (4.2.x) or `>= 4.1.132.Final` (4.1.x). For shaded athena-jdbc, need upstream update.

#### CVE-2026-25087 — Apache Arrow Use-After-Free (HIGH, CVSS 7.0)

- **Libraries**: `arrow-memory-core` 18.3.0, `arrow-memory-unsafe` 17.0.0
- **Declared in**: `modules/drivers/bigquery-cloud-sdk/deps.edn:21-23` — `org.apache.arrow/arrow-{format,memory-core,memory-netty}` 18.3.0
- **Vulnerability**: Use-after-free in C++ Arrow IPC file reader with pre-buffering enabled
- **Actual risk**: VERY LOW — the vulnerability is in the C++ implementation. The Java bindings do NOT expose `RecordBatchFileReader::PreBufferMetadata`, so this is not exploitable in Metabase.
- **Fix**: Optional upgrade to `>= 23.0.1`, but not urgent given Java is not affected.

#### CVE-2026-24308 / CVE-2026-24281 — ZooKeeper (HIGH, CVSS 7.5/7.4)

- **Library**: `org.apache.zookeeper/zookeeper` (shaded in `hive-jdbc-4.2.0-standalone.jar`)
- **Declared in**: Transitive via Hive JDBC driver
- **Actual risk**: LOW — shaded inside hive-jdbc standalone JAR, not directly upgradeable without upstream update
- **Fix**: Upgrade hive-jdbc when a new version is available

#### CVE-2025-27821 — Hadoop HDFS OOB Write (HIGH, CVSS 7.3)

- **Library**: `hadoop-registry` (shaded in `hive-jdbc-4.2.0-standalone.jar`)
- **Declared in**: Transitive via Hive JDBC driver
- **Actual risk**: LOW — same shaded JAR situation as ZooKeeper
- **Fix**: Upgrade hive-jdbc when a new version is available

#### CVE-2025-67721 — Aircompressor OOB Read (MEDIUM, CVSS 7.5)

- **Library**: `io.airlift/aircompressor` 2.0.2
- **Declared in**: Transitive (likely via AWS SDK or database driver)
- **Vulnerability**: Malformed Snappy/LZ4 input can read previous buffer contents, leaking data
- **Actual risk**: MEDIUM — relevant if buffer reuse occurs with untrusted compressed input
- **Fix**: Add explicit override `io.airlift/aircompressor {:mvn/version "3.4"}` to deps.edn

#### CVE-2025-68161 — Log4j Socket Appender TLS (MEDIUM, CVSS 4.8)

- **Library**: `org.apache.logging.log4j/log4j-slf4j2-impl` 2.25.2
- **Declared in**: `deps.edn:130-131` — direct dependency
- **Vulnerability**: Socket Appender ignores `verifyHostName` config, allowing MITM on remote log traffic
- **Actual risk**: LOW — only affects Socket Appender for remote syslog. Most deployments use local logging.
- **Fix**: Upgrade from `2.25.2` → `2.25.3` (other log4j packages in deps.edn are already at 2.25.3)

#### CVE-2020-29582 — Kotlin Stdlib Temp File Permissions (MEDIUM, CVSS 5.3)

- **Library**: `kotlin-stdlib` 1.9.10
- **Declared in**: Transitive (likely via a database driver)
- **Vulnerability**: Insecure temp file permissions in Kotlin < 1.4.21
- **Actual risk**: LOW — version 1.9.10 is already > 1.4.21, so this may be a false positive from OWASP DC matching by product name
- **Fix**: Likely no action needed; verify with upstream

#### Other MEDIUM Findings

| CVE | Library | Source | CVSS | Risk | Fix |
|-----|---------|--------|------|------|-----|
| CVE-2025-48924 | commons-lang3 (in handlebars-4.3.1) | Transitive | 5.3 | LOW | Upgrade handlebars |
| CVE-2024-47554 | commons-io (in velocity-engine-core-2.3) | Transitive | 4.3 | LOW | Upgrade velocity-engine |
| CVE-2025-67735 | netty-transport-kqueue 4.1.127 | Transitive via athena-jdbc | 6.5 | LOW | Upgrade athena-jdbc |

### Assessment

After removing 28 false positives (Metabase self-matching), there are **24 real findings**:
- **1 CRITICAL**: quartz code injection — likely not exploitable (uses JMS path Metabase doesn't use), but should upgrade
- **10 HIGH**: netty DoS (fixable), H2 console (low exposure), zookeeper/hadoop (shaded, needs upstream), arrow (Java not affected)
- **13 MEDIUM**: mostly transitive deps with low actual risk

**Quickest wins**: Upgrade `log4j-slf4j2-impl` from 2.25.2→2.25.3 (1-line change), upgrade `netty-codec-http` to 4.2.10+ (1-line change), add `aircompressor` 3.4 override.

**Full HTML report**: `target/nvd/dependency-check-report.html`

---

## Prioritized Action Plan

### P0 — Fix Now (Real Bugs)

| # | Finding | Source | Effort | Impact |
|---|---------|--------|--------|--------|
| 1 | **Streaming encryption uses AES/CBC without HMAC** — `src/metabase/util/encryption.clj:32,121` (`aes-streaming-spec`) | SpotBugs | Medium | HIGH — padding oracle attack on `encrypt-stream`/`maybe-decrypt-stream`. Non-streaming path uses authenticated `aes256-cbc-hmac-sha512`. Fix: switch to AES-GCM or add HMAC. |
| 2 | ~~**4 wrong-arity calls**~~ | clj-kondo | — | **FALSE POSITIVES** — Potemkin `def-map-type` macro in `snake_hating_map.clj`. Not bugs. |

### P1 — Fix Soon (Infrastructure / Security)

| # | Finding | Source | Effort | Impact |
|---|---------|--------|--------|--------|
| 2 | **CVE-2023-39017**: quartz-2.3.2 code injection (CVSS 9.8) | nvd-clojure | Medium | CRITICAL — check if Metabase uses affected quartz-jobs features |
| 3 | **CVE-2022-45868**: H2 2.1.214 web console RCE (CVSS 7.8) | nvd-clojure | Medium | HIGH — H2 used for app DB; web console exposure matters |
| 4 | **Netty transport DoS** (CVE-2026-33870, CVE-2026-33871) | nvd-clojure | Small | HIGH — upgrade netty-transport across direct deps |
| 5 | **NVD false positive suppression** — create DependencyCheck suppression file for Metabase self-matching | nvd-clojure | Small | 28 false positives mask real findings |
| 6 | **Missing `with-temp` kondo hook** — causes 5,239 false positives that mask real issues | clj-kondo | Medium | Blocks kondo from being useful in CI; real errors hidden in noise |
| 7 | **7 println calls** that should use `metabase.util.log` | clj-kondo | Small | Proper logging for observability |
| 8 | **CVE-2025-68161**: `log4j-slf4j2-impl` 2.25.2→2.25.3 (Socket Appender TLS bypass) | nvd-clojure | Trivial | LOW risk but trivial 1-char fix in `deps.edn:131` |

### P2 — Fix When Convenient (Quality)

| # | Finding | Source | Effort | Impact |
|---|---------|--------|--------|--------|
| 5 | **171 unresolved vars** in warnings — mix of moved/renamed functions | clj-kondo | Medium | Some may be real missing requires; others are hook-related |
| 6 | **5 performance suggestions** — use `metabase.util.performance/*` variants | clj-kondo | Small | Minor perf wins (custom mapv, select-keys, empty?) |
| 7 | **64 `when-not`/`if-not`/`not=`** suggestions | kibit | Small | More idiomatic code |
| 8 | **8 `.toString` -> `str`** suggestions | kibit | Small | Clojure-idiomatic, nil-safe |

### P3 — Optional / Style-Only

| # | Finding | Source | Effort | Impact |
|---|---------|--------|--------|--------|
| 9 | **360 thread-first simplifications** | kibit | Large (many files) | Style preference — debatable whether `(-> x f)` or `(f x)` is better |
| 10 | **17 `set` vs `into #{}`** suggestions | kibit | Small | Marginal readability improvement |
| 11 | **Namespace sorting/cleanup** (7 findings) | clj-kondo | Small | Cosmetic |

### Completed — All Scans Done

| # | Finding | Source | Status |
|---|---------|--------|--------|
| 12 | **SpotBugs full uberjar** | SpotBugs + FindSecBugs | **Complete** — 33 Metabase findings (1 real, 5 accepted risk, 27 FP), 3,122 third-party |
| 13 | **CVE dependency scan** | nvd-clojure | **Complete** — 24 real findings after removing false positives |

### Recommended Sequence

1. **P0.1**: Fix streaming encryption — switch `AES/CBC/PKCS5Padding` to `AES/GCM/NoPadding` in `src/metabase/util/encryption.clj` (or add HMAC)
2. **P1.2**: Investigate CVE-2023-39017 (quartz code injection) — check if Metabase uses `org.quartz.jobs` affected code paths
3. **P1.3**: Investigate CVE-2022-45868 (H2 web console) — verify H2 console is not exposed in production
4. **P1.4**: Upgrade Netty transport to fix CVE-2026-33870/33871 DoS
5. **P1.5**: Create DependencyCheck suppression file for Metabase self-matching false positives
6. **P1.6**: Create or fix the `hooks.toucan2.tools.with-temp` kondo hook — this unlocks kondo for CI
7. **P1.7**: Replace println calls with log calls
8. **P1.8**: Upgrade `log4j-slf4j2-impl` 2.25.2→2.25.3 (trivial 1-char fix, aligns all Log4j packages)
9. **P1.9**: Review OneLogin SAML XXE findings — verify XML parser hardening for user-supplied SAML responses
10. **P1.10**: Review Quartz OBJECT_DESERIALIZATION — verify job data deserialization doesn't process untrusted input
11. **P2**: Work through unresolved vars and performance suggestions incrementally
12. **P3**: Kibit suggestions can be adopted file-by-file during normal development
10. **P3**: Kibit suggestions can be adopted file-by-file during normal development
