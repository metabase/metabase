(ns metabase.sql-tools.sqlglot.experimental
  "SQLGlot returned-columns implementation using lineage analysis.
   Provides column metadata for native SQL queries."
  (:require
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.log :as log]))

(defn- table-schema
  [driver table]
  (or (:schema table)
      (driver.sql/default-schema driver)))

(defn- sqlglot-schema
  "Generate the database schema structure processable by Sqlglot."
  [driver mp]
  (reduce (fn [acc table]
            (assoc-in acc [(table-schema driver table) (:name table)]
                      (u/for-map
                       [field (lib.metadata/fields mp (:id table))]
                       ;; TODO: Proper type mappings (if that unlocks some useful functionality)
                        [(:name field) "UNKNOWN"])))
          {}
          (lib.metadata/tables mp)))

(defn- schema->table->col
  [mp]
  (reduce (fn [acc table]
            (assoc-in acc [(:schema table) (:name table)]
                      (u/for-map
                       [field (lib.metadata/fields mp (:id table))]
                        [(:name field) field])))
          {}
          (lib.metadata/tables mp)))

(defn- driver->dialect
  [driver]
  (when-not (= :h2 driver)
    (name driver)))

;;;; Columns

;; TODO: Clean this up. This is breaking lib encapsulation.
(defn- resolve-column
  [schema->table->col single-lineage]
  (let [[alias pure? [[table-schema table column]]] single-lineage]
    (merge
     (if-not pure?
       {:base-type :type/*
        :effective-type :type/*
        :semantic-type :type/*}
       (select-keys (get-in schema->table->col [table-schema table column])
                    [:base-type :effective-type :semantic-type :database-type]))
     {:lib/type :metadata/column
      :lib/desired-column-alias alias
      :name alias
      :display-name (u.humanization/name->human-readable-name :simple alias)})))

(defn- lineage->returned-columns
  [schema->table->col* lineage]
  (mapv (partial resolve-column schema->table->col*) lineage))

(defn- normalize-dependency
  [driver dependency]
  (mapv (fn [component]
          (when (string? (not-empty component))
            (driver.sql/normalize-name driver component)))
        dependency))

(defn- normalized-dependencies
  [driver [_alias _pure? _dependencies :as single-lineage]]
  (update single-lineage 2 #(mapv (partial normalize-dependency driver)
                                  %)))

(def ^:private ^:const max-schema-fields
  "Maximum number of fields in schema before skipping lineage analysis."
  1000)

(defn- schema-field-count
  "Count total fields across all tables in the metadata provider."
  [mp]
  (reduce + (map #(count (lib.metadata/fields mp (:id %)))
                 (lib.metadata/tables mp))))

(defn- returned-columns-lineage
  "Call Python sqlglot to get returned column lineage.
   Returns vector of [alias pure? [[schema table col]...]] tuples."
  [dialect sql default-table-schema sqlglot-schema]
  (sql-parsing/returned-columns-lineage dialect sql default-table-schema sqlglot-schema))

(defn- returned-columns*
  "Internal implementation of returned-columns."
  [driver query]
  (let [sqlglot-schema* (sqlglot-schema driver query)
        sql-str (lib/raw-native-query query)
        default-schema* (driver.sql/default-schema driver)
        lineage (returned-columns-lineage
                 (driver->dialect driver) sql-str default-schema* sqlglot-schema*)
        normalized-lineage (mapv (partial normalized-dependencies driver)
                                 lineage)
        schema->table->col* (schema->table->col query)]
    (lineage->returned-columns schema->table->col* normalized-lineage)))

(defn returned-columns
  "Given a native query return columns it produces.
   Normalizes identifiers returned by SQLGlot.
   Returns empty vector for large schemas or on error."
  [driver query]
  (let [field-count (schema-field-count query)]
    (if (> field-count max-schema-fields)
      (do
        (log/warnf "Schema has %d fields (> %d max), skipping returned-columns analysis"
                   field-count max-schema-fields)
        [])
      (try
        (returned-columns* driver query)
        (catch Exception e
          (log/warn e "Failed to get returned columns for query")
          [])))))

(defmethod sql-tools/returned-columns-impl :sqlglot
  [_parser driver query]
  (returned-columns driver query))
