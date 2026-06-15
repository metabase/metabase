(ns metabase.transforms.test-run.scratch
  "Scratch-table lifecycle for transform test runs.

  Scratch tables are ephemeral Postgres (or other driver) tables created during a
  test run to hold fixture data and capture transform output without touching real
  production tables.

  ## Naming convention

  All scratch tables use the name pattern:

    mb_transform_temp_table_test_<epoch36>_<nonce>_<suffix>

  where:
    - The prefix `mb_transform_temp_table_test_` extends
      `transforms-base.u/transform-temp-table-prefix` (sync skips any name starting
      with that prefix, so test tables are sync-invisible for free).
    - `epoch36` — epoch seconds encoded in base 36 (6 chars for current epoch).
    - `nonce`   — 8-character random string for per-run uniqueness.
    - `suffix`  — `in_<table-id>` for input tables, `out` for the output target.

  Production transform temp tables use `mb_transform_temp_table_<hex-millis>`.
  The `_test_` segment cannot appear in a hex-only name, so there is zero risk
  that a janitor call drops a live production transform's temp table.

  Length: comfortably under both the Postgres (63) and MySQL (64) identifier
  limits even for a 10-digit table-id (pinned by a worst-case-length test).

  ## Caller contract (connection context)

  Functions in this namespace do NOT bind `driver.conn/with-transform-connection`.
  The orchestrator (`test-run.core/run-test!`) wraps the whole run (including
  seed! and cleanup!) in the canonical connection context. Callers must supply a
  live `db-id` and `:model/Database` `db` row obtained within that context.

  ## Public API summary

  - [[new-nonce]]                — generate a unique 8-char nonce for a run.
  - [[scratch-table-name]]       — build a scratch table name string from nonce + suffix.
  - [[parse-scratch-table-name]] — parse a name string back to {:epoch-seconds :nonce :suffix}
                                   or nil if it does not match the test pattern.
  - [[test-table-name?]]         — predicate; accepts strings and keywords.
  - [[scratch-output-target]]    — build the output target spec for a run.
  - [[seed!]]                    — create + populate scratch tables from fixtures.
                                   Returns mapping {real-spec → scratch-spec}.
  - [[cleanup!]]                 — drop all scratch tables (best-effort, idempotent).
  - [[cleanup-all-test-tables!]] — janitor: drop old test scratch tables in a schema."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.query-processor.core :as qp]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.log :as log])
  (:import
   (java.util UUID)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Constants
;;; ---------------------------------------------------------------------------

(def ^:private test-segment
  "The segment that marks a scratch table as a test table (vs. a production temp table)."
  "test")

(def ^:private test-table-prefix
  "Full prefix for test scratch table names.
  Built from the canonical transform-temp-table-prefix so sync skips these tables."
  (str transforms-base.u/transform-temp-table-prefix "_" test-segment "_"))

;;; ---------------------------------------------------------------------------
;;; Naming: encode
;;; ---------------------------------------------------------------------------

(defn new-nonce
  "Generate a unique 8-character nonce for a test run."
  []
  ;; First 8 hex chars of a random UUID — same convention as transforms-base.u/temp-table-name.
  (subs (str/replace (str (UUID/randomUUID)) "-" "") 0 8))

(defn scratch-table-name
  "Build a scratch table name string from `nonce` and `suffix`.

  `nonce`  — 8-char string from [[new-nonce]].
  `suffix` — `\"in_<table-id>\"` for an input table; `\"out\"` for the output target.

  The epoch-seconds component encodes the wall-clock creation time so the janitor
  can age-gate from the name alone without relying on warehouse table-creation
  metadata (which Postgres does not expose).

  Returns a bare string (no schema prefix)."
  ^String [nonce ^String suffix]
  (let [epoch-secs (quot (System/currentTimeMillis) 1000)
        epoch36    (Long/toString epoch-secs 36)]
    (str test-table-prefix epoch36 "_" nonce "_" suffix)))

;;; ---------------------------------------------------------------------------
;;; Naming: parse + predicate
;;; ---------------------------------------------------------------------------

(defn parse-scratch-table-name
  "Parse a scratch table name string (or keyword) back to a map.

  Accepts:
  - A plain string table name.
  - A schema-qualified keyword (e.g. `:public/mb_transform_temp_table_test_...`),
    from which the name component is extracted.

  Returns `{:epoch-seconds <long> :nonce <string> :suffix <string>}` when the
  name matches the test scratch pattern, or `nil` otherwise.

  The `:epoch-seconds` value is decoded from the base-36 component and can be
  compared directly to `(quot (System/currentTimeMillis) 1000)` for age-gating."
  [table-name]
  (let [;; Extract the bare name from a keyword (schema-qualified or plain)
        bare (cond
               (nil? table-name)    nil
               (keyword? table-name) (name table-name)
               (string? table-name) table-name
               :else                nil)]
    (when (and (string? bare) (str/starts-with? bare test-table-prefix))
      ;; Remaining after prefix: <epoch36>_<nonce>_<suffix>
      (let [rest-str (subs bare (count test-table-prefix))
            parts    (str/split rest-str #"_" 3)]
        (when (= 3 (count parts))
          (let [[epoch36 nonce suffix] parts]
            (when (and (seq epoch36) (seq nonce) (seq suffix))
              (try
                {:epoch-seconds (Long/parseLong epoch36 36)
                 :nonce         nonce
                 :suffix        suffix}
                (catch NumberFormatException _
                  nil)))))))))

(defn test-table-name?
  "Return true when `table-name` is a test scratch table name.

  Accepts strings and keywords (including schema-qualified keywords like
  `:public/mb_transform_temp_table_test_...`).  Returns false for nil and
  non-string/keyword values.

  Note: does NOT consult the database — purely name-based.

  Production transform temp tables (`mb_transform_temp_table_<hex-millis>`) can
  never match because the `_test_` segment is not a valid hex sequence."
  [table-name]
  (some? (parse-scratch-table-name table-name)))

;;; ---------------------------------------------------------------------------
;;; Output target
;;; ---------------------------------------------------------------------------

(defn scratch-output-target
  "Build the output target spec for a test run's output scratch table.

  `schema` — the target schema string (from the transform target's schema).
  `nonce`  — 8-char nonce for this run (from [[new-nonce]]).

  Returns `{:schema <string> :table <string>}`, the output table spec that
  `cleanup!` and the orchestrator's read-back query consume."
  [^String schema ^String nonce]
  {:schema schema
   :table  (scratch-table-name nonce "out")})

;;; ---------------------------------------------------------------------------
;;; Seeding
;;; ---------------------------------------------------------------------------

(defn- table-schema-for-seed
  "Build a transforms-base `::table-definition` map from a table-info + scratch name.

  The returned map is suitable for `create-table-from-schema!` and
  `driver/insert-from-source!` (via the `:rows` data source)."
  [scratch-name ^String schema table-info]
  {:name    (keyword schema scratch-name)
   :columns (mapv (fn [{:keys [name base-type nullable?]}]
                    {:name      name
                     :type      base-type
                     :nullable? nullable?})
                  (:columns table-info))})

(defn seed!
  "Create and populate scratch tables from fixture data.

  Arguments:
  - `db-id`       — integer database id.
  - `db`          — `:model/Database` row; `:engine` is used to resolve the driver.
  - `schema`      — schema string in which to create scratch tables (e.g. `\"public\"`).
  - `seed-inputs` — sequence of `{:table-info <table-info map> :fixture <parse-fixture output>}` maps.
  - `nonce`       — 8-char string from [[new-nonce]]; unique per run.

  Returns a mapping `{real-spec → scratch-spec}` where each spec is
  `{:schema <string> :table <string>}`.

  The real-spec keys are `{:schema (:schema table-info) :table (:name table-info)}`.
  `resolve`'s verify normalization compares against exactly this shape
  (nil schema → driver default schema; lowercase fold).

  On partial failure (some tables created, then an error): drops all already-created
  scratch tables (best-effort, logs failures) then rethrows a typed ex-info."
  [db-id db ^String schema seed-inputs nonce]
  (let [drv     (keyword (:engine db))
        created (atom [])
        mapping (atom {})]
    (try
      (doseq [{:keys [table-info fixture]} seed-inputs]
        (let [real-spec    {:schema (:schema table-info) :table (:name table-info)}
              suffix       (str "in_" (:id table-info))
              scratch-name (scratch-table-name nonce suffix)
              tbl-schema   (table-schema-for-seed scratch-name schema table-info)]
          ;; Create the table
          (transforms-base.u/create-table-from-schema! drv db-id tbl-schema)
          (swap! created conj {:schema schema :table scratch-name})
          ;; Populate it
          (driver/insert-from-source! drv db-id tbl-schema
                                      {:type :rows
                                       :data (:rows fixture)})
          ;; Record the mapping
          (swap! mapping assoc real-spec {:schema schema :table scratch-name})))
      @mapping
      (catch Throwable e
        ;; Best-effort drop of already-created tables
        (let [drv* drv]
          (doseq [{tbl-schema :schema tbl-name :table} @created]
            (try
              (driver/drop-table! drv* db-id (keyword tbl-schema tbl-name))
              (catch Exception drop-e
                (log/warn drop-e "Failed to drop scratch table during seed! failure cleanup:"
                          (keyword tbl-schema tbl-name))))))
        (throw (ex-info
                (str "Failed to seed scratch tables: " (.getMessage e))
                {:error-type ::seed-failed
                 :created    @created}
                e))))))

;;; ---------------------------------------------------------------------------
;;; Cleanup
;;; ---------------------------------------------------------------------------

(defn cleanup!
  "Drop all scratch tables in `mapping` and the optional `output-spec`.

  Arguments:
  - `db-id`       — integer database id.
  - `db`          — `:model/Database` row.
  - `mapping`     — the `{real-spec → scratch-spec}` map from [[seed!]].
  - `output-spec` — `{:schema :table}` map for the output scratch table, or nil.

  Best-effort: logs and continues on per-table errors so that a failure to drop
  one table doesn't prevent the rest from being cleaned up.

  Idempotent: `driver/drop-table!` uses `DROP TABLE IF EXISTS` — dropping an
  already-absent table returns `[0]` without error.

  IMPORTANT: `driver/drop-table!` takes the table NAME (a schema-qualified keyword
  such as `(keyword schema table-name)`), NOT the full table-schema map.  Passing
  the schema map (as used by `create-table-from-schema!`) is a common mistake and
  will cause a ClassCastException.

  Returns nil always."
  [db-id db mapping output-spec]
  (let [drv  (keyword (:engine db))
        drop (fn [schema table-name]
               (try
                 (driver/drop-table! drv db-id (keyword schema table-name))
                 (catch Exception e
                   (log/warn e "Failed to drop scratch table during cleanup!"
                             (keyword schema table-name)))))]
    ;; Drop all input scratch tables
    (doseq [{:keys [schema table]} (vals mapping)]
      (drop schema table))
    ;; Drop output scratch table if provided
    (when output-spec
      (drop (:schema output-spec) (:table output-spec)))
    nil))

;;; ---------------------------------------------------------------------------
;;; Janitor
;;; ---------------------------------------------------------------------------

(defn- list-tables-in-schema
  "Return a seq of table-name strings in `schema` on `db-id`."
  [db-id ^String schema]
  ;; Uses information_schema rather than driver/describe-database: describe-database
  ;; lists the entire database (all schemas, potentially hundreds of tables) and requires
  ;; a full DB-level driver call. A scoped information_schema query is cheaper,
  ;; schema-specific, and works correctly on Postgres and most SQL databases without
  ;; driver-specific code. Used only by the janitor (admin/maintenance operation).
  (let [result (qp/process-query
                {:database db-id
                 :type     :native
                 :native   {:query  (str "SELECT table_name"
                                         " FROM information_schema.tables"
                                         " WHERE table_schema = ?"
                                         " ORDER BY table_name")
                            ;; Schema passed as JDBC parameter, not interpolated, to avoid
                            ;; SQL injection / malformed-SQL when the schema name contains
                            ;; single quotes or other SQL metacharacters.
                            :params [schema]}})]
    (mapv first (get-in result [:data :rows]))))

(defn cleanup-all-test-tables!
  "Catch-all janitor: drop old test scratch tables in `schema`.

  Iterates over all tables in the schema, drops those that:
  1. Parse as test scratch names (pass [[test-table-name?]] / [[parse-scratch-table-name]]).
  2. Are older than `:min-age-seconds` (default 3600 = 1 hour) based on the
     name-encoded timestamp alone — no reliance on warehouse creation-time metadata.

  Safe by construction:
  - Young test tables (timestamp < min-age) are skipped.
  - Non-test names never parse and are never touched (see ns docstring naming convention).
  - Drop is best-effort (logs, continues).

  Arguments:
  - `db-id`  — integer database id.
  - `db`     — `:model/Database` row.
  - `schema` — schema string to scan (e.g. `\"public\"`).
  - `opts`   — map with optional keys:
    - `:min-age-seconds` (default 3600) — minimum age in seconds for a table to be dropped.

  Returns a report map:
  ```
  {:dropped         [<table-name-string> ...]  ; names successfully dropped
   :skipped-young   [<table-name-string> ...]  ; test tables younger than min-age
   :non-matching-count <integer>               ; tables that did not parse as test names
   :drop-errors     [{:table <name> :error <msg>} ...]} ; per-table drop failures
  ```"
  [db-id db ^String schema {:keys [min-age-seconds] :or {min-age-seconds 3600}}]
  (let [drv         (keyword (:engine db))
        now-secs    (quot (System/currentTimeMillis) 1000)
        table-names (list-tables-in-schema db-id schema)
        dropped     (atom [])
        skipped     (atom [])
        non-match   (atom 0)
        errors      (atom [])]
    (doseq [tbl-name table-names]
      (if-let [parsed (parse-scratch-table-name tbl-name)]
        ;; It's a test scratch table — check age
        (let [age-secs (- now-secs (:epoch-seconds parsed))]
          (if (>= age-secs min-age-seconds)
            ;; Old enough — drop it
            (try
              (driver/drop-table! drv db-id (keyword schema tbl-name))
              (swap! dropped conj tbl-name)
              (catch Exception e
                (log/warn e "cleanup-all-test-tables! failed to drop" (keyword schema tbl-name))
                (swap! errors conj {:table tbl-name :error (.getMessage e)})))
            ;; Too young — skip
            (swap! skipped conj tbl-name)))
        ;; Not a test scratch table — skip silently, count it
        (swap! non-match inc)))
    {:dropped            @dropped
     :skipped-young      @skipped
     :non-matching-count @non-match
     :drop-errors        @errors}))
