(ns metabase-enterprise.workspaces.driver.sql-jdbc
  "Default SQL JDBC implementation for workspace isolation permission checking.
   Reuses the init, grant, and destroy multimethods within a rolled-back transaction."
  (:require
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(def ^:private perm-check-workspace-id "00000000-0000-0000-0000-000000000000")

(defmethod isolation/check-isolation-permissions :sql-jdbc
  [driver database test-table]
  (let [test-workspace {:id   perm-check-workspace-id
                        :name "_mb_perm_check_"}]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database
     {:write? true}
     (fn [^Connection conn]
       ;; Disable auto-commit so we can rollback
       (.setAutoCommit conn false)
       (try
         ;; Pass {:connection conn} so the multimethods reuse this connection
         (let [conn-spec {:connection conn}]
           ;; Step 1: Test init (CREATE SCHEMA, CREATE USER, GRANT ON SCHEMA)
           (let [init-result (try
                               (isolation/init-workspace-database-isolation! driver conn-spec test-workspace)
                               (catch Exception e
                                 (throw (ex-info (format "Failed to initialize workspace isolation (CREATE SCHEMA/USER): %s"
                                                         (ex-message e))
                                                 {:step :init} e))))
                 workspace-with-details (merge test-workspace init-result)]
             ;; Step 2: Test grant (if we have a table)
             (when test-table
               (try
                 (isolation/grant-read-access-to-tables! driver conn-spec workspace-with-details [test-table])
                 (catch Exception e
                   (throw (ex-info (format "Failed to grant read access to table %s.%s: %s"
                                           (:schema test-table) (:name test-table) (ex-message e))
                                   {:step :grant :table test-table} e)))))
             ;; Step 3: Test destroy (DROP SCHEMA, DROP USER)
             (try
               (isolation/destroy-workspace-isolation! driver conn-spec workspace-with-details)
               (catch Exception e
                 (throw (ex-info (format "Failed to destroy workspace isolation (DROP SCHEMA/USER): %s"
                                         (ex-message e))
                                 {:step :destroy} e))))))
         ;; All succeeded
         nil
         (catch Exception e
           (ex-message e))
         (finally
           ;; Always rollback - nothing is persisted
           (.rollback conn)))))))
