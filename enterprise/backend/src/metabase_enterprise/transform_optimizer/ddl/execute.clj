(ns metabase-enterprise.transform-optimizer.ddl.execute
  "Run a validated `CREATE INDEX` statement against a Database.

  Only `ddl.parse`-validated statements should reach this module — by the
  time we get here, the statement has already passed the allowlist check
  (single `CREATE INDEX` on a schema-qualified table from the optimizer's
  referenced-tables set, no forbidden keywords, etc.). The executor adds
  the runtime concerns the validator can't enforce: autocommit handling
  for `CONCURRENTLY`, capturing per-statement success/failure, and not
  letting one DDL failure cascade into the rest of an accept batch.

  Postgres-only. Non-Postgres drivers are reported as `:skipped` so the
  caller can present a clean per-statement status to the user."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.util.log :as log])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn- run-statement!
  "Open a fresh connection with autocommit ON, run the statement, return.
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
      {:status :failed :error-message <pg msg>}      -- statement errored
      {:status :skipped :error-message <reason>}     -- non-Postgres or no DB

  Idempotent in practice because the optimizer's prelude requires
  `IF NOT EXISTS`; the validator will already have rejected anything else."
  [driver-kw database ^String statement]
  (cond
    (nil? database)
    {:status :skipped :error-message "source database not resolved"}

    (not (isa? driver/hierarchy driver-kw :postgres))
    {:status        :skipped
     :error-message (str "DDL execution is Postgres-only in this branch (got " driver-kw ")")}

    :else
    (try
      (run-statement! driver-kw database statement)
      {:status :executed}
      (catch Exception e
        (log/warnf e "DDL execute! failed for: %s" statement)
        {:status        :failed
         :error-message (or (ex-message e) "unknown error")}))))
