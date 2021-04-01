(ns metabase.driver.sql-jdbc.sync.describe-table
  "SQL JDBC impl for `describe-table` and `describe-table-fks`."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.sync.common :as common]
            [metabase.driver.sql-jdbc.sync.interface :as i]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx])
  (:import [java.sql Connection DatabaseMetaData ResultSet]))

(defmethod i/column->semantic-type :sql-jdbc [_ _ _] nil)

(defn pattern-based-database-type->base-type
  "Return a `database-type->base-type` function that matches types based on a sequence of pattern / base-type pairs.
  `pattern->type` is a map of regex pattern to MBQL type keyword."
  [pattern->type]
  (fn database-type->base-type [column-type]
    (let [column-type (name column-type)]
      (some
       (fn [[pattern base-type]]
         (when (re-find pattern column-type)
           base-type))
       pattern->type))))

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

(defn- calculated-semantic-type
  "Get an appropriate semantic type for a column with `column-name` of type `database-type`."
  [driver ^String column-name ^String database-type]
  (when-let [semantic-type (i/column->semantic-type driver database-type column-name)]
    (assert (isa? semantic-type :type/*)
      (str "Invalid type: " semantic-type))
    semantic-type))

(defmethod i/fallback-metadata-query :sql-jdbc
  [driver schema table]
  {:pre [(string? table)]}
  ;; Using our SQL compiler here to get portable LIMIT (e.g. `SELECT TOP n ...` for SQL Server/Oracle)
  (let [honeysql {:select [:*]
                  :from   [(sql.qp/->honeysql driver (hx/identifier :table schema table))]
                  :where  [:not= 1 1]}
        honeysql (sql.qp/apply-top-level-clause driver :limit honeysql {:limit 0})]
    (sql.qp/format-honeysql driver honeysql)))

(defn- fallback-fields-metadata-from-select-query
  "In some rare cases `:column_name` is blank (eg. SQLite's views with group by) fallback to sniffing the type from a
  SELECT * query."
  [driver ^Connection conn table-schema table-name]
  ;; some DBs (:sqlite) don't actually return the correct metadata for LIMIT 0 queries
  (let [[sql & params] (i/fallback-metadata-query driver table-schema table-name)]
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (with-open [stmt (common/prepare-statement driver conn sql params)
                    rs   (.executeQuery stmt)]
          (let [metadata (.getMetaData rs)]
            (reduce
             ((map (fn [^Integer i]
                     {:name          (.getColumnName metadata i)
                      :database-type (.getColumnTypeName metadata i)})) rf)
             init
             (range 1 (inc (.getColumnCount metadata))))))))))

(defn- jdbc-fields-metadata
  "Reducible metadata about the Fields belonging to a Table, fetching using JDBC DatabaseMetaData methods."
  [driver ^Connection conn db-name-or-nil schema table-name]
  (common/reducible-results #(.getColumns (.getMetaData conn)
                                          db-name-or-nil
                                          (some->> schema (driver/escape-entity-name-for-metadata driver))
                                          (some->> table-name (driver/escape-entity-name-for-metadata driver))
                                          nil)
                            (fn [^ResultSet rs]
                              #(merge
                                {:name          (.getString rs "COLUMN_NAME")
                                 :database-type (.getString rs "TYPE_NAME")}
                                (when-let [remarks (.getString rs "REMARKS")]
                                  (when-not (str/blank? remarks)
                                    {:field-comment remarks}))))))

(defn- fields-metadata
  "Returns reducible metadata for the Fields in a `table`."
  [driver ^Connection conn {schema :schema, table-name :name} & [^String db-name-or-nil]]
  {:pre [(instance? Connection conn) (string? table-name)]}
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      ;; 1. Return all the Fields that come back from DatabaseMetaData that include type info.
      ;;
      ;; 2. Iff there are some Fields that don't have type info, concatenate
      ;;    `fallback-fields-metadata-from-select-query`, which fetches the same Fields using a different method.
      ;;
      ;; 3. Filter out any duplicates between the two methods using `m/distinct-by`.
      (let [has-fields-without-type-info? (volatile! false)
            jdbc-metadata                 (eduction
                                           (remove (fn [{:keys [database-type]}]
                                                     (when (str/blank? database-type)
                                                       (vreset! has-fields-without-type-info? true)
                                                       true)))
                                           (jdbc-fields-metadata driver conn db-name-or-nil schema table-name))
            fallback-metadata             (reify clojure.lang.IReduceInit
                                            (reduce [_ rf init]
                                              (reduce
                                               rf
                                               init
                                               (when @has-fields-without-type-info?
                                                 (fallback-fields-metadata-from-select-query driver conn schema table-name)))))]
        ;; VERY IMPORTANT! DO NOT REWRITE THIS TO BE LAZY! IT ONLY WORKS BECAUSE AS NORMAL-FIELDS GETS REDUCED,
        ;; HAS-FIELDS-WITHOUT-TYPE-INFO? WILL GET SET TO TRUE IF APPLICABLE AND THEN FALLBACK-FIELDS WILL RUN WHEN
        ;; IT'S TIME TO START EVALUATING THAT.
        (reduce
         ((comp cat (m/distinct-by :name)) rf)
         init
         [jdbc-metadata fallback-metadata])))))

(defn describe-table-fields
  "Returns a set of column metadata for `table` using JDBC Connection `conn`."
  [driver conn table & [db-name-or-nil]]
  (into
   #{}
   (map-indexed (fn [i {:keys [database-type], column-name :name, :as col}]
                  (merge
                   (u/select-non-nil-keys col [:name :database-type :field-comment])
                   {:base-type         (database-type->base-type-or-warn driver database-type)
                    :database-position i}
                   (when-let [semantic-type (calculated-semantic-type driver column-name database-type)]
                     {:semantic-type semantic-type}))))
   (fields-metadata driver conn table db-name-or-nil)))

(defn add-table-pks
  "Using `metadata` find any primary keys for `table` and assoc `:pk?` to true for those columns."
  [^DatabaseMetaData metadata table]
  (let [pks (into #{} (common/reducible-results #(.getPrimaryKeys metadata nil nil (:name table))
                                                (fn [^ResultSet rs]
                                                  #(.getString rs "COLUMN_NAME"))))]
    (update table :fields (fn [fields]
                            (set (for [field fields]
                                   (if-not (contains? pks (:name field))
                                     field
                                     (assoc field :pk? true))))))))

(defn- describe-table* [driver ^Connection conn table]
  {:pre [(instance? Connection conn)]}
  (->> (assoc (select-keys table [:name :schema])
              :fields (describe-table-fields driver conn table))
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

(defn- describe-table-fks*
  [driver ^Connection conn {^String schema :schema, ^String table-name :name} & [^String db-name-or-nil]]
  (into
   #{}
   (common/reducible-results #(.getImportedKeys (.getMetaData conn) db-name-or-nil schema table-name)
                             (fn [^ResultSet rs]
                               (fn []
                                 {:fk-column-name   (.getString rs "FKCOLUMN_NAME")
                                  :dest-table       {:name   (.getString rs "PKTABLE_NAME")
                                                     :schema (.getString rs "PKTABLE_SCHEM")}
                                  :dest-column-name (.getString rs "PKCOLUMN_NAME")})))))

(defn describe-table-fks
  "Default implementation of `driver/describe-table-fks` for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db-or-id-or-spec-or-conn table & [db-name-or-nil]]
  (if (instance? Connection db-or-id-or-spec-or-conn)
    (describe-table-fks* driver db-or-id-or-spec-or-conn table db-name-or-nil)
    (let [spec (sql-jdbc.conn/db->pooled-connection-spec db-or-id-or-spec-or-conn)]
      (with-open [conn (jdbc/get-connection spec)]
        (describe-table-fks* driver conn table db-name-or-nil)))))
