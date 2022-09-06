(ns metabase.driver.mysql.ddl
  (:require [clojure.core.async :as a]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.ddl :as sql.ddl]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor :as qp]
            [metabase.util.i18n :refer [trs]])
  (:import java.sql.SQLNonTransientConnectionException))

(defn- exec-async [conn-chan db-spec sql+params]
  (a/thread
    (jdbc/with-db-connection [conn db-spec]
      (try
        (let [pid (:pid (first (sql.ddl/jdbc-query conn ["select connection_id() pid"])))]
          (a/put! conn-chan pid)
          (sql.ddl/jdbc-query conn sql+params))
        (catch SQLNonTransientConnectionException _e
          ;; Our connection may be killed due to timeout, `kill` will throw an appropriate exception
          nil)
        (catch Exception e
          (log/warn e)
          (throw e))))
    true))

(defn- kill [conn pid]
  (let [results (sql.ddl/jdbc-query conn ["show processlist"])
        result? (some (fn [r]
                        (and (= (:id r) pid)
                          (str/starts-with? (or (:info r) "") "-- Metabase")))
                      results)]
    (when result?
      ;; Can't use a prepared parameter with these statements
      (sql.ddl/execute! conn [(str "kill " pid)])
      (throw (Exception. (trs "Killed mysql process id {0} due to timeout." pid))))))

(defn- execute-with-timeout!
  "Spins up another channel to execute the statement.
   If `timeout-ms` passes, send a kill statement to stop execution and throw exception
   Otherwise return results returned by channel."
  [conn db-spec timeout-ms sql+params]
  (let [conn-chan (a/chan)
        exec-chan (exec-async conn-chan db-spec sql+params)
        pid (a/<!! conn-chan)
        timeout-chan (a/timeout timeout-ms)
        [v port] (a/alts!! [timeout-chan exec-chan])]
    (cond
      (= port timeout-chan) (kill conn pid)

      (= port exec-chan) v)))

(defmethod ddl.i/refresh! :mysql [_driver database definition dataset-query]
  (let [{:keys [query params]} (qp/compile dataset-query)
        db-spec (sql-jdbc.conn/db->pooled-connection-spec database)]
    (jdbc/with-db-connection [conn db-spec]
      (sql.ddl/execute! conn [(sql.ddl/drop-table-sql database (:table-name definition))])
      ;; It is possible that this fails and rollback would not restore the table.
      ;; That is ok, the persisted-info will be marked inactive and the next refresh will try again.
      (execute-with-timeout! conn
                             db-spec
                             (.toMillis (t/minutes 10))
                             (into [(sql.ddl/create-table-sql database definition query)] params))
      {:state :success})))

(defmethod ddl.i/unpersist! :mysql
  [_driver database persisted-info]
  (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
    (try
      (sql.ddl/execute! conn [(sql.ddl/drop-table-sql database (:table_name persisted-info))])
      (catch Exception e
        (log/warn e)
        (throw e)))))

(defmethod ddl.i/check-can-persist :mysql
  [database]
  (let [schema-name (ddl.i/schema-name database (public-settings/site-uuid))
        table-name (format "persistence_check_%s" (rand-int 10000))
        db-spec (sql-jdbc.conn/db->pooled-connection-spec database)
        steps [[:persist.check/create-schema
                (fn check-schema [conn]
                  (let [existing-schemas (->> ["select schema_name from information_schema.schemata"]
                                              (sql.ddl/jdbc-query conn)
                                              (map :schema_name)
                                              (into #{}))]
                    (or (contains? existing-schemas schema-name)
                      (sql.ddl/execute! conn [(sql.ddl/create-schema-sql database)]))))
                (fn undo-check-schema [conn]
                  (sql.ddl/execute! conn [(sql.ddl/drop-schema-sql database)]))]
               [:persist.check/create-table
                (fn create-table [conn]
                  (execute-with-timeout! conn
                                         db-spec
                                         (.toMillis (t/minutes 10))
                                         [(sql.ddl/create-table-sql
                                            database
                                            {:table-name table-name
                                             :field-definitions [{:field-name "field"
                                                                  :base-type :type/Text}]}
                                            "values (1)")]))
                (fn undo-create-table [conn]
                  (sql.ddl/execute! conn [(sql.ddl/drop-table-sql database table-name)]))]
               [:persist.check/read-table
                (fn read-table [conn]
                  (sql.ddl/jdbc-query conn [(format "select * from %s.%s"
                                                    schema-name table-name)]))
                (constantly nil)]
               [:persist.check/delete-table
                (fn delete-table [conn]
                  (sql.ddl/execute! conn [(sql.ddl/drop-table-sql database table-name)]))
                ;; This will never be called, if the last step fails it does not need to be undone
                (constantly nil)]]]
    ;; Unlike postgres, mysql ddl clauses will not rollback in a transaction.
    ;; So we keep track of undo-steps to manually rollback previous, completed steps.
    (jdbc/with-db-connection [conn db-spec]
                             (loop [[[step stepfn undofn] & remaining] steps
                                    undo-steps []]
                               (let [result (try (stepfn conn)
                                                 (log/info (trs "Step {0} was successful for db {1}"
                                                                step (:name database)))
                                                 ::valid
                                                 (catch Exception e
                                                   (log/warn (trs "Error in `{0}` while checking for model persistence permissions." step))
                                                   (log/warn e)
                                                   (try
                                                     (doseq [[undo-step undofn] (reverse undo-steps)]
                                                       (log/warn (trs "Undoing step `{0}` for db {1}" undo-step (:name database)))
                                                       (undofn conn))
                                                     (catch Exception _e
                                                       (log/warn (trs "Unable to rollback database check for model persistence"))))
                                                   step))]
                                 (cond (and (= result ::valid) remaining)
                                       (recur remaining (conj undo-steps [step undofn]))

                                       (= result ::valid)
                                       [true :persist.check/valid]

                                       :else
                                       [false step]))))))
