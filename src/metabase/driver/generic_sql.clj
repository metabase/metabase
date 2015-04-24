(ns metabase.driver.generic-sql
  (:require [clojure.tools.logging :as log]
            [metabase.driver :as driver]
            [metabase.driver.sync :as driver-sync]
            (metabase.driver.generic-sql [connection :as connection]
                                         [sync :as sync]
                                         [query-processor :as qp]
                                         [util :refer :all])))

(defmacro deftype+
  "Same as `deftype` but define an extra constructor fn that takes params as kwargs."
  [name fields convenience-fn-name & body]
  `(do (deftype ~name ~fields
         ~@body)
       (defn ~convenience-fn-name [& {:keys ~fields}]
         (new ~name ~@fields))))

(deftype+ SqlDriver [column->base-type
                     connection-details->korma-connection
                     database->connection-details
                     sql-string-length-fn]
  make-sql-driver

  driver/IDriver
  ;; Connection
  (can-connect? [_ database]
    (try (connection/test-connection (-> database
                                         database->connection-details
                                         connection-details->korma-connection))
         (catch Throwable e
           (log/error "Failed to connect to database:" (.getMessage e))
           false)))

  (can-connect-with-details? [_ details]
    (connection/test-connection (connection-details->korma-connection details)))

  ;; Syncing
  (sync-database! [_ database]
    (with-jdbc-metadata [md database]
      (driver-sync/sync-database! (sync/->GenericSqlSyncDriverDatasource column->base-type sql-string-length-fn md) database)))

  (sync-table! [_ table]
    (let [database @(:db table)]
      (with-jdbc-metadata [md database]
        (driver-sync/sync-table! (sync/->GenericSqlSyncDriverDatasource column->base-type sql-string-length-fn md) table))))

  ;; Query Processing
  (process-query [_ query]
    (qp/process-and-run query)))
