(ns metabase.warehouse-index-manager.ddl-execute
  "Run a validated CREATE INDEX or DROP INDEX statement against a warehouse
  Database.

  Only `ddl-parse`-validated statements should reach this module. The
  executor adds the runtime concerns the validator can't enforce:
  autocommit handling (required for `CONCURRENTLY`), capturing
  success/failure cleanly, and reporting non-Postgres drivers as
  `:skipped` so callers can surface a clean status.

  Postgres-only in MVP. Lifted from
  `metabase-enterprise.transform-optimizer.ddl.execute`."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.util.log :as log])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn- run-statement!
  "Open a fresh connection with autocommit ON and run `statement`.
  Autocommit is critical: `CREATE INDEX CONCURRENTLY` cannot run inside an
  explicit transaction, and the default JDBC connection setup wraps each
  call in one."
  [driver-kw database ^String statement]
  (sql-jdbc.execute/do-with-connection-with-options
   driver-kw database nil
   (fn [^Connection conn]
     (.setAutoCommit conn true)
     (with-open [stmt (.createStatement conn)]
       (.execute stmt statement)))))

(defn execute!
  "Run one validated DDL statement against `database` (a Database record or
  id). Returns a status map:

      {:status :executed}                            -- success
      {:status :failed   :error-message <pg msg>}    -- statement errored
      {:status :skipped  :error-message <reason>}    -- non-Postgres or no DB"
  [driver-kw database ^String statement]
  (cond
    (nil? database)
    {:status :skipped :error-message "warehouse database not resolved"}

    (not (isa? driver/hierarchy driver-kw :postgres))
    {:status        :skipped
     :error-message (str "Index management is Postgres-only (got " driver-kw ")")}

    :else
    (try
      (run-statement! driver-kw database statement)
      {:status :executed}
      (catch Exception e
        (log/warnf e "ddl-execute! failed for: %s" statement)
        {:status        :failed
         :error-message (or (ex-message e) "unknown error")}))))
