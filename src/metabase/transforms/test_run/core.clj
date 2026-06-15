(ns metabase.transforms.test-run.core
  "Synchronous test-run orchestrator for transform test runs.

  Entry point: [[run-test!]].

  ## Flow

  ```
  fixtures-by-table-id
       ↓
  [1] required-input-tables (strict, fail closed on any resolution failure)
  [2] match-fixtures (every required table must have a fixture; no unknown keys)
  [3] parse each fixture CSV against its table's column schema
  [4] generate nonce; seed scratch input tables; build output target
  [5] resolve-test-transform → {:driver :compiled :target :parser-backend}
  [6] belt-and-braces DDL guard (all DDL targets satisfy test-table-name?)
  [7] execute via driver/run-transform! under with-transform-connection +
      *query-timeout-ms* binding
  [8] read back output via QP native SELECT *
  [9] parse expected CSV against actual output column types
  [10] diff/diff
  finally: cleanup! always (all paths, including exceptions and timeout)
  ```

  ## Error-handling choice (Step 7 contract)

  `run-test!` propagates typed `ex-info` for error cases — it does NOT catch
  them into a `{:status :error ...}` envelope internally. The callers (Step 7
  API handler) catch and map via the error taxonomy:

  - `::metabase.transforms.test-run.inputs/unsupported-transform-type`   → 422
  - `::metabase.transforms.test-run.inputs/cannot-determine-inputs`      → 422
  - `::metabase.transforms.test-run.inputs/table-not-found`              → 422
  - `::metabase.transforms.test-run.inputs/transform-dep-not-supported`  → 422
  - `::metabase.transforms.test-run.inputs/missing-fixtures`             → 400
  - `::metabase.transforms.test-run.inputs/unknown-fixture-keys`         → 400
  - `::metabase.transforms.test-run.resolve/cannot-test-run`             → 422
  - `::metabase.transforms.test-run.resolve/unsupported-transform-type`  → 422
  - `::metabase.transforms.test-run.core/pre-execution-guard-failed`     → 500
    (internal invariant — should never reach the API caller; paged if it fires)
  - `::metabase.transforms.test-run.core/execution-failed`               → 500
  - Any un-typed exception                                               → 500

  This design keeps error semantics in one place (the API layer) rather than
  splitting them between core.clj and the API handler.

  ## Timeout

  `*query-timeout-ms*` is bound to `test-run-timeout-ms` (from opts, defaulting
  to [[default-test-run-timeout-ms]]) before calling `driver/run-transform!`. The
  JDBC layer enforces the statement timeout; on expiry the driver throws an
  exception that propagates through `run-transform!` into the `try/finally`, and
  `finally` still drops all scratch tables. No virtual-thread cancellation is
  implemented — this matches the synchronous nature of the endpoint.

  Default timeout: 5 minutes. Rationale: interactive test runs should complete
  quickly; 5 minutes is generous for fixture-sized data. The scheduled-transform
  default (240 minutes) is appropriate for production ETL, not interactive testing.

  ## No TransformRun row

  `driver/run-transform!` is the seam below the TransformRun/event/sync layer.
  This is verified empirically (Step 0c) and asserted in the test suite.

  ## Scratch table safety

  Immediately before calling the seam, the orchestrator asserts that every DDL
  target (all scratch input tables + the output table) satisfies
  `scratch/test-table-name?`. This is the last line of defense against
  misconfiguration routing a CTAS at a real production table. The assert throws
  `::pre-execution-guard-failed` rather than proceeding."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql.util :as sql.u]
   [metabase.query-processor.core :as qp]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.test-run.diff :as diff]
   [metabase.transforms.test-run.fixtures :as fixtures]
   [metabase.transforms.test-run.inputs :as inputs]
   [metabase.transforms.test-run.resolve :as resolve]
   [metabase.transforms.test-run.scratch :as scratch]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Constants
;;; ---------------------------------------------------------------------------

(def default-test-run-timeout-ms
  "Default statement-level timeout for a test-run transform execution.

  5 minutes — appropriate for interactive test runs against fixture-sized data.
  Configured separately from the scheduled-transform timeout (240 minutes) so
  a slow transform cannot tie up an API thread indefinitely.

  Callers may override via `:timeout-ms` in `opts`."
  (u/minutes->ms 5))

;;; ---------------------------------------------------------------------------
;;; Internal helpers
;;; ---------------------------------------------------------------------------

