(ns metabase.driver.sql-jdbc.sync.describe-table
  "SQL JDBC impl for `describe-table` and `describe-table-fks`."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.sync
             [common :as common]
             [interface :as i]])
  (:import [java.sql Connection DatabaseMetaData]))

(defmethod i/column->special-type :sql-jdbc [_ _ _] nil)

(defn pattern-based-database-type->base-type
  "Return a `database-type->base-type` function that matches types based on a sequence of pattern / base-type pairs."
  [pattern->type]
  (fn [column-type]
    (let [column-type (name column-type)]
      (loop [[[pattern base-type] & more] pattern->type]
        (cond
          (re-find pattern column-type) base-type
          (seq more)                    (recur more))))))

(defn get-catalogs
  "Returns a set of all of the catalogs found via `metadata`"
  [^DatabaseMetaData metadata]
  (with-open [rs (.getCatalogs metadata)]
    (set (map :table_cat (jdbc/metadata-result rs)))))

(defn- database-type->base-type-or-warn
  "Given a `database-type` (e.g. `VARCHAR`) return the mapped Metabase type (e.g. `:type/Text`)."
  [driver database-type]
  (or (i/database-type->base-type driver (keyword database-type))
      (do (log/warn (format "Don't know how to map column type '%s' to a Field base_type, falling back to :type/*."
                            database-type))
          :type/*)))

(defn- calculated-special-type
  "Get an appropriate special type for a column with `column-name` of type `database-type`."
  [driver ^String column-name ^String database-type]
  (when-let [special-type (i/column->special-type driver database-type column-name)]
    (assert (isa? special-type :type/*)
      (str "Invalid type: " special-type))
    special-type))

(defn- fallback-fields-metadata-from-select-query
  "In some rare cases `:column_name` is blank (eg. SQLite's views with group by) fallback to sniffing the type from a
  SELECT * query."
  [driver ^Connection conn table-schema table-name]
  (let [[sql & params] (common/simple-select-probe-query driver table-schema table-name {:select [:*]})]
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (with-open [stmt (common/prepare-statement driver conn sql params)
                    rset (.executeQuery stmt)]
          (reduce
           rf
           init
           (let [metadata (.getMetaData rset)]
             (eduction (map (fn [^Integer i]
                              {:type_name   (.getColumnTypeName metadata i)
                               :column_name (.getColumnName metadata i)}))
                       (range 1 (inc (.getColumnCount metadata)))))))))))

(defn- fields-metadata
  "Returns reducible metadata for the Fields in a `table`."
  [driver conn {schema :schema, table-name :name} & [^String db-name-or-nil]]
  {:pre [(instance? Connection conn) (string? table-name)]}
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (with-open [rs (.getColumns (.getMetaData conn)
                                  db-name-or-nil
                                  (driver/escape-entity-name-for-metadata driver schema)
                                  (driver/escape-entity-name-for-metadata driver table-name)
                                  nil)]
        ;; 1. Return all the Fields that come back from DatabaseMetaData that include type info.
        ;;
        ;; 2. Iff there are some Fields that don't have type info, concatenate
        ;;    `fallback-fields-metadata-from-select-query`, which fetches the same Fields using a different method.
        ;;
        ;; 3. Filter out any duplicates between the two methods using `m/distinct-by`.
        (let [missing-type-info? (volatile! false)
              normal-fields      (eduction
                                  (filter (fn [{type-name :type_name}]
                                            (or (not (str/blank? type-name))
                                                (do (vreset! missing-type-info? true)
                                                    false))))
                                  (jdbc/reducible-result-set rs {}))
              fallback-fields    (reify clojure.lang.IReduceInit
                                   (reduce [_ rf init]
                                     (reduce
                                      rf
                                      init
                                      (when @missing-type-info?
                                        (fallback-fields-metadata-from-select-query driver conn schema table-name)))))]
          (reduce
           rf
           init
           (eduction
            (comp cat (m/distinct-by :column_name))
            [normal-fields fallback-fields])))))))

(defn describe-table-fields
  "Returns a set of column metadata for `table` using JDBC Connection `conn`."
  [driver conn table & [db-name-or-nil]]
  (transduce
   (comp (m/indexed)
         (map (fn [[i {database-type :type_name
                       column-name   :column_name
                       remarks       :remarks}]]
                (merge
                 {:name              column-name
                  :database-type     database-type
                  :base-type         (database-type->base-type-or-warn driver database-type)
                  :database-position i}
                 (when (not (str/blank? remarks))
                   {:field-comment remarks})
                 (when-let [special-type (calculated-special-type driver column-name database-type)]
                   {:special-type special-type})))))
   conj
   #{}
   (fields-metadata driver conn table db-name-or-nil)))

(defn add-table-pks
  "Using `metadata` find any primary keys for `table` and assoc `:pk?` to true for those columns."
  [^DatabaseMetaData metadata table]
  (with-open [rs (.getPrimaryKeys metadata nil nil (:name table))]
    (let [pks (set (map :column_name (jdbc/metadata-result rs)))]
      (update table :fields (fn [fields]
                              (set (for [field fields]
                                     (if-not (contains? pks (:name field))
                                       field
                                       (assoc field :pk? true)))))))))

(defn- describe-table* [driver conn table]
  {:pre [(instance? Connection conn)]}
  (->> (assoc (select-keys table [:name :schema]) :fields (describe-table-fields driver conn table))
       ;; find PKs and mark them
       (add-table-pks (.getMetaData conn))))

(defn describe-table
  "Default implementation of `driver/describe-table` for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db-or-id-or-spec-or-conn table]
  (if (instance? Connection db-or-id-or-spec-or-conn)
    (describe-table* driver db-or-id-or-spec-or-conn table)
    (let [spec (sql-jdbc.conn/db->pooled-connection-spec db-or-id-or-spec-or-conn)]
      (with-open [conn (jdbc/get-connection spec)]
        (describe-table* driver conn table)))))

(defn describe-table-fks
  "Default implementation of `driver/describe-table-fks` for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db-or-id-or-spec {^String schema :schema, ^String table-name :name} & [^String db-name-or-nil]]
  (jdbc/with-db-metadata [metadata (sql-jdbc.conn/db->pooled-connection-spec db-or-id-or-spec)]
    (with-open [rs (.getImportedKeys metadata db-name-or-nil schema table-name)]
      (transduce
       (map (fn [result]
              {:fk-column-name   (:fkcolumn_name result)
               :dest-table       {:name   (:pktable_name result)
                                  :schema (:pktable_schem result)}
               :dest-column-name (:pkcolumn_name result)}))
       conj
       #{}
       (jdbc/reducible-result-set rs {})))))
