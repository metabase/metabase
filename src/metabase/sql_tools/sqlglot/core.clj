^{:clj-kondo/ignore [:metabase/modules]}
(ns metabase.sql-tools.sqlglot.core
  (:require
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql.normalize :as sql.normalize]
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
            (sql.normalize/normalize-name driver component)))
        dependency))

(defn- normalized-dependencies
  [driver [_alias _pure? _dependencies :as single-lineage]]
  (update single-lineage 2 #(mapv (partial normalize-dependency driver)
                                  %)))

(defn returned-columns
  "Given a native query return columns it produces.

  Normalizes identifiers returned by the Sqlglot. (TODO: questionable! get back to this.)"
  [driver query]
  (let [sqlglot-schema* (sqlglot-schema driver query)
        sql-str (lib/raw-native-query query)
        default-schema* (driver.sql/default-schema driver)
        lineage (sqlglot.shim/returned-columns-lineage
                 (driver->dialect driver) sql-str default-schema* sqlglot-schema*)
        normalized-lienage (mapv (partial normalized-dependencies driver)
                                 lineage)
        schema->table->col* (schema->table->col query)
        returned-columns (lineage->returned-columns schema->table->col* normalized-lienage)]
    returned-columns))

(defmethod sql-tools/returned-columns-impl :sqlglot
  [_parser driver query]
  (returned-columns driver query))

;;;; Tables

(defn- referenced-tables
  [driver query]
  (let [db-tables (lib.metadata/tables query)
        db-transforms (lib.metadata/transforms query)
        sql (lib/raw-native-query query)
        default-schema (driver.sql/default-schema driver)
        query-tables (sqlglot.shim/referenced-tables sql (driver->dialect driver))]
    (into #{}
          (keep (fn [[table-schema table]]
                  (sql-tools.common/find-table-or-transform
                   driver db-tables db-transforms
                   (sql-tools.common/normalize-table-spec
                    driver {:table table
                            :schema (or table-schema default-schema)}))))
          query-tables)))

(defmethod sql-tools/referenced-tables-impl :sqlglot
  [_parser driver query]
  (referenced-tables driver query))

;;;; Validation

(defn- process-error-dispatch [_driver {:keys [type]}] type)

(defmulti process-error
  "WIP"
  {:arglists '([driver validation-output])}
  #'process-error-dispatch)

;; TODO: Better/correct error mapping for all methods!
(defmethod process-error :unknown-table
  [_driver _validation-output]
  (lib/syntax-error))

(defmethod process-error :column-not-resolved
  [driver {:keys [column] :as _validation-output}]
  (-> column
      ((partial sql.normalize/normalize-name driver))
      lib/missing-column-error))

(defmethod process-error :invalid-expression
  [_driver _validation-output]
  (lib/syntax-error))

;; TODO: The original, Macaw impl returns multiple errors for a query.
;; This should be extended the same way (e.g. by adding the checks over lineage).
;; For now we return #{<err>}, single error to conform previous implementation.
(defn validate-query
  "Validate the native `query`."
  [driver query]
  (let [sql (lib/raw-native-query query)
        default-table-schema* (driver.sql/default-schema driver)
        sqlglot-schema* (sqlglot-schema driver query)
        validation-result (sqlglot.shim/validate-query
                           (driver->dialect driver) sql default-table-schema* sqlglot-schema*)]
    (if (= :ok (:status validation-result))
      #{}
      (let [processed (process-error driver validation-result)]
        #{processed}))))

(defmethod sql-tools/validate-query-impl :sqlglot
  [_parser driver query]
  (validate-query driver query))
