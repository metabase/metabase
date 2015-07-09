(ns metabase.driver.generic-sql
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.driver :as driver]
            (metabase.driver [interface :refer :all]
                             [sync :as driver-sync])
            (metabase.driver.generic-sql [query-processor :as qp]
                                         [util :refer :all])))

(def ^:private ^:const sql-driver-features
  "Features supported by *all* Generic SQL drivers."
  #{:foreign-keys
    :standard-deviation-aggregations
    :unix-timestamp-special-type-fields})

(defrecord SqlDriver [;; A set of additional features supported by a specific driver implmentation, e.g. :set-timezone for :postgres
                      additional-supported-features
                      column->base-type
                      connection-details->connection-spec
                      database->connection-details
                      sql-string-length-fn
                      timezone->set-timezone-sql
                      ;; These functions take a string name of a Table and a string name of a Field and return the raw SQL to select it as a DATE
                      cast-timestamp-seconds-field-to-date-fn
                      cast-timestamp-milliseconds-field-to-date-fn
                      ;; This should be a regex that will match the column returned by the driver when unix timestamp -> date casting occured
                      ;; e.g. #"CAST\(TIMESTAMPADD\('(?:MILLI)?SECOND', ([^\s]+), DATE '1970-01-01'\) AS DATE\)" for H2
                      uncastify-timestamp-regex]
  IDriver
  ;; Features
  (supports? [_ feature]
    (or (contains? sql-driver-features feature)
        (contains? additional-supported-features feature)))

  ;; Connection
  (can-connect? [this database]
    (can-connect-with-details? this (database->connection-details database)))

  (can-connect-with-details? [_ details]
    (let [connection (connection-details->connection-spec details)]
      (= 1 (-> (exec-raw connection "SELECT 1" :results)
               first
               vals
               first))))

  ;; Query Processing
  (wrap-process-query-middleware [_ qp]
    (fn [query]
      (qp query))) ; Nothing to do here

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
                  {column_name (or (column->base-type (keyword type_name))
                                   :UnknownField)}))
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
      (if (= total-non-null-count 0) 0.0
          (let [url-count (or (-> (select korma-table
                                          (aggregate (count :*) :count)
                                          (where {(keyword (:name field)) [like "http%://_%.__%"]})) first :count)
                              0)]
            (float (/ url-count total-non-null-count)))))))
