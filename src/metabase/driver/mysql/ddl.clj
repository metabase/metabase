(ns metabase.driver.mysql.ddl
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.ddl :as sql.ddl]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log])
  (:import
   (java.sql SQLNonTransientConnectionException)))

(set! *warn-on-reflection* true)

(defn- exec-async [driver conn-chan db-spec sql+params]
  (a/thread
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     db-spec
     {:write? true}
     (fn [^java.sql.Connection conn]
       (try
         (let [pid (:pid (first (sql.ddl/jdbc-query conn ["select connection_id() pid"])))]
           (a/put! conn-chan pid)
           (sql.ddl/jdbc-query conn sql+params))
         (catch SQLNonTransientConnectionException _e
           ;; Our connection may be killed due to timeout, [[kill!]] will throw an appropriate exception
           nil)
         (catch Exception e
           (log/warn e)
           e))))))

(defn- kill! [conn pid]
  (let [results (sql.ddl/jdbc-query conn ["show processlist"])
        result? (some (fn [r]
                        (and (= (:id r) pid)
                             (str/starts-with? (or (:info r) "") "-- Metabase")))
                      results)]
    (when result?
      ;; Can't use a prepared parameter with these statements
      (sql.ddl/execute! conn [(str "kill " pid)])
      (throw (Exception. (trs "Killed MySQL process id {0} due to timeout." pid))))))

(defn- execute-with-timeout!
  "Spins up another channel to execute the statement.
   If `timeout-ms` passes, send a kill statement to stop execution and throw exception
   Otherwise return results returned by channel."
  [driver conn db-spec timeout-ms sql+params]
  (let [conn-chan    (a/promise-chan)
        exec-chan    (exec-async driver conn-chan db-spec sql+params)
        pid          (a/<!! conn-chan)
        _            (a/close! conn-chan)
        timeout-chan (a/timeout timeout-ms)
        [v port]     (a/alts!! [timeout-chan exec-chan])]
    (a/close! exec-chan)
    (cond
      (= port timeout-chan) (kill! conn pid)
      (= port exec-chan)    (if (instance? Exception v)
                              (throw v)
                              v))))

(defmethod ddl.i/refresh! :mysql
  [driver database definition dataset-query]
  (let [{:keys [query params]} (qp.compile/compile dataset-query)
        db-spec (sql-jdbc.conn/db->pooled-connection-spec database)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database
     {:write? true}
     (fn [conn]
       (sql.ddl/execute! conn [(sql.ddl/drop-table-sql database (:table-name definition))])
       ;; It is possible that this fails and rollback would not restore the table.
       ;; That is ok, the persisted-info will be marked inactive and the next refresh will try again.
       (execute-with-timeout! driver
                              conn
                              db-spec
                              (.toMillis (t/minutes 10))
                              (into [(sql.ddl/create-table-sql database definition query)] params))
       {:state :success}))))

(defmethod ddl.i/unpersist! :mysql
  [driver database persisted-info]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   {:write? true}
   (fn [^java.sql.Connection conn]
     (try
       (sql.ddl/execute! conn [(sql.ddl/drop-table-sql database (:table_name persisted-info))])
       (catch Exception e
         (log/warn e)
         (throw e))))))

(defmethod ddl.i/check-can-persist :mysql
  [{driver :engine, :as database}]
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
                  (execute-with-timeout! driver
                                         conn
                                         db-spec
                                         (.toMillis (t/minutes 10))
                                         [(sql.ddl/create-table-sql
                                           database
                                           {:table-name table-name
                                            :field-definitions [{:field-name "field"
                                                                 :base-type :type/Text}]}
                                           "select 1")]))
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
                (constantly nil)]
               [:persist.check/create-kv-table
                (fn create-kv-table [conn]
                  (sql.ddl/execute! conn [(format "drop table if exists %s.cache_info"
                                                  schema-name)])
                  (sql.ddl/execute! conn (sql/format
                                          (ddl.i/create-kv-table-honey-sql-form schema-name)
                                          {:dialect :mysql})))]
               [:persist.check/populate-kv-table
                (fn create-kv-table [conn]
                  (sql.ddl/execute! conn (sql/format
                                          (ddl.i/populate-kv-table-honey-sql-form
                                           schema-name)
                                          {:dialect :mysql})))]]]
    ;; Unlike postgres, mysql ddl clauses will not rollback in a transaction.
    ;; So we keep track of undo-steps to manually rollback previous, completed steps.
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     db-spec
     {:write? true}
     (fn [conn]
       (loop [[[step stepfn undofn] & remaining] steps
              undo-steps []]
         (let [result (try (stepfn conn)
                           (log/infof "Step %s was successful for db %s" step (:name database))
                           ::valid
                           (catch Exception e
                             (log/warnf e "Error in `%s` while checking for model persistence permissions." step)
                             (try
                               (doseq [[undo-step undofn] (reverse undo-steps)]
                                 (log/warnf "Undoing step `%s` for db %s" undo-step (:name database))
                                 (undofn conn))
                               (catch Exception _e
                                 (log/warn "Unable to rollback database check for model persistence")))
                             step))]
           (cond (and (= result ::valid) remaining)
                 (recur remaining (conj undo-steps [step undofn]))

                 (= result ::valid)
                 [true :persist.check/valid]

                 :else
                 [false step])))))))
