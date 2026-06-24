(ns metabase.transforms.test-run.execute
  "Shared low-level execution seams for transform test runs.

  These helpers sit directly above `driver/run-transform!` and the read-back QP
  query. They carry no orchestration logic — no seeding, no cleanup, no diffing —
  only the mechanical translation between a resolved artifact and a
  `run-transform!` call, plus reading the result back.

  These functions assume they run inside `driver.conn/with-transform-connection`
  (the orchestrator wraps the whole run)."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql.util :as sql.u]
   [metabase.query-processor.core :as qp]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.test-run.scratch :as scratch]))

(set! *warn-on-reflection* true)

(defn assert-all-test-tables!
  "Belt-and-braces DDL guard: assert that every table name in `names-to-check`
  satisfies `scratch/test-table-name?`. Throws `::pre-execution-guard-failed`
  (a 500-level internal invariant) on any failure.

  This is the last line of defense before a CTAS executes. If `seed!` or an
  output-target builder returned a name that did not match the test prefix, this
  assertion prevents routing the CTAS at a real production table."
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

(defn build-transform-details
  "Construct the `transform-details` map consumed by `driver/run-transform!`.

  `compiled`      — the `::compiled` map from `resolve-test-transform` (verbatim).
  `output-target` — `{:schema :table :db}` spec from a scratch output-target builder.
  `db-id`         — integer database id.
  `db`            — `:model/Database` row.
  `drv`           — driver keyword."
  [compiled output-target db-id db drv]
  {:db-id          db-id
   :database       db
   :transform-id   nil
   :transform-type :table
   ;; conn-spec resolves write-data creds + the :transform pool from the active context.
   :conn-spec      (driver/connection-spec drv db)
   :query          compiled
   :output-schema  (:schema output-target)
   :output-db      (:db output-target)
   :output-table   (transforms-base.u/qualified-table-name
                    drv
                    ;; qualified-table-name expects {:schema ... :name ...}
                    ;; but scratch output-targets return {:schema ... :table ...}
                    {:schema (:schema output-target) :name (:table output-target)})})

(defn read-back-output
  "Read all rows from the scratch output table via a QP native SELECT *.
  Returns the full QP result map (status :completed + :data {:cols ... :rows ...}).
  Throws on QP error.

  `drv` is the driver keyword, used to produce properly quoted identifier names.
  `output-target` must be a `{:schema :table :db}` spec as returned by
  `scratch-output-target`. When `:db` is non-nil the SELECT uses a 3-segment
  `catalog.schema.table` reference; otherwise it falls back to `schema.table` or
  bare `table`. This is required for drivers where the catalog must appear in
  emitted SQL (BigQuery, SQL Server).

  Schema and table are IDENTIFIERS, not values — they must be driver-quoted, not
  passed as JDBC parameters.  `sql.u/quote-name` produces the driver-appropriate
  quoting (double quotes for Postgres/ANSI, backticks for MySQL, etc.)."
  [db-id drv output-target]
  (let [catalog (:db output-target)
        schema  (:schema output-target)
        table   (:table output-target)
        sql     (cond
                  (and catalog schema)
                  (str "SELECT * FROM " (sql.u/quote-name drv :table catalog schema table))
                  schema
                  (str "SELECT * FROM " (sql.u/quote-name drv :table schema table))
                  :else
                  (str "SELECT * FROM " (sql.u/quote-name drv :table table)))
        result  (qp/process-query {:database db-id
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
