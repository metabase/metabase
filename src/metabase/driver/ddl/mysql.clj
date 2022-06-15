(ns metabase.driver.ddl.mysql
  (:require [clojure.core.async :as a]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.driver.ddl.sql :as ddl.sql]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor :as qp]
            [metabase.util.i18n :refer [trs]])
  (:import java.sql.SQLNonTransientConnectionException))

(defn- exec-wrap [db conn-chan sql+params]
  (a/go
    (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec db)]
      (try
        (let [pid (:pid (first (ddl.sql/jdbc-query conn ["select connection_id() pid"])))]
          (a/>! conn-chan pid)
          (ddl.sql/jdbc-query conn sql+params))
        (catch SQLNonTransientConnectionException _e
          nil)
        (catch Exception e
          (log/warn e)
          (throw e))))))

(defn- kill [conn pid]
  (try
    (let [results (ddl.sql/jdbc-query conn ["show processlist"])
          result? (some (fn [r]
                          (and (= (:id r) pid)
                               (str/starts-with? (or (:info r) "") "-- Metabase")))
                        results)]
      (when result?
        ;; Can't use a prepared parameter with these statements
        (ddl.sql/execute! conn [(str "kill " pid)])
        (throw (Exception. (trs "Killed mysql process id {0} due to timeout." pid)))))
    (catch Exception e
      (log/warn e)
      (throw e))))

(defn- execute-with-timeout! [db sql+params]
  (jdbc/with-db-connection
      [conn (sql-jdbc.conn/db->pooled-connection-spec db)]
      (let [conn-chan (a/chan)
            exec-chan (exec-wrap db conn-chan sql+params)
            pid (a/<!! conn-chan)
            ten-minutes (.toMillis (t/minutes 10))
            t-chan (a/timeout ten-minutes)
            [v port] (a/alts!! [t-chan exec-chan])]
        (cond
          (= port t-chan) (kill conn pid)

          (= port exec-chan) v))))

(defmethod ddl.i/refresh! :mysql [_driver database definition dataset-query]
  (try
    (let [{:keys [query params]} (qp/compile dataset-query)]
      (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
        (ddl.sql/execute! conn [(ddl.sql/drop-table-sql database (:table-name definition))])
        (execute-with-timeout! conn (into [(ddl.sql/create-table-sql database definition query)] params))))
    (catch Exception e
      ;; If drop table fails we can leave it, it will resolve itself on the next refresh
      {:state :error :error (ex-message e)})))

(defmethod ddl.i/unpersist! :mysql
  [_driver database persisted-info]
  (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
    (try
      (ddl.sql/execute! conn [(ddl.sql/drop-table-sql database (:table_name persisted-info))])
      (catch Exception e
        (log/warn e)
        (throw e)))))

(defmethod ddl.i/check-can-persist :mysql
  [database]
  (let [schema-name (ddl.i/schema-name database (public-settings/site-uuid))
        table-name (format "persistence_check_%s" (rand-int 10000))
        steps [[:persist.check/create-schema
                (fn check-schema [conn]
                  (let [existing-schemas (->> ["select schema_name from information_schema.schemata"]
                                              (ddl.sql/jdbc-query conn)
                                              (map :schema_name)
                                              (into #{}))]
                    (or (contains? existing-schemas schema-name)
                      (ddl.sql/execute! conn [(ddl.sql/create-schema-sql database)]))))
                (fn undo-check-schema [conn]
                  (ddl.sql/execute! conn [(ddl.sql/drop-schema-sql database)]))]
               [:persist.check/create-table
                (fn create-table [conn]
                  (execute-with-timeout! conn [(ddl.sql/create-table-sql
                                                 database
                                                 {:table-name table-name
                                                  :field-definitions [{:field-name "field"
                                                                       :base-type :type/Text}]}
                                                 "values (1)")]))
                (fn undo-create-table [conn]
                  (ddl.sql/execute! conn [(ddl.sql/drop-table-sql database table-name)]))]
               [:persist.check/read-table
                (fn read-table [conn]
                  (ddl.sql/jdbc-query conn [(format "select * from %s.%s"
                                                    schema-name table-name)]))
                (constantly nil)]
               [:persist.check/delete-table
                (fn delete-table [conn]
                  (ddl.sql/execute! conn [(ddl.sql/drop-table-sql database table-name)]))
                (constantly nil)]]]
    ;; Unlike postgres, mysql ddl clauses will not rollback in a transaction.
    ;; So we keep track of undo-steps to manually rollback previous, completed steps.
    (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
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

