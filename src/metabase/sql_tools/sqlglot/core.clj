^{:clj-kondo/ignore [:metabase/modules]}
(ns metabase.sql-tools.sqlglot.core
  (:require
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.log :as log]))

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

(defn driver->dialect
  "Map a Metabase driver keyword to a SQLGlot dialect string.
   Returns nil for drivers that should use SQLGlot's default dialect (e.g., H2)."
  [driver]
  (case driver
    :postgres            "postgres"
    :mysql               "mysql"
    :snowflake           "snowflake"
    :bigquery            "bigquery"
    :bigquery-cloud-sdk  "bigquery"
    :redshift            "redshift"
    :sqlserver           "tsql"
    :h2                  nil
    ;; Default: try using the driver name as dialect
    (name driver)))

;;;; Tables

(defn- referenced-tables
  [driver query]
  (let [db-tables (lib.metadata/tables query)
        db-transforms (lib.metadata/transforms query)
        sql (lib/raw-native-query query)
        default-schema (driver.sql/default-schema driver)
        query-tables (sql-parsing/referenced-tables (driver->dialect driver) sql)]
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
      ((partial driver.sql/normalize-name driver))
      lib/missing-column-error))

(defmethod process-error :invalid-expression
  [_driver _validation-output]
  (lib/syntax-error))

;; TODO: The original, Macaw impl returns multiple errors for a query.
;; This should be extended the same way (e.g. by adding the checks over lineage).
;; For now we return #{<err>}, single error to conform previous implementation.
#_(defn validate-query
    "Validate the native `query`."
    [driver query]
    (log/warn "I'm using sqlglot-schema, please fix me.")
    (let [sql (lib/raw-native-query query)
          default-table-schema* (driver.sql/default-schema driver)
          sqlglot-schema* (sqlglot-schema driver query)
          validation-result (sql-parsing/validate-query
                             (driver->dialect driver) sql default-table-schema* sqlglot-schema*)]
      (if (= :ok (:status validation-result))
        #{}
        (let [processed (process-error driver validation-result)]
          #{processed}))))

#_(defmethod sql-tools/validate-query-impl :sqlglot
    [_parser driver query]
    (validate-query driver query))

;;;; referenced-fields

(defn- namespaced-columns
  [mp]
  (reduce (fn [acc table]
            ;; TODO: Multiple schemas.
            #_(assoc-in acc [(:schema table) (:name table)]
                        (u/for-map
                         [field (lib.metadata/fields mp (:id table))]
                         [(:name field) field]))
            (assoc acc (:name table) (u/for-map
                                      [field (lib.metadata/fields mp (:id table))]
                                      [(:name field) field])))
          {}
          (lib.metadata/tables mp)))

(defn- field->columns
  [namespaced-columns* [table-name field-name :as _coords]]
  (let [columns (or (if (= "*" field-name)
                      (some-> (get namespaced-columns* table-name) vals)
                      (some-> (get-in namespaced-columns* [table-name field-name]) vector))
                    :missing)]
    (if (= :missing columns)
      (throw (ex-info "Referenced field not available."
                      {:table-name table-name
                       :field-name field-name}))
      columns)))

(defn referenced-columns
  "Given a driver and a native query, return the set of :metadata/columns referenced in the query.

  Throws if a referenced field in the query cannot be matched to an application database column."
  [driver query]
  (let [sql (lib/raw-native-query query)
        fields (sql-parsing/referenced-fields (driver->dialect driver) sql)
        namespaced-columns* (namespaced-columns query)]
    (into #{}
          (mapcat (partial field->columns namespaced-columns*))
          fields)))

;;;; returned-columns (column lineage)

(defn- schema->table->col
  "Build a lookup map: schema -> table -> column -> field metadata."
  [mp]
  (reduce (fn [acc table]
            (assoc-in acc [(:schema table) (:name table)]
                      (u/for-map
                       [field (lib.metadata/fields mp (:id table))]
                        [(:name field) field])))
          {}
          (lib.metadata/tables mp)))

(defn- resolve-column
  "Convert a single lineage entry to column metadata."
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
  [dialect sql default-table-schema sqlglot-schema*]
  (sql-parsing/returned-columns-lineage dialect sql default-table-schema sqlglot-schema*))

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
