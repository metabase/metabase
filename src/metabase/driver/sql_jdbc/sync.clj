(ns metabase.driver.sql-jdbc.sync
  "Implementations for sync-related driver multimethods for SQL JDBC drivers, using JDBC DatabaseMetaData."
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util.honeysql-extensions :as hx])
  (:import (java.sql Connection DatabaseMetaData ResultSetMetaData)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Interface (Multimethods)                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti active-tables
  "Return a set of maps containing information about the active tables/views, collections, or equivalent that currently
  exist in a database. Each map should contain the key `:name`, which is the string name of the table. For databases
  that have a concept of schemas, this map should also include the string name of the table's `:schema`.

  Two different implementations are provided in this namespace: `fast-active-tables` (the default), and
  `post-filtered-active-tables`. You should be fine using the default, but refer to the documentation for those
  functions for more details on the differences.

  `metabase` is an instance of `DatabaseMetaData`."
  {:arglists '([driver metadata])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(declare fast-active-tables)

(defmethod active-tables :sql-jdbc [driver metadata]
  (fast-active-tables driver metadata))


(defmulti excluded-schemas
  "Return set of string names of schemas to skip syncing tables from."
  {:arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod excluded-schemas :sql-jdbc [_] nil)


;; TODO - why don't we just use JDBC `DatabaseMetaData` to do this? This is wacky
(defmulti database-type->base-type
  "Given a native DB column type (as a keyword), return the corresponding `Field` `base-type`, which should derive from
  `:type/*`. You can use `pattern-based-database-type->base-type` in this namespace to implement this using regex
  patterns."
  {:arglists '([driver database-type])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)


(defmulti column->special-type
  "Attempt to determine the special-type of a field given the column name and native type. For example, the Postgres
  driver can mark Postgres JSON type columns as `:type/SerializedJSON` special type.

  `database-type` and `column-name` will be strings."
  {:arglists '([driver database-type column-name])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod column->special-type :sql-jdbc [_ _ _] nil)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Common                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn pattern-based-database-type->base-type
  "Return a `database-type->base-type` function that matches types based on a sequence of pattern / base-type pairs."
  [pattern->type]
  (fn [column-type]
    (let [column-type (name column-type)]
      (loop [[[pattern base-type] & more] pattern->type]
        (cond
          (re-find pattern column-type) base-type
          (seq more)                    (recur more))))))

(defn- ->spec [db-or-id-or-spec]
  (if (u/id db-or-id-or-spec)
    (sql-jdbc.conn/db->pooled-connection-spec db-or-id-or-spec)
    db-or-id-or-spec))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Sync Impl                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - we should reduce the metadata ResultSets instead of realizing the entire thing in memory at once and then
;; filtering/transforming in Clojure-land

(defn- get-tables
  "Fetch a JDBC Metadata ResultSet of tables in the DB, optionally limited to ones belonging to a given schema."
  [^DatabaseMetaData metadata ^String schema-or-nil ^String db-name-or-nil]
  ;; tablePattern "%" = match all tables
  (with-open [rs (.getTables metadata db-name-or-nil schema-or-nil "%"
                             (into-array String ["TABLE" "VIEW" "FOREIGN TABLE" "MATERIALIZED VIEW"]))]
    (mapv #(select-keys % [:table_name :remarks :table_schem])
          (jdbc/result-set-seq rs))))

(defn fast-active-tables
  "Default, fast implementation of `active-tables` best suited for DBs with lots of system tables (like Oracle). Fetch
  list of schemas, then for each one not in `excluded-schemas`, fetch its Tables, and combine the results.

  This is as much as 15x faster for Databases with lots of system tables than `post-filtered-active-tables` (4 seconds
  vs 60)."
  [driver ^DatabaseMetaData metadata & [db-name-or-nil]]
  (with-open [rs (.getSchemas metadata)]
    (let [all-schemas (set (map :table_schem (jdbc/result-set-seq rs)))
          schemas     (set/difference all-schemas (excluded-schemas driver))]
      (set (for [schema schemas
                 table  (get-tables metadata schema db-name-or-nil)]
             (let [remarks (:remarks table)]
               {:name        (:table_name table)
                :schema      schema
                :description (when-not (str/blank? remarks)
                               remarks)}))))))

(defn post-filtered-active-tables
  "Alternative implementation of `active-tables` best suited for DBs with little or no support for schemas. Fetch *all*
  Tables, then filter out ones whose schema is in `excluded-schemas` Clojure-side."
  [driver, ^DatabaseMetaData metadata, & [db-name-or-nil]]
  (set (for [table   (filter #(not (contains? (excluded-schemas driver) (:table_schem %)))
                             (get-tables metadata nil nil))]
         (let [remarks (:remarks table)]
           {:name        (:table_name  table)
            :schema      (:table_schem table)
            :description (when-not (str/blank? remarks)
                           remarks)}))))

(defn get-catalogs
  "Returns a set of all of the catalogs found via `metadata`"
  [^DatabaseMetaData metadata]
  (with-open [rs (.getCatalogs metadata)]
    (set (map :table_cat (jdbc/metadata-result rs)))))

(defn- database-type->base-type-or-warn
  "Given a `database-type` (e.g. `VARCHAR`) return the mapped Metabase type (e.g. `:type/Text`)."
  [driver database-type]
  (or (database-type->base-type driver (keyword database-type))
      (do (log/warn (format "Don't know how to map column type '%s' to a Field base_type, falling back to :type/*."
                            database-type))
          :type/*)))

(defn- calculated-special-type
  "Get an appropriate special type for a column with `column-name` of type `database-type`."
  [driver, ^String column-name, ^String database-type]
  (when-let [special-type (column->special-type driver database-type column-name)]
    (assert (isa? special-type :type/*)
      (str "Invalid type: " special-type))
    special-type))

(defn simple-select-probe
  "Perform a simple (and cheap) SELECT on a given table to test for access and get metadata."
  [driver schema table]
  (first
   (sql.qp/format-honeysql driver
     (sql.qp/apply-top-level-clause driver :limit
       {:select [:*]
        :from   [(sql.qp/->honeysql driver (hx/identifier :table schema table))]}
       {:limit 1}))))

(defn- fields-metadata
  [^DatabaseMetaData metadata, driver, {^String schema :schema, ^String table-name :name :as table}, & [^String db-name-or-nil]]
  (with-open [rs (.getColumns metadata db-name-or-nil schema table-name nil)]
    (let [result (jdbc/result-set-seq rs)]
      ;; In some rare cases `:column_name` is blank (eg. SQLite's views with group by),
      ;; fallback to sniffing the type from a SELECT * query
      (if (some (comp str/blank? :type_name) result)
        (jdbc/with-db-connection [conn (->spec (:db_id table))]
          (let [^Connection conn            (:connection conn)
                ^ResultSetMetaData metadata (->> (simple-select-probe driver schema table-name)
                                                 (.executeQuery (.createStatement conn))
                                                 (.getMetaData))]
            (doall
             (for [i (range 1 (inc (.getColumnCount metadata)))]
               {:type_name   (.getColumnTypeName metadata i)
                :column_name (.getColumnName metadata i)}))))
        result))))

(defn describe-table-fields
  "Returns a set of column metadata for `schema` and `table-name` using `metadata`. "
  [^DatabaseMetaData metadata, driver, table, & [^String db-name-or-nil]]
  (set
   (for [[idx {database-type :type_name
               column-name   :column_name
               remarks       :remarks}] (m/indexed (fields-metadata metadata driver table db-name-or-nil))]
     (merge
      {:name              column-name
       :database-type     database-type
       :base-type         (database-type->base-type-or-warn driver database-type)
       :database-position idx}
      (when (not (str/blank? remarks))
        {:field-comment remarks})
      (when-let [special-type (calculated-special-type driver column-name database-type)]
        {:special-type special-type})))))

(defn add-table-pks
  "Using `metadata` find any primary keys for `table` and assoc `:pk?` to true for those columns."
  [^DatabaseMetaData metadata, table]
  (with-open [rs (.getPrimaryKeys metadata nil nil (:name table))]
    (let [pks (set (map :column_name (jdbc/metadata-result rs)))]
      (update table :fields (fn [fields]
                              (set (for [field fields]
                                     (if-not (contains? pks (:name field))
                                       field
                                       (assoc field :pk? true)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            Default SQL JDBC metabase.driver impls for sync methods                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn describe-database
  "Default implementation of `driver/describe-database` for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db-or-id-or-spec]
  (jdbc/with-db-metadata [metadata (->spec db-or-id-or-spec)]
    {:tables (active-tables driver metadata)}))

(defn describe-table
  "Default implementation of `driver/describe-table` for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db-or-id-or-spec table]
  (jdbc/with-db-metadata [metadata (->spec db-or-id-or-spec)]
    (->>
     (assoc (select-keys table [:name :schema]) :fields (describe-table-fields metadata driver table))
     ;; find PKs and mark them
     (add-table-pks metadata))))

(defn describe-table-fks
  "Default implementation of `driver/describe-table-fks` for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db-or-id-or-spec table & [^String db-name-or-nil]]
  (jdbc/with-db-metadata [metadata (->spec db-or-id-or-spec)]
    (with-open [rs (.getImportedKeys metadata db-name-or-nil, ^String (:schema table), ^String (:name table))]
      (set
       (for [result (jdbc/metadata-result rs)]
         {:fk-column-name   (:fkcolumn_name result)
          :dest-table       {:name   (:pktable_name result)
                             :schema (:pktable_schem result)}
          :dest-column-name (:pkcolumn_name result)})))))
