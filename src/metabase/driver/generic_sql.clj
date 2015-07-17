(ns metabase.driver.generic-sql
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.driver :as driver]
            (metabase.driver [interface :refer [IDriver ISyncDriverTableFKs ISyncDriverFieldAvgLength ISyncDriverFieldPercentUrls]]
                             [sync :as driver-sync])
            (metabase.driver.generic-sql [interface :as i]
                                         [query-processor :as qp]
                                         [util :refer :all])))

(def ^:const features
  "Features supported by *all* Generic SQL drivers."
  #{:foreign-keys
    :standard-deviation-aggregations
    :unix-timestamp-special-type-fields})

(defn- can-connect-with-details? [driver details]
  (let [connection (i/connection-details->connection-spec driver details)]
    (= 1 (-> (k/exec-raw connection "SELECT 1" :results)
             first
             vals
             first))))

(defn- can-connect? [driver database]
  (can-connect-with-details? driver (i/database->connection-details driver database)))

(defn- wrap-process-query-middleware [_ qp]
  (fn [query]
    (qp query)))

(defn- process-query [_ query]
  (qp/process-and-run query))

(defn- sync-in-context [_ database do-sync-fn]
  (with-jdbc-metadata [_ database]
    (do-sync-fn)))

(defn- active-table-names [_ database]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md database]
    (->> (.getTables md nil nil nil (into-array String ["TABLE"]))
         jdbc/result-set-seq
         (map :table_name)
         set)))

(defn- active-column-names->type [{:keys [column->base-type]} table]
  {:pre [(map? column->base-type)]}
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
    (->> (.getColumns md nil nil (:name table) nil)
         jdbc/result-set-seq
         (filter #(not= (:table_schem %) "INFORMATION_SCHEMA")) ; filter out internal tables
         (map (fn [{:keys [column_name type_name]}]
                {column_name (or (column->base-type (keyword type_name))
                                 :UnknownField)}))
         (into {}))))

(defn- table-pks [_ table]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
    (->> (.getPrimaryKeys md nil nil (:name table))
         jdbc/result-set-seq
         (map :column_name)
         set)))

(defn- table-fks [_ table]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
    (->> (.getImportedKeys md nil nil (:name table))
         jdbc/result-set-seq
         (map (fn [result]
                {:fk-column-name   (:fkcolumn_name result)
                 :dest-table-name  (:pktable_name result)
                 :dest-column-name (:pkcolumn_name result)}))
         set)))

(defn- field-avg-length [{:keys [sql-string-length-fn]} field]
  {:pre [(keyword? sql-string-length-fn)]}
  (or (some-> (korma-entity @(:table field))
              (k/select (k/aggregate (avg (k/sqlfn* sql-string-length-fn
                                                    (k/raw (format "CAST(\"%s\" AS TEXT)" (name (:name field))))))
                                     :len))
              first
              :len
              int)
      0))

(defn- field-percent-urls [_ field]
  (let [korma-table          (korma-entity @(:table field))
        total-non-null-count (-> (k/select korma-table
                                           (k/aggregate (count :*) :count)
                                           (k/where {(keyword (:name field)) [not= nil]})) first :count)]
    (if (= total-non-null-count 0) 0.0
        (let [url-count (or (-> (k/select korma-table
                                          (k/aggregate (count :*) :count)
                                          (k/where {(keyword (:name field)) [like "http%://_%.__%"]})) first :count)
                            0)]
          (float (/ url-count total-non-null-count))))))

(defn extend-add-generic-sql-mixins [driver-type]
  (extend driver-type
    IDriver
    {:can-connect?                  can-connect?
     :can-connect-with-details?     can-connect-with-details?
     :wrap-process-query-middleware wrap-process-query-middleware
     :process-query                 process-query
     :sync-in-context               sync-in-context
     :active-table-names            active-table-names
     :active-column-names->type     active-column-names->type
     :table-pks table-pks}
    ISyncDriverTableFKs
    {:table-fks table-fks}
    ISyncDriverFieldAvgLength
    {:field-avg-length field-avg-length}
    ISyncDriverFieldPercentUrls
    {:field-percent-urls field-percent-urls}))
