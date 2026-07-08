(ns metabase-enterprise.transforms-verification.execute
  "Execution helpers for transform test runs: translate a resolved artifact into a
  `driver/run-transform!` call, and read the output table back via the QP.

  `build-transform-details` captures the write-data conn-spec, so the CTAS caller
  wraps it in `driver.conn/with-transform-connection`. `read-back-output` is a plain
  read; it runs under the ambient (`:default`) connection."
  (:require
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase-enterprise.transforms-verification.scratch :as scratch]
   [metabase.driver :as driver]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor.core :as qp]
   [metabase.transforms-base.util :as transforms-base.u]))

(set! *warn-on-reflection* true)

(defn native-query
  "Build an MBQL 5 native query running `sql` against `db-id`. `params` are
  positional JDBC parameters for `?` placeholders in `sql`."
  ([db-id sql]
   (native-query db-id sql nil))
  ([db-id sql params]
   (cond-> (lib/native-query (lib-be/application-database-metadata-provider db-id) sql)
     (seq params) (lib/update-query-stage 0 assoc :params params))))

(defn run-native!
  "Execute `query` via the QP; return the full result map. Throws `error-type`
  on any non-`:completed` status — message is `failure-msg` suffixed with the
  QP status, ex-data is `ex-data-map` plus `:qp-status`."
  [query error-type failure-msg ex-data-map]
  (let [result (qp/process-query query)]
    (when (not= :completed (:status result))
      (throw (errors/ex error-type
                        (str failure-msg ": QP returned " (pr-str (:status result)))
                        (assoc ex-data-map :qp-status (:status result)))))
    result))

(defn assert-all-test-tables!
  "Assert that every table name in `names-to-check` satisfies
  `scratch/test-table-name?`; throws `::errors/pre-execution-guard-failed` on any failure.
  Guards a CTAS against ever targeting a name that isn't a test-scratch table."
  [names-to-check]
  (let [bad (remove scratch/test-table-name? names-to-check)]
    (when (seq bad)
      (throw (errors/ex ::errors/pre-execution-guard-failed
                        (str "Pre-execution DDL guard failed: the following table names do not match"
                             " the test-scratch prefix and will NOT be used as DDL targets:\n"
                             (pr-str (vec bad))
                             "\nThis is an internal invariant violation — file a bug.")
                        {:bad-names (vec bad)})))))

(defn build-transform-details
  "Construct the `transform-details` map consumed by `driver/run-transform!`.

  `compiled`      — the `::compiled` map from `resolve-test-transform` (verbatim).
  `output-target` — `{:schema :table :db}` spec from a scratch output-target builder.
  `db-id`         — integer database id.
  `db`            — `:model/Database` row.
  `driver`        — driver keyword."
  [compiled output-target db-id db driver]
  {:db-id          db-id
   :database       db
   :transform-id   nil
   :transform-type :table
   ;; conn-spec resolves write-data creds + the :transform pool from the active context.
   :conn-spec      (driver/connection-spec driver db)
   :query          compiled
   :output-schema  (:schema output-target)
   :output-db      (:db output-target)
   :output-table   (transforms-base.u/qualified-table-name
                    driver
                    ;; qualified-table-name expects {:schema ... :name ...}
                    ;; but scratch output-targets return {:schema ... :table ...}
                    {:schema (:schema output-target) :name (:table output-target)})})

(defn read-back-output
  "Read all rows from the scratch output table via a QP native SELECT *.
  Returns the full QP result map (status :completed + :data {:cols ... :rows ...});
  temporal cells are java.time objects, not formatted strings. Throws on QP error.

  `driver` is the driver keyword; `output-target` is a `{:schema :table :db}` spec
  as returned by `scratch-output-target`."
  [db-id driver output-target]
  ;; The SELECT is string-built; it is injection-safe only because output-target is a
  ;; system-generated scratch spec (never user input).
  {:pre [(scratch/test-table-name? (:table output-target))]}
  (let [sql (str "SELECT * FROM " (scratch/spec->sql-ref driver output-target))]
    ;; format-rows renders temporals as report-timezone-shifted strings, which
    ;; would spuriously mismatch the fixtures' UTC-canonicalized wall times on
    ;; any non-UTC instance. Raw java.time objects canonicalize TZ-safely.
    (run-native! (assoc (native-query db-id sql) :middleware {:format-rows? false})
                 ::errors/execution-failed
                 (str "Failed to read back scratch output table " (pr-str (:table output-target)))
                 {:output-table (:table output-target)})))

(defn actual->schema
  "Derive the `parse-fixture` target-schema shape (`{:name :base-type :nullable?}`) from QP result cols.
  Maps `:base_type` → `:base-type` (underscore → hyphen); keeps `:name` and
  sets `:nullable? true` (we cannot determine constraints from QP metadata)."
  [cols]
  (mapv (fn [{:keys [name base_type]}]
          {:name      name
           :base-type base_type
           :nullable? true})
        cols))
