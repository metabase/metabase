(ns metabase.driver.generic-sql
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [korma.core :as k]
            [korma.sql.utils :as utils]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql.util :refer :all]
            [metabase.models.field :as field]
            [metabase.util :as u])
  (:import java.util.Map
           clojure.lang.Keyword))

(defprotocol ISQLDriver
  "Methods SQL-based drivers should implement in order to use `IDriverSQLDefaultsMixin`.
   Methods marked *OPTIONAL* have default implementations in `ISQLDriverDefaultsMixin`."
  ;; The following apply-* methods define how the SQL Query Processor handles given query clauses. Each method is called when a matching clause is present
  ;; in QUERY, and should return an appropriately modified version of KORMA-QUERY. Most drivers can use the default implementations for all of these methods,
  ;; but some may need to override one or more (e.g. SQL Server needs to override the behavior of `apply-limit`, since T-SQL uses `TOP` instead of `LIMIT`).
  (apply-aggregation [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-breakout    [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-fields      [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-filter      [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-join-tables [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-limit       [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-order-by    [this korma-query, ^Map query] "*OPTIONAL*.")
  (apply-page        [this korma-query, ^Map query] "*OPTIONAL*.")

  (column->base-type ^clojure.lang.Keyword [this, ^Keyword column-type]
    "Given a native DB column type, return the corresponding `Field` `base-type`.")

  (connection-details->spec [this, ^Map details-map]
    "Given a `Database` DETAILS-MAP, return a JDBC connection spec.")

  (current-datetime-fn [this]
    "*OPTIONAL*. Korma form that should be used to get the current `DATETIME` (or equivalent). Defaults to `(k/sqlfn* :NOW)`.")

  (date [this, ^Keyword unit, field-or-value]
    "Return a korma form for truncating a date or timestamp field or value to a given resolution, or extracting a date component.")

  (excluded-schemas ^java.util.Set [this]
                    "*OPTIONAL*. Set of string names of schemas to skip syncing tables from.")

  (set-timezone-sql ^String [this]
    "*OPTIONAL*. This should be a prepared JDBC SQL statement string to be used to set the timezone for the current transaction.

       \"SET @@session.timezone = ?;\"")

  (stddev-fn ^clojure.lang.Keyword [this]
    "*OPTIONAL*. Keyword name of the SQL function that should be used to get the length of a string. Defaults to `:STDDEV`.")

  (string-length-fn ^clojure.lang.Keyword [this]
    "Keyword name of the SQL function that should be used to get the length of a string, e.g. `:LENGTH`.")

  (unix-timestamp->timestamp [this, ^Keyword seconds-or-milliseconds, field-or-value]
    "Return a korma form appropriate for converting a Unix timestamp integer field or value to an proper SQL `Timestamp`.
     SECONDS-OR-MILLISECONDS refers to the resolution of the int in question and with be either `:seconds` or `:milliseconds`."))


(defn ISQLDriverDefaultsMixin
  "Default implementations for methods in `ISQLDriver`."
  []
  (require 'metabase.driver.generic-sql.query-processor)
  {:apply-aggregation   (resolve 'metabase.driver.generic-sql.query-processor/apply-aggregation) ; don't resolve the vars yet so during interactive dev if the
   :apply-breakout      (resolve 'metabase.driver.generic-sql.query-processor/apply-breakout)    ; underlying impl changes we won't have to reload all the drivers
   :apply-fields        (resolve 'metabase.driver.generic-sql.query-processor/apply-fields)
   :apply-filter        (resolve 'metabase.driver.generic-sql.query-processor/apply-filter)
   :apply-join-tables   (resolve 'metabase.driver.generic-sql.query-processor/apply-join-tables)
   :apply-limit         (resolve 'metabase.driver.generic-sql.query-processor/apply-limit)
   :apply-order-by      (resolve 'metabase.driver.generic-sql.query-processor/apply-order-by)
   :apply-page          (resolve 'metabase.driver.generic-sql.query-processor/apply-page)
   :current-datetime-fn (constantly (k/sqlfn* :NOW))
   :excluded-schemas    (constantly nil)
   :stddev-fn           (constantly :STDDEV)})


(defn- can-connect? [driver details]
  (let [connection (connection-details->spec driver details)]
    (= 1 (-> (k/exec-raw connection "SELECT 1" :results)
             first
             vals
             first))))

(defn- sync-in-context [_ database do-sync-fn]
  (with-jdbc-metadata [_ database]
    (do-sync-fn)))

(defn- active-tables [driver database]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md database]
    (set (for [table (filter #(not (contains? (excluded-schemas driver) (:table_schem %)))
                             (jdbc/result-set-seq (.getTables md nil nil nil (into-array String ["TABLE", "VIEW"]))))]
           {:name   (:table_name table)
            :schema (:table_schem table)}))))

(defn- active-column-names->type [driver table]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
    (into {} (for [{:keys [column_name type_name]} (jdbc/result-set-seq (.getColumns md nil (:schema table) (:name table) nil))]
               {column_name (or (column->base-type driver (keyword type_name))
                                (do (log/warn (format "Don't know how to map column type '%s' to a Field base_type, falling back to :UnknownField." type_name))
                                    :UnknownField))}))))

(defn- table-pks [_ table]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
    (->> (.getPrimaryKeys md nil nil (:name table))
         jdbc/result-set-seq
         (map :column_name)
         set)))

(def ^:private ^:const field-values-lazy-seq-chunk-size
  "How many Field values should we fetch at a time for `field-values-lazy-seq`?"
  ;; Hopefully this is a good balance between
  ;; 1. Not doing too many DB calls
  ;; 2. Not running out of mem
  ;; 3. Not fetching too many results for things like mark-json-field! which will fail after the first result that isn't valid JSON
  500)

(defn- field-values-lazy-seq [driver {:keys [qualified-name-components table], :as field}]
  (assert (and (map? field)
               (delay? qualified-name-components)
               (delay? table))
    (format "Field is missing required information:\n%s" (u/pprint-to-str 'red field)))
  (let [table           @table
        name-components (rest @qualified-name-components)
        transform-fn    (if (contains? #{:TextField :CharField} (:base_type field))
                          u/jdbc-clob->str
                          identity)

        fetch-one-page  (fn [page-num]
                          (let [query (as-> (k/select* (korma-entity table)) <>
                                        (k/fields <> (:name field))
                                        (apply-page driver <> {:page {:items field-values-lazy-seq-chunk-size, :page page-num}}))]
                            (->> (k/exec query)
                                 (map (keyword (:name field)))
                                 (map transform-fn))))

        ;; This function returns a chunked lazy seq that will fetch some range of results, e.g. 0 - 500, then concat that chunk of results
        ;; with a recursive call to (lazily) fetch the next chunk of results, until we run out of results or hit the limit.
        fetch-page      (fn -fetch-page [page-num]
                          (lazy-seq
                           (let [results             (fetch-one-page page-num)
                                 total-items-fetched (* (inc page-num) field-values-lazy-seq-chunk-size)]
                             (concat results (when (and (seq results)
                                                        (< total-items-fetched driver/max-sync-lazy-seq-results)
                                                        (= (count results) field-values-lazy-seq-chunk-size))
                                               (-fetch-page (inc page-num)))))))]
    (fetch-page 0)))

(defn- table-rows-seq [_ database table-name]
  (k/select (-> (k/create-entity table-name)
                (k/database (db->korma-db database)))))


(defn- table-fks [_ table]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
    (->> (.getImportedKeys md nil nil (:name table))
         jdbc/result-set-seq
         (map (fn [result]
                {:fk-column-name   (:fkcolumn_name result)
                 :dest-table-name  (:pktable_name result)
                 :dest-column-name (:pkcolumn_name result)}))
         set)))

(defn- field-avg-length [driver field]
  (or (some-> (korma-entity @(:table field))
              (k/select (k/aggregate (avg (k/sqlfn* (string-length-fn driver)
                                                    (utils/func "CAST(%s AS CHAR)"
                                                                [(keyword (:name field))])))
                                     :len))
              first
              :len
              int)
      0))

(defn- field-percent-urls [_ field]
  (or (let [korma-table (korma-entity @(:table field))]
        (when-let [total-non-null-count (:count (first (k/select korma-table
                                                                 (k/aggregate (count (k/raw "*")) :count)
                                                                 (k/where {(keyword (:name field)) [not= nil]}))))]
          (when (> total-non-null-count 0)
            (when-let [url-count (:count (first (k/select korma-table
                                                          (k/aggregate (count (k/raw "*")) :count)
                                                          (k/where {(keyword (:name field)) [like "http%://_%.__%"]}))))]
              (float (/ url-count total-non-null-count))))))
      0.0))

(defn features [driver]
  (set (cond-> [:foreign-keys
                :standard-deviation-aggregations]
         (:set-timezone-sql driver) (conj :set-timezone))))

(defn IDriverSQLDefaultsMixin
  "Default implementations of methods in `IDriver` for SQL drivers."
  []
  (require 'metabase.driver.generic-sql.native
           'metabase.driver.generic-sql.query-processor)
  (merge driver/IDriverDefaultsMixin
         {:active-column-names->type active-column-names->type
          :active-tables             active-tables
          :can-connect?              can-connect?
          :features                  features
          :field-avg-length          field-avg-length
          :field-percent-urls        field-percent-urls
          :field-values-lazy-seq     field-values-lazy-seq
          :process-native            (resolve 'metabase.driver.generic-sql.native/process-and-run)
          :process-structured        (resolve 'metabase.driver.generic-sql.query-processor/process-structured)
          :sync-in-context           sync-in-context
          :table-fks                 table-fks
          :table-pks                 table-pks
          :table-rows-seq            table-rows-seq}))
