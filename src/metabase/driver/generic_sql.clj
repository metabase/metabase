(ns metabase.driver.generic-sql
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.driver :as driver]
            (metabase.driver [interface :refer [max-sync-lazy-seq-results IDriver ISyncDriverTableFKs ISyncDriverFieldAvgLength ISyncDriverFieldPercentUrls]]
                             [sync :as driver-sync])
            (metabase.driver.generic-sql [interface :as i]
                                         [query-processor :as qp]
                                         [util :refer :all])
            [metabase.util :as u]))

(def ^:const features
  "Features supported by *all* Generic SQL drivers."
  #{:foreign-keys
    :standard-deviation-aggregations
    :unix-timestamp-special-type-fields})

(def ^:private ^:const field-values-lazy-seq-chunk-size
  "How many Field values should we fetch at a time for `field-values-lazy-seq`?"
  ;; Hopefully this is a good balance between
  ;; 1. Not doing too many DB calls
  ;; 2. Not running out of mem
  ;; 3. Not fetching too many results for things like mark-json-field! which will fail after the first result that isn't valid JSON
  500)

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

(defn- field-values-lazy-seq [_ {:keys [qualified-name-components table], :as field}]
  (assert (and (map? field)
               (delay? qualified-name-components)
               (delay? table))
    (format "Field is missing required information:\n%s" (u/pprint-to-str 'red field)))
  (let [table           @table
        name-components (rest @qualified-name-components)
        ;; This function returns a chunked lazy seq that will fetch some range of results, e.g. 0 - 500, then concat that chunk of results
        ;; with a recursive call to (lazily) fetch the next chunk of results, until we run out of results or hit the limit.
        fetch-chunk     (fn -fetch-chunk [start step limit]
                          (lazy-seq
                           (let [results (->> (k/select (korma-entity table)
                                                        (k/fields (:name field))
                                                        (k/offset start)
                                                        (k/limit (+ start step)))
                                              (map (keyword (:name field)))
                                              (map (if (contains? #{:TextField :CharField} (:base_type field)) u/jdbc-clob->str
                                                       identity)))]
                             (concat results (when (and (seq results)
                                                        (< (+ start step) limit)
                                                        (= (count results) step))
                                               (-fetch-chunk (+ start step) step limit))))))]
    (fetch-chunk 0 field-values-lazy-seq-chunk-size
                 max-sync-lazy-seq-results)))

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
  (or (let [korma-table (korma-entity @(:table field))]
        (when-let [total-non-null-count (:count (first (k/select korma-table
                                                                 (k/aggregate (count :*) :count)
                                                                 (k/where {(keyword (:name field)) [not= nil]}))))]
          (when (> total-non-null-count 0)
            (when-let [url-count (:count (first (k/select korma-table
                                                          (k/aggregate (count :*) :count)
                                                          (k/where {(keyword (:name field)) [like "http%://_%.__%"]}))))]
              (float (/ url-count total-non-null-count))))))
      0.0))

(def ^:const GenericSQLIDriverMixin
  "Generic SQL implementation of the `IDriver` protocol.

     (extend H2Driver
       IDriver
       GenericSQLIDriverMixin)"
  {:can-connect?                  can-connect?
   :can-connect-with-details?     can-connect-with-details?
   :wrap-process-query-middleware wrap-process-query-middleware
   :process-query                 process-query
   :sync-in-context               sync-in-context
   :active-table-names            active-table-names
   :active-column-names->type     active-column-names->type
   :table-pks                     table-pks
   :field-values-lazy-seq         field-values-lazy-seq})

(def ^:const GenericSQLISyncDriverTableFKsMixin
  "Generic SQL implementation of the `ISyncDriverTableFKs` protocol."
  {:table-fks table-fks})

(def ^:const GenericSQLISyncDriverFieldAvgLengthMixin
  "Generic SQL implementation of the `ISyncDriverFieldAvgLengthMixin` protocol."
  {:field-avg-length field-avg-length})

(def ^:const GenericSQLISyncDriverFieldPercentUrlsMixin
  "Generic SQL implementation of the `ISyncDriverFieldPercentUrls` protocol."
  {:field-percent-urls field-percent-urls})
