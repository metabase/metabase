(ns metabase.sql-tools.sqlglot.experimental
  "Do not use code from this ns. It uses lienage features and `sqlglot-schema`."
  (:require
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]))

(defn- table-schema
  [driver table]
  (or (:schema table)
      (driver.sql/default-schema driver)))

;; TODO: there are some 1000+ fields schemas lurking, this functionality should be disabled for them!
;; TODO: driver not needed, as in various other places, could be inferred from query
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

;; TODO: Avoid use of `sqlglot-schema` and lineage.
(defn returned-columns
  "Given a native query return columns it produces.

  Normalizes identifiers returned by the Sqlglot. (TODO: questionable! get back to this.)"
  [driver query]
  (let [sqlglot-schema* (sqlglot-schema driver query)
        sql-str (lib/raw-native-query query)
        default-schema* (driver.sql/default-schema driver)
        lineage (sql-parsing/returned-columns-lineage
                 (driver->dialect driver) sql-str default-schema* sqlglot-schema*)
        normalized-lienage (mapv (partial normalized-dependencies driver)
                                 lineage)
        schema->table->col* (schema->table->col query)
        returned-columns (lineage->returned-columns schema->table->col* normalized-lienage)]
    returned-columns))

(defmethod sql-tools/returned-columns-impl :sqlglot
  [_parser driver query]
  (returned-columns driver query))
