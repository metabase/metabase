(ns metabase.sql-tools.sqlglot.core
  (:require
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.sqlglot.shim :as sqlglot.shim]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]))

;; TODO: explain namespacing, catalog, db...

(defn- table-schema
  [driver table]
  (or (:schema table)
      (driver.sql/default-schema driver)))

;; TODO: there are some 1000+ fields schemas lurking, this functionality should be disabled for them!
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
  (def stc schema->table->col*)
  (def lass lineage)
  (mapv (partial resolve-column schema->table->col*) lineage))

(defn returned-columns
  "Given a native query return columns it produces.

  Normalizes identifiers returned by the Sqlglot. (TODO: questionable! get back to this.)"
  [driver query]
  (let [schema (sqlglot-schema driver query)
        sql-str (lib/raw-native-query query)
        default-schema* (driver.sql/default-schema driver)
        lineage (sqlglot.shim/returned-columns-lineage driver sql-str default-schema* schema)
        schema->table->col* (schema->table->col query)
        returned-columns (lineage->returned-columns schema->table->col* lineage)]
    returned-columns))

(defmethod sql-tools/returned-columns-impl :sqlglot
  [_parser driver query]
  (returned-columns driver query))

(defn- referenced-tables
  [driver query]
  (let [db-tables (lib.metadata/tables query)
        db-transforms (lib.metadata/transforms query)
        sql (lib/raw-native-query query)
        default-table-schema* (driver.sql/default-schema driver)
        query-tables (sqlglot.shim/referenced-tables driver sql default-table-schema*)]
    (into #{}
          (keep (fn [[table-schema table]]
                  (sql-tools.common/find-table-or-transform
                   driver db-tables db-transforms
                   (sql-tools.common/normalize-table-spec
                    driver {:table table :schema table-schema}))))
          query-tables)))

(defmethod sql-tools/referenced-tables-impl :sqlglot
  [_parser driver query]
  (referenced-tables driver query))