(ns metabase.transforms.test-run.core
  "Synchronous test-run orchestrator for transform test runs.

  Entry point: [[run-test!]]."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql :as driver.sql]
   [metabase.transforms.test-run.diff :as diff]
   [metabase.transforms.test-run.execute :as execute]
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
  "Default statement-level timeout for a test-run transform execution, sized for
  interactive runs against fixture data. Override via `:timeout-ms` in `opts`."
  (u/minutes->ms 5))

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

  Returns a run-record map (JSON-serializable):
  ```
  {:status          :passed | :failed
   :diff            <diff-report>   ; from diff/diff
   :parser-backend  <keyword>       ; the parser backend pinned for this run
   :output-table    <string>}       ; the scratch output table name (for debugging)
  ```

  On error, throws a typed `ex-info` (`:error-type` in ex-data); see
  [[metabase.transforms.test-run.inputs]] and
  [[metabase.transforms.test-run.resolve]] for the taxonomy.

  Cleanup (drop all scratch tables) runs in `finally` — success, failure, or
  timeout."
  [transform fixtures-by-table-id expected-csv-file opts]
  (let [timeout-ms    (get opts :timeout-ms default-test-run-timeout-ms)
        ignore-cols   (get opts :ignore-columns #{})
        ;; Resolve required tables — strict, fail-closed.
        required-tables (inputs/required-input-tables transform)
        ;; Match fixtures — every required table must have a fixture, no extras.
        match-plan    (inputs/match-fixtures required-tables (set (keys fixtures-by-table-id)))
        ;; Parse each fixture CSV against its table's column schema.
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
        nonce         (scratch/new-nonce)
        ;; Accumulate scratch state so finally can clean up.
        mapping*     (atom nil)
        output-spec* (atom nil)]
    (driver.conn/with-transform-connection
      ;; Wrap the whole run in the canonical write-data credentials + :transform
      ;; JDBC pool — seed, DDL, execute, and cleanup all run under it.
      (try
        (let [;; Derive the driver early so we can thread the catalog through scratch specs.
              drv-early    (keyword (:engine db))
              catalog      (driver.sql/db-slot-value drv-early db)
              output-spec  (scratch/scratch-output-target output-schema nonce "out" catalog)
              _            (reset! output-spec* output-spec)
              mapping      (scratch/seed! db-id db output-schema seed-inputs nonce)
              _            (reset! mapping* mapping)
              ;; Compile + rewrite/override + verify.
              artifact     (resolve/resolve-test-transform transform mapping output-spec
                                                           {:db           db
                                                            :input-tables required-tables})
              drv          (:driver artifact)
              compiled     (:compiled artifact)
              all-scratch-names
              (concat (map :table (vals mapping))
                      [(:table output-spec)])
              _            (execute/assert-all-test-tables! all-scratch-names)
              ;; The JDBC layer enforces *query-timeout-ms*; on expiry the driver
              ;; throws, the exception propagates into the try/finally, and cleanup
              ;; still runs.
              transform-details (execute/build-transform-details compiled output-spec db-id db drv)
              _            (binding [driver.settings/*query-timeout-ms* timeout-ms]
                             (driver/run-transform! drv transform-details {:overwrite? true}))
              qp-result    (execute/read-back-output db-id drv output-spec)
              actual-cols  (get-in qp-result [:data :cols])
              actual-rows  (get-in qp-result [:data :rows])
              ;; Parse expected CSV against the actual output column types.
              expected-schema   (execute/actual->schema actual-cols)
              expected-fixture  (fixtures/parse-fixture expected-csv-file expected-schema)
              report       (diff/diff actual-cols actual-rows expected-fixture
                                      {:ignore-columns ignore-cols})]
          {:status         (:status report)
           :diff           report
           :parser-backend (:parser-backend artifact)
           :output-table   (:table output-spec)})
        (finally
          ;; Cleanup runs on ALL paths: success, error, timeout. Must be inside
          ;; with-transform-connection so DROP TABLE executes under write-data
          ;; credentials.
          (scratch/cleanup! db-id db
                            (or @mapping* {})
                            @output-spec*))))))
