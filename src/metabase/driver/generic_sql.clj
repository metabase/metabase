(ns metabase.driver.generic-sql
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.driver :as driver]
            (metabase.driver [interface :refer :all]
                             [sync :as driver-sync])
            (metabase.driver.generic-sql [connection :as connection]
                                         [query-processor :as qp]
                                         [util :refer :all])))

(defrecord SqlDriver [column->base-type
                     connection-details->connection-spec
                     database->connection-details
                     sql-string-length-fn]
  IDriver
  ;; Connection
  (can-connect? [_ database]
    (try (connection/test-connection (-> database
                                         database->connection-details
                                         connection-details->connection-spec))
         (catch Throwable e
           (log/error "Failed to connect to database:" (.getMessage e))
           false)))

  (can-connect-with-details? [_ details]
    (connection/test-connection (connection-details->connection-spec details)))

  ;; Query Processing
  (process-query [_ query]
    (qp/process-and-run query))

  ;; Syncing
  (sync-in-context [_ database do-sync-fn]
      (with-jdbc-metadata [_ database]
        (do-sync-fn)))

  (active-table-names [_ database]
    (with-jdbc-metadata [^java.sql.DatabaseMetaData md database]
      (->> (.getTables md nil nil nil (into-array String ["TABLE"]))
           jdbc/result-set-seq
           (map :table_name)
           set)))

  (active-column-names->type [_ table]
    (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
      (->> (.getColumns md nil nil (:name table) nil)
           jdbc/result-set-seq
           (filter #(not= (:table_schem %) "INFORMATION_SCHEMA")) ; filter out internal tables
           (map (fn [{:keys [column_name type_name]}]
                  {column_name (column->base-type (or (keyword type_name)
                                                      :UnknownField))}))
           (into {}))))

  (table-pks [_ table]
    (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
      (->> (.getPrimaryKeys md nil nil (:name table))
           jdbc/result-set-seq
           (map :column_name)
           set)))

  ISyncDriverTableFKs
  (table-fks [_ table]
    (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
      (->> (.getImportedKeys md nil nil (:name table))
           jdbc/result-set-seq
           (map (fn [result]
                  {:fk-column-name   (:fkcolumn_name result)
                   :dest-table-name  (:pktable_name result)
                   :dest-column-name (:pkcolumn_name result)}))
           set)))

  ISyncDriverFieldAvgLength
  (field-avg-length [_ field]
    (or (some-> (korma-entity @(:table field))
                (select (aggregate (avg (sqlfn* sql-string-length-fn
                                                (raw (format "CAST(\"%s\" AS TEXT)" (name (:name field))))))
                                   :len))
                first
                :len
                int)
        0))

  ISyncDriverFieldPercentUrls
  (field-percent-urls [_ field]
    (let [korma-table (korma-entity @(:table field))
          total-non-null-count (-> (select korma-table
                                           (aggregate (count :*) :count)
                                           (where {(keyword (:name field)) [not= nil]})) first :count)]
      (if (= total-non-null-count 0) 0
          (let [url-count (-> (select korma-table
                                      (aggregate (count :*) :count)
                                      (where {(keyword (:name field)) [like "http%://_%.__%"]})) first :count)]
            (float (/ url-count total-non-null-count)))))))
