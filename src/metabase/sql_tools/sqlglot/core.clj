^{:clj-kondo/ignore [:metabase/modules]} ;; TODO: remove before merging
(ns metabase.sql-tools.sqlglot.core
  (:require
   [clojure.string :as str]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.macaw.core :as sql-tools.macaw]
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
          (keep (fn [[_catalog table-schema table]]
                  (sql-tools.common/find-table-or-transform
                   driver db-tables db-transforms
                   (sql-tools.common/normalize-table-spec
                    driver {:table table
                            :schema (or table-schema default-schema)}))))
          query-tables)))

(comment
  ;; REPL usage - requires test metadata:
  (require '[metabase.lib.test-metadata :as meta])
  (require '[metabase.lib.core :as lib])
  (let [query (lib/native-query meta/metadata-provider "SELECT * FROM ORDERS")]
    (referenced-tables :h2 query)))

(defmethod sql-tools/referenced-tables-impl :sqlglot
  [_parser driver query]
  (referenced-tables driver query))

;;;; referenced-fields

(defn- namespaced-fields
  "Build a lookup map: table -> field-name -> field metadata."
  [mp]
  (reduce (fn [acc table]
            ;; TODO: Multiple schemas.
            (assoc acc (:name table) (u/for-map
                                      [field (lib.metadata/fields mp (:id table))]
                                      [(:name field) field])))
          {}
          (lib.metadata/tables mp)))

(defn- coords->fields
  "Convert a [catalog schema table field] tuple to field metadata."
  [namespaced-fields* [_catalog _schema table-name field-name :as _coords]]
  (if (= "*" field-name)
    (some-> (get namespaced-fields* table-name) vals)
    (some-> (get-in namespaced-fields* [table-name field-name]) vector)))

(defn- referenced-fields
  "Given a driver and a native query, return the set of :metadata/column fields referenced in the query."
  [driver query]
  (let [sql (lib/raw-native-query query)
        field-coords (sql-parsing/referenced-fields (driver->dialect driver) sql)
        namespaced-fields* (namespaced-fields query)]
    (into #{}
          (mapcat (partial coords->fields namespaced-fields*))
          field-coords)))

(defmethod sql-tools/referenced-fields-impl :sqlglot
  [_parser driver query]
  (referenced-fields driver query))

;;;; field-references

(defmethod sql-tools/field-references-impl :sqlglot
  [_parser driver sql-string]
  (sql-parsing/field-references (driver->dialect driver) sql-string))

;;;; Validation
;; SQLGlot validation uses the same pipeline as Macaw:
;; field-references (dispatched to :sqlglot) → resolve-field (Macaw's logic)
(defmethod sql-tools/validate-query-impl :sqlglot
  [_parser driver query]
  (sql-tools.macaw/validate-query driver query))

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

(defmethod sql-tools/referenced-tables-raw-impl :sqlglot
  [_parser driver sql-str]
  (let [dialect (driver->dialect driver)
        ;; sql-parsing/referenced-tables returns [[catalog schema table] ...]
        ;; Convert to [{:schema ... :table ...} ...] for table-match-clause
        table-tuples (sql-parsing/referenced-tables dialect sql-str)
        tables (mapv (fn [[_catalog schema table]] {:schema schema :table table}) table-tuples)]
    tables))

(defmethod sql-tools/simple-query?-impl :sqlglot
  [_parser sql-string]
  (try
    ;; No dialect available from caller, use nil for SQLGlot's default dialect
    (sql-parsing/simple-query? nil sql-string)
    (catch Exception e
      (log/debugf e "Failed to parse query: %s" (ex-message e))
      {:is_simple false})))

(defmethod sql-tools/add-into-clause-impl :sqlglot
  [_parser driver sql table-name]
  (sql-parsing/add-into-clause (driver->dialect driver) sql table-name))

(defmethod sql-tools/replace-names-impl :sqlglot
  [_parser driver sql-string replacements _opts]
  ;; Convert map keys to list-of-pairs for JSON serialization
  ;; {:tables {{:table "a"} "b"}} -> {:tables [[{:table "a"} "b"]]}
  (let [replacements' (-> replacements
                          (update :tables #(when % (vec %)))
                          (update :columns #(when % (vec %))))]
    (sql-parsing/replace-names (driver->dialect driver) sql-string replacements')))