(defn- assert-all-test-tables!
  "Belt-and-braces DDL guard: assert that every table name in `names-to-check`
  satisfies `scratch/test-table-name?`. Throws `::pre-execution-guard-failed`
  (a 500-level internal invariant) on any failure.

  This is the last line of defense before the CTAS executes. If `seed!` or
  `scratch-output-target` returned a name that did not match the test prefix,
  this assertion prevents routing the CTAS at a real production table."
  [names-to-check]
  (let [bad (remove scratch/test-table-name? names-to-check)]
    (when (seq bad)
      (throw (ex-info
              (str "Pre-execution DDL guard failed: the following table names do not match"
                   " the test-scratch prefix and will NOT be used as DDL targets:\n"
                   (pr-str (vec bad))
                   "\nThis is an internal invariant violation — file a bug.")
              {:error-type ::pre-execution-guard-failed
               :bad-names  (vec bad)})))))

(defn- build-transform-details
  "Construct the `transform-details` map consumed by `driver/run-transform!`.

  `compiled`     — the `::compiled` map from `resolve-test-transform` (verbatim).
  `output-target` — `{:schema :table}` spec from `scratch/scratch-output-target`.
  `db-id`        — integer database id.
  `db`           — `:model/Database` row.
  `driver`       — driver keyword.

  Note: `:conn-spec` is built INSIDE `with-transform-connection` (Step 0c seam
  pattern, `transforms_base/query.clj:112`). The connection-spec construction
  reads `:details` from `db`; `with-transform-connection` binds
  `*connection-type* :transform` before this call so `effective-details`
  resolves the write-data credentials and routes through the `:transform` pool."
  [compiled output-target db-id db drv]
  {:db-id          db-id
   :database       db
   :transform-id   nil
   :transform-type :table
   :conn-spec      (driver/connection-spec drv db)
   :query          compiled
   :output-schema  (:schema output-target)
   :output-db      nil
   :output-table   (transforms-base.u/qualified-table-name
                    drv
                    ;; qualified-table-name expects {:schema ... :name ...}
                    ;; but scratch-output-target returns {:schema ... :table ...}
                    {:schema (:schema output-target) :name (:table output-target)})})

(defn- read-back-output
  "Read all rows from the scratch output table via a QP native SELECT *.
  Returns the full QP result map (status :completed + :data {:cols ... :rows ...}).
  Throws on QP error.

  `drv` is the driver keyword, used to produce properly quoted identifier names.
  Schema and table are IDENTIFIERS, not values — they must be driver-quoted, not
  passed as JDBC parameters.  `sql.u/quote-name` produces the driver-appropriate
  quoting (double quotes for Postgres/ANSI, backticks for MySQL, etc.)."
  [db-id drv output-target]
  (let [schema (:schema output-target)
        table  (:table output-target)
        sql    (if schema
                 (str "SELECT * FROM "
                      (sql.u/quote-name drv :table schema table))
                 (str "SELECT * FROM "
                      (sql.u/quote-name drv :table table)))
        result (qp/process-query {:database db-id
                                  :type     :native
                                  :native   {:query sql}})]
    (when (not= :completed (:status result))
      (throw (ex-info
              (str "Failed to read back scratch output table " (pr-str table) ": QP returned "
                   (pr-str (:status result)))
              {:error-type   ::execution-failed
               :qp-status    (:status result)
               :output-table table})))
    result))

(defn- actual->schema
  "Derive the Step-1 target-schema shape from QP result cols.
  Maps `:base_type` → `:base-type` (underscore → hyphen); keeps `:name` and
  sets `:nullable? true` (we cannot determine constraints from QP metadata)."
  [cols]
  (mapv (fn [{:keys [name base_type]}]
          {:name      name
           :base-type base_type
           :nullable? true})
        cols))

;;; ---------------------------------------------------------------------------
;;; Public entry point
;;; ---------------------------------------------------------------------------

