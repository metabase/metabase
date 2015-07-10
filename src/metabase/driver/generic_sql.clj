(ns metabase.driver.generic-sql
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.driver :as driver]
            (metabase.driver [interface :refer :all]
                             [sync :as driver-sync])
            (metabase.driver.generic-sql [query-processor :as qp]
                                         [util :refer :all])
            [metabase.util :as u]))

(def ^:private ^:const sql-driver-features
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

(defrecord SqlDriver [ ;; A set of additional features supported by a specific driver implmentation, e.g. :set-timezone for :postgres
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
      (= 1 (-> (k/exec-raw connection "SELECT 1" :results)
               first
               vals
               first))))

  ;; Query Processing
  (wrap-process-query-middleware [_ qp]
    (fn [query]
      (qp query)))                      ; Nothing to do here

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

  (field-values-lazy-seq [_ {:keys [qualified-name-components table], :as field}]
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
      (fetch-chunk 0 field-values-lazy-seq-chunk-size max-sync-lazy-seq-results)))

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
                (k/select (k/aggregate (avg (k/sqlfn* sql-string-length-fn
                                                      (k/raw (format "CAST(\"%s\" AS TEXT)" (name (:name field))))))
                                       :len))
                first
                :len
                int)
        0))

  ISyncDriverFieldPercentUrls
  (field-percent-urls [_ field]
    (let [korma-table (korma-entity @(:table field))
          total-non-null-count (-> (k/select korma-table
                                             (k/aggregate (count :*) :count)
                                             (k/where {(keyword (:name field)) [not= nil]})) first :count)]
      (if (= total-non-null-count 0) 0.0
          (let [url-count (or (-> (k/select korma-table
                                            (k/aggregate (count :*) :count)
                                            (k/where {(keyword (:name field)) [like "http%://_%.__%"]})) first :count)
                              0)]
            (float (/ url-count total-non-null-count)))))))
