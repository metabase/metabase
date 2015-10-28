(ns metabase.driver.generic-sql
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [korma.core :as k]
            [korma.sql.utils :as utils]
            [metabase.driver :as driver]
            (metabase.driver [interface :refer [max-sync-lazy-seq-results defdriver]]
                             [sync :as driver-sync])
            (metabase.driver.generic-sql [query-processor :as qp]
                                         [util :refer :all])
            [metabase.models.field :as field]
            [metabase.util :as u]))

(def ^:private ^:const field-values-lazy-seq-chunk-size
  "How many Field values should we fetch at a time for `field-values-lazy-seq`?"
  ;; Hopefully this is a good balance between
  ;; 1. Not doing too many DB calls
  ;; 2. Not running out of mem
  ;; 3. Not fetching too many results for things like mark-json-field! which will fail after the first result that isn't valid JSON
  500)

(defn- can-connect? [connection-details->spec details]
  (let [connection (connection-details->spec details)]
    (= 1 (-> (k/exec-raw connection "SELECT 1" :results)
             first
             vals
             first))))

(defn- process-query [query]
  (qp/process-and-run query))

(defn- sync-in-context [database do-sync-fn]
  (with-jdbc-metadata [_ database]
    (do-sync-fn)))

(defn- active-table-names [database]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md database]
    (->> (.getTables md nil nil nil (into-array String ["TABLE", "VIEW"]))
         jdbc/result-set-seq
         (map :table_name)
         set)))

(defn- active-column-names->type [column->base-type table]
  {:pre [(map? column->base-type)]}
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
    (->> (.getColumns md nil nil (:name table) nil)
         jdbc/result-set-seq
         (filter #(not= (:table_schem %) "INFORMATION_SCHEMA")) ; filter out internal tables
         (map (fn [{:keys [column_name type_name]}]
                {column_name (or (column->base-type (keyword type_name))
                                 :UnknownField)}))
         (into {}))))

(defn- table-pks [table]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
    (->> (.getPrimaryKeys md nil nil (:name table))
         jdbc/result-set-seq
         (map :column_name)
         set)))

(defn- field-values-lazy-seq [{:keys [qualified-name-components table], :as field}]
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

(defn- table-rows-seq [database table-name]
  (k/select (-> (k/create-entity table-name)
                (k/database (db->korma-db database)))))


(defn- table-fks [table]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db table)]
    (->> (.getImportedKeys md nil nil (:name table))
         jdbc/result-set-seq
         (map (fn [result]
                {:fk-column-name   (:fkcolumn_name result)
                 :dest-table-name  (:pktable_name result)
                 :dest-column-name (:pkcolumn_name result)}))
         set)))

(defn- field-avg-length [sql-string-length-fn field]
  (or (some-> (korma-entity @(:table field))
              (k/select (k/aggregate (avg (k/sqlfn* sql-string-length-fn
                                                    (utils/func "CAST(%s AS CHAR)"
                                                                [(keyword (:name field))])))
                                     :len))
              first
              :len
              int)
      0))

(defn- field-percent-urls [field]
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

(def ^:private ^:const required-fns
  "Functions that concrete SQL drivers must define."
  #{:connection-details->spec
    :unix-timestamp->timestamp
    :date
    :date-interval})

(defn- verify-sql-driver [{:keys [column->base-type sql-string-length-fn], :as driver}]
  ;; Check the :column->base-type map
  (assert column->base-type
    "SQL drivers must define :column->base-type.")
  (assert (map? column->base-type)
    ":column->base-type should be a map")
  (doseq [[k v] column->base-type]
    (assert (keyword? k)
      (format "Not a keyword: %s" k))
    (assert (contains? field/base-types v)
      (format "Invalid field base-type: %s" v)))

  ;; Check :sql-string-length-fn
  (assert sql-string-length-fn
    "SQL drivers must define :sql-string-length-fn.")
  (assert (keyword? sql-string-length-fn)
    ":sql-string-length-fn must be a keyword.")

  ;; Check required fns
  (doseq [f required-fns]
    (assert (f driver)
      (format "SQL drivers must define %s." f))
    (assert (fn? (f driver))
      (format "%s must be a fn." f))))

(defn sql-driver
  "Create a Metabase DB driver using the Generic SQL functions.

   A SQL driver must define the following properties / functions:

   *  `column->base-type`

      A map of native DB column types (as keywords) to the `Field` `base-types` they map to.

   *  `sql-string-length-fn`

      Keyword name of the SQL function that should be used to get the length of a string, e.g. `:LENGTH`.

   *  `(connection-details->spec [details-map])`

      Given a `Database` DETAILS-MAP, return a JDBC connection spec.

   *  `(unix-timestamp->timestamp [seconds-or-milliseconds field-or-value])`

      Return a korma form appropriate for converting a Unix timestamp integer field or value to an proper SQL `Timestamp`.
      SECONDS-OR-MILLISECONDS refers to the resolution of the int in question and with be either `:seconds` or `:milliseconds`.

   *  `(timezone->set-timezone-sql [timezone])`

      Return a string that represents the SQL statement that should be used to set the timezone
      for the current transaction.

   *  `(date [this ^Keyword unit field-or-value])`

      Return a korma form for truncating a date or timestamp field or value to a given resolution, or extracting a
      date component.

   *  `(date-interval [unit amount])`

      Return a korma form for a date relative to NOW(), e.g. on that would produce SQL like `(NOW() + INTERVAL '1 month')`."
  [driver]
  ;; Verify the driver
  (verify-sql-driver driver)
  (merge
   {:features                      #{:foreign-keys
                                     :standard-deviation-aggregations
                                     :unix-timestamp-special-type-fields}
    :can-connect?                  (partial can-connect? (:connection-details->spec driver))
    :process-query                 process-query
    :sync-in-context               sync-in-context
    :active-table-names            active-table-names
    :active-column-names->type     (partial active-column-names->type (:column->base-type driver))
    :table-pks                     table-pks
    :field-values-lazy-seq         field-values-lazy-seq
    :table-rows-seq                table-rows-seq
    :table-fks                     table-fks
    :field-avg-length              (partial field-avg-length (:sql-string-length-fn driver))
    :field-percent-urls            field-percent-urls}
   driver))