(defn run-test!
  "Execute a synchronous test run of `transform` against fixture data.

  Arguments:
  - `transform`            — a `:query` transform value (native SQL or MBQL).
  - `fixtures-by-table-id` — `{<table-id> <java.io.File>}` — multipart CSV files
                             keyed by integer table id (from `input-<table-id>` parts).
  - `expected-csv-file`    — `java.io.File` — the expected output CSV (the `expected` part).
  - `opts`                 — option map:
    - `:ignore-columns`  — `#{\"col-name\" ...}` — columns excluded from the diff.
    - `:timeout-ms`      — statement-level timeout in ms (default: [[default-test-run-timeout-ms]]).

  Returns a run-record map (JSON-serializable, shaped for Step 7's HTTP response):
  ```
  {:status          :passed | :failed
   :diff            <diff-report>   ; from diff/diff
   :parser-backend  <keyword>       ; the parser backend pinned for this run
   :output-table    <string>}       ; the scratch output table name (for debugging)
  ```

  On error, propagates a typed `ex-info` — see ns docstring for the taxonomy.
  The API layer (Step 7) catches and maps these to HTTP responses.

  Cleanup (drop all scratch tables) runs in `finally`, guaranteeing it executes
  regardless of success, failure, or timeout."
  [transform fixtures-by-table-id expected-csv-file opts]
  (let [timeout-ms    (get opts :timeout-ms default-test-run-timeout-ms)
        ignore-cols   (get opts :ignore-columns #{})
        ;; Step 1: resolve required tables (strict, fail-closed).
        required-tables (inputs/required-input-tables transform)
        ;; Step 2: match fixtures — every required table must have a fixture, no extras.
        match-plan    (inputs/match-fixtures required-tables (set (keys fixtures-by-table-id)))
        ;; Step 3: parse each fixture CSV against its table's column schema.
        seed-inputs   (mapv (fn [{:keys [table-info fixture-key]}]
                              {:table-info table-info
                               :fixture    (fixtures/parse-fixture
                                            (get fixtures-by-table-id fixture-key)
                                            (:columns table-info))})
                            match-plan)
        ;; Identify the DB we're working against. The transform's source query carries
        ;; :database for both native (lib/native-query) and MBQL (lib/query) shapes.
        db-id         (-> transform :source :query :database)
        _             (when-not db-id
                        (throw (ex-info
                                "Cannot determine database id from transform source query."
                                {:error-type ::missing-database-id
                                 :source     (:source transform)})))
        db            (t2/select-one :model/Database :id db-id)
        output-schema (or (-> transform :target :schema) "public")
        nonce         (scratch/new-nonce)]
    ;; Accumulate scratch state so finally can clean up.
    (let [mapping*     (atom nil)
          output-spec* (atom nil)]
      (try
        (driver.conn/with-transform-connection
          ;; The canonical write-data credentials + :transform JDBC pool.
          ;; conn-spec construction (inside build-transform-details) reads
          ;; *connection-type* = :transform via effective-details.
          (let [;; Step 4: seed scratch input tables.
                output-spec  (scratch/scratch-output-target output-schema nonce)
                _            (reset! output-spec* output-spec)
                mapping      (scratch/seed! db-id db output-schema seed-inputs nonce)
                _            (reset! mapping* mapping)
                ;; Step 5: compile + rewrite/override + verify.
                artifact     (resolve/resolve-test-transform transform mapping output-spec
                                                             {:db           db
                                                              :input-tables required-tables})
                drv          (:driver artifact)
                compiled     (:compiled artifact)
                ;; Step 6: belt-and-braces DDL guard.
                all-scratch-names
                (concat (map :table (vals mapping))
                        [(:table output-spec)])
                _            (assert-all-test-tables! all-scratch-names)
                ;; Step 7: execute via driver/run-transform! under the canonical bindings.
                transform-details (build-transform-details compiled output-spec db-id db drv)
                _            (binding [driver.settings/*query-timeout-ms* timeout-ms]
                               (driver/run-transform! drv transform-details {:overwrite? true}))
                ;; Step 8: read back the scratch output.
                qp-result    (read-back-output db-id drv output-spec)
                actual-cols  (get-in qp-result [:data :cols])
                actual-rows  (get-in qp-result [:data :rows])
                ;; Step 9: parse expected CSV against actual output column types.
                expected-schema   (actual->schema actual-cols)
                expected-fixture  (fixtures/parse-fixture expected-csv-file expected-schema)
                ;; Step 10: diff.
                report       (diff/diff actual-cols actual-rows expected-fixture
                                        {:ignore-columns ignore-cols})]
            {:status         (:status report)
             :diff           report
             :parser-backend (:parser-backend artifact)
             :output-table   (:table output-spec)}))
        (finally
          ;; Cleanup runs on ALL paths: success, error, timeout.
          ;; drop-table! is idempotent (DROP TABLE IF EXISTS), so double-drops are safe.
          (scratch/cleanup! db-id db
                            (or @mapping* {})
                            @output-spec*))))))
