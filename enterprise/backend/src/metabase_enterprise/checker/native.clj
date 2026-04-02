(ns metabase-enterprise.checker.native
  "Native SQL validation for the checker module.

   Two layers of native query analysis:

   1. **Ref extraction** (sql-parsing) — parse SQL string, extract table/field
      names as strings, resolve them against the store to assign IDs.

   2. **Structural validation** (sql-tools) — parse SQL, resolve columns against
      the MetadataProvider, catch missing columns, bad aliases, syntax errors.

   Layer 1 uses `metabase.sql-parsing` (raw strings → strings).
   Layer 2 uses `metabase.sql-tools` (string → in-memory tables/fields)."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.checker.store :as store]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.query-processor.interface :as qp.i]
   [metabase.util.log :as log]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.init]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; SQL compilation — pMBQL query → SQL string
;;; ===========================================================================

;; metabase.sql-tools.sqlglot.core/driver->dialect but don't want to bring in the dep
(def ^:private engine->dialect
  "Map engine names to SQLGlot dialect strings. nil means use default dialect."
  {"postgres"           "postgres"
   "mysql"              "mysql"
   "snowflake"          "snowflake"
   "bigquery"           "bigquery"
   "bigquery-cloud-sdk" "bigquery"
   "redshift"           "redshift"
   "sqlserver"          "tsql"
   "sparksql"           "spark"
   "presto-jdbc"        "presto"})

(defn compile-query-to-sql
  "Compile a pMBQL query to SQL.

   For native queries: uses compile-with-inline-parameters to expand template
   tags (snippets, card refs, variables, optional blocks) through the QP
   parameter substitution pipeline with our MetadataProvider.

   For MBQL queries: compiles to SQL using the driver directly.

   Returns the compiled SQL string, or nil on failure."
  [driver query]
  (if (lib/native-only-query? query)
    ;; Native: use QP compile path to expand template tags
    (try
      (driver/the-initialized-driver driver)
      (let [with-params (lib/add-parameters-for-template-tags query)
            compiled    (binding [qp.i/*skip-middleware-because-app-db-access* true]
                          (qp.compile/compile-with-inline-parameters with-params))]
        (:query compiled))
      (catch Throwable t
        ;; Fallback: return raw SQL (template tags unresolved)
        (log/warnf "Native query compilation failed for driver %s: %s" driver (ex-message t))
        (:native (lib/query-stage query -1))))
    ;; MBQL: compile to SQL using the driver directly, no QP middleware.
    (try
      (binding [driver/*driver* driver]
        (:query (driver/mbql->native driver query)))
      (catch Exception e
        (log/warnf "MBQL query compilation failed for driver %s: %s" driver (ex-message e))
        nil))))

;;; ===========================================================================
;;; Layer 1: Ref extraction via sql-parsing (raw strings → strings)
;;; ===========================================================================

(defn- parse-sql-refs
  "Parse SQL string with SQLGlot, resolve refs against the store.
   Returns {:tables [...] :fields [...]}."
  [store db-name dialect sql]
  (let [raw-tables  (sql-parsing/referenced-tables dialect sql)
        raw-fields  (sql-parsing/referenced-fields dialect sql)
        table-paths (mapv (fn [[_cat schema table]]
                            [db-name schema table])
                          raw-tables)
        field-paths (mapv (fn [[_cat schema table field]]
                            [db-name schema table field])
                          raw-fields)]
    (doseq [tp table-paths]
      (store/load-table! store tp))
    (doseq [fp field-paths]
      (store/load-field! store fp))
    {:tables (mapv #(str/join "." (remove nil? %)) table-paths)
     :fields (mapv #(str/join "." (remove nil? %)) field-paths)}))

(defn extract-sql-refs
  "Extract table and field references from a native query.

   Uses the full QP compile path to resolve template tags, parameters, etc.
   into clean SQL, then parses with SQLGlot.

   Resolves each discovered ref against the store so they get IDs assigned
   and (for lenient sources) get tracked in the manifest."
  [store db-name query]
  (let [db-data (or (store/cached-entity store :database db-name)
                    (store/load-database! store db-name))
        engine  (:engine db-data)
        driver  (when engine (keyword engine))
        dialect (get engine->dialect engine)
        sql     (when driver (compile-query-to-sql driver query))]
    (when sql
      (parse-sql-refs store db-name dialect sql))))

;;; ===========================================================================
;;; Layer 2: Structural validation via sql-tools (string → metadata)
;;; ===========================================================================

(defn- field-exists-in-store?
  "Check if a column name exists for any table in the given database in our store."
  [store db-name col-name]
  (let [norm-col (str/lower-case (str col-name))]
    (some (fn [field-path]
            (when (= db-name (first field-path))
              (= norm-col (str/lower-case (str (nth field-path 3))))))
          (store/all-refs store :field))))

(defn- filter-false-positive-errors
  "Filter out :missing-column errors for columns that DO exist in the store.
   These are false positives caused by schema-less databases (nil schema)
   where sql-tools assumes the default schema (e.g., \"public\")."
  [store db-name errors]
  (let [filtered (remove (fn [err]
                           (and (= :missing-column (:type err))
                                (field-exists-in-store? store db-name (:name err))))
                         errors)]
    (when (seq filtered)
      (set filtered))))

(defn- run-sql-tools-validation
  "Run sql-tools validation on a SQL string. Returns a set of error maps, or nil."
  [store provider engine db-name sql]
  (try
    (let [native-query (lib/native-query provider sql)
          errors       (binding [driver/*driver* engine]
                         (sql-tools/validate-query engine native-query))]
      (when (seq errors)
        (filter-false-positive-errors store db-name errors)))
    (catch Exception _
      nil)))

(defn validate-native-sql
  "Validate native SQL using sql-tools. Compiles the query to SQL, then uses
   sql-tools/validate-query to check that referenced tables and columns exist
   in the metadata provider.

   Returns a set of error maps, or nil if validation passes or isn't applicable."
  [store provider query db-name]
  (when db-name
    (let [db-data (or (store/cached-entity store :database db-name)
                      (store/load-database! store db-name))
          engine  (when (:engine db-data) (keyword (:engine db-data)))
          sql     (when engine (compile-query-to-sql engine query))]
      (when sql
        (run-sql-tools-validation store provider engine db-name sql)))))
