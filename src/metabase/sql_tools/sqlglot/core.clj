(ns metabase.sql-tools.sqlglot.core
  "The `:sqlglot` implementations of the [[metabase.sql-tools.interface]] multimethods. They serve every backend in
  [[metabase.sql-parsing.core/backends]]: each method hands the backend it receives to
  [[metabase.sql-parsing.core/parser]], and the shared pipeline in [[metabase.sql-tools.common]] dispatches its
  nested calls with that same backend."
  (:require
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.sql-tools.interface :as sql-tools]
   [metabase.util.log :as log])
  (:import
   (java.util IdentityHashMap)))

(set! *warn-on-reflection* true)

(defn- convert-error
  "Convert sql-parsing generic error format to lib.validate format.
   sql-parsing returns generic maps like {:type :syntax-error} or {:type :timeout :message \"...\"},
   and this function translates them to the lib.validate error format."
  [error]
  (case (:type error)
    :syntax-error       (lib/syntax-error)
    :missing-column     (lib/missing-column-error (:name error))
    :missing-table-alias (lib/missing-table-alias-error (:name error))
    :timeout            (lib/validation-exception-error (:message error))
    ;; Fallback: pass through if already in correct format or unknown type
    error))

;; TODO(rileythomp, 2026-03): Should this be a driver multimethod?
(defn driver->dialect
  "Map a Metabase driver keyword to a SQLGlot dialect string.
   Returns nil for drivers that should use SQLGlot's default dialect (e.g., H2)."
  [driver]
  (case driver
    nil                  nil
    :postgres            "postgres"
    :mysql               "mysql"
    :snowflake           "snowflake"
    :bigquery            "bigquery"
    :bigquery-cloud-sdk  "bigquery"
    :redshift            "redshift"
    :sqlserver           "tsql"
    :sparksql            "spark"
    :presto-jdbc         "presto"
    :starburst           "trino"
    :clickhouse          "clickhouse"
    :motherduck          "duckdb"
    :druid-jdbc          "druid"
    :vertica             nil
    :h2                  nil
    ;; Default: try using the driver name as dialect
    (name driver)))

;;;; Tables

(defn- referenced-tables
  [backend driver query]
  (try
    (let [sql (lib/raw-native-query query)
          default-schema (:default-schema (lib.metadata/database query))
          query-tables (sql-parsing/referenced-tables (sql-parsing/parser backend) (driver->dialect driver) sql)
          specs (map (fn [[_catalog table-schema table]]
                       (sql-tools.common/normalize-table-spec
                        driver {:table table
                                :schema (or table-schema default-schema)}))
                     query-tables)
          table-ids (sql-tools.common/table-ids-by-name (lib/database-id query) (keep :table specs))
          db-tables (lib.metadata/bulk-metadata query :metadata/table table-ids)
          db-transforms (lib.metadata/transforms query)]
      (sql-tools.common/resolve-table-specs driver (lib.metadata/database query) db-tables db-transforms specs))
    (catch Exception e
      ;; Return empty sequence on parse error to follow the Macaw implementation behavior.
      (if (sql-parsing/parse-error? e)
        #{}
        (throw e)))))

;;;; Join steps

(def ^:private join-strategies
  "The `join_steps` strategy names as Metabase join strategies."
  {"inner" :inner-join
   "left"  :left-join
   "right" :right-join
   "full"  :full-join
   "cross" :cross-join})

(def ^:private drivers-without-dialect
  "The drivers with no sqlglot dialect whose step queries, generated in sqlglot's default dialect, are tested to run."
  #{:h2})

(defn- source-table-ids
  "A function from a source's `[catalog schema table]` to the id of the Table it names in `query`'s database.
  It returns nil for a name that matches no Table, a transform's target not yet created included."
  [driver query sources]
  (let [database  (lib.metadata/database query)
        spec      (fn [[_catalog table-schema table]]
                    (sql-tools.common/normalize-table-spec
                     driver {:table table, :schema (or table-schema (:default-schema database))}))
        specs     (into {} (keep (fn [{:keys [table]}] (when table [table (spec table)]))) sources)
        table-ids (sql-tools.common/table-ids-by-name (lib/database-id query) (keep :table (vals specs)))
        tables    (lib.metadata/bulk-metadata query :metadata/table table-ids)]
    (fn [parts]
      (some->> (get specs parts)
               (sql-tools.common/find-table-or-transform driver database tables [])
               :table))))

(defn join-steps
  "The row-count queries of each join in `query`, a native query, for `driver`, from `parser`.
  See [[metabase.sql-tools.core/join-steps]]."
  [parser driver query]
  (let [dialect (driver->dialect driver)
        result  (if (and (nil? dialect) (not (drivers-without-dialect driver)))
                  {:status "unsupported", :reason "unsupported-dialect"}
                  (sql-parsing/join-steps parser dialect (lib/raw-native-query query)))]
    (if-not (= "ok" (:status result))
      {:unsupported (keyword (:reason result))}
      (let [table-id (source-table-ids driver query (cons (:from result) (:steps result)))
            source   (fn [{:keys [table alias] :as s}]
                       {:source   (keyword (:source s))
                        :table-id (some-> table table-id)
                        :alias    (sql-tools.common/normalize-name driver alias)})]
        {:from  (assoc (source (:from result)) :sql (:base_sql result))
         :steps (mapv (fn [step]
                        (assoc (source step)
                               :strategy (join-strategies (:strategy step))
                               :sql      (:sql step)))
                      (:steps result))}))))

(defmethod sql-tools/referenced-tables-impl :sqlglot
  [backend driver query]
  (referenced-tables backend driver query))

;;;; field-references

(def ^:private ^:const normalizable-keys
  "Keys that should have their string values normalized for case.
   Matches Macaw's col-fields which normalizes [:type :column :table :schema :database :alias]."
  #{:type :column :table :schema :database :alias})

(declare normalize-field)

(defn- normalize-value
  "`v`, the value of the key `k` in a field spec, with its identifier strings normalized."
  [driver cache k v]
  (cond
    (and (normalizable-keys k) (string? v)) (sql.normalize/normalize-name driver v)
    (map? v)                                (normalize-field driver cache v)
    (set? v)                                (into #{} (map #(normalize-field driver cache %)) v)
    (sequential? v)                         (mapv #(normalize-field driver cache %) v)
    :else                                   v))

(defn- normalize-keys
  "The map `field` with each of its values normalized."
  [driver cache field]
  (reduce-kv (fn [m k v]
               (assoc m k (normalize-value driver cache k v)))
             field
             field))

(defn- normalize-field
  "Normalize identifier strings in a field spec using driver-specific case rules.
   Only normalizes specific keys (column, table, schema, etc.) to match Macaw's col-fields.
   `cache` holds the composite fields normalized so far."
  [driver cache field]
  (cond
    (not (map? field))
    field

    (= :composite-field (:type field))
    (sql-parsing/cached-by-identity! cache field #(normalize-keys driver cache field))

    :else
    (normalize-keys driver cache field)))

(defmethod sql-tools/field-references-impl :sqlglot
  [backend driver sql-string]
  (let [result (sql-parsing/field-references (sql-parsing/parser backend) (driver->dialect driver) sql-string)
        cache  (IdentityHashMap.)]
    (-> result
        (update :used-fields #(set (map (partial normalize-field driver cache) %)))
        (update :returned-fields #(mapv (partial normalize-field driver cache) %))
        (update :errors #(set (map convert-error %))))))

;;;; referenced-fields

(defmethod sql-tools/referenced-fields-impl :sqlglot
  [parser driver query]
  (sql-tools.common/referenced-fields parser driver query))

;;;; Validation
;; SQLGlot validation uses the same pipeline as Macaw:
;; field-references (dispatched on the same backend) → resolve-field (Macaw's logic)
(defmethod sql-tools/validate-query-impl :sqlglot
  [backend driver query]
  (sql-tools.common/validate-query backend driver query))

;;;; returned-columns
;; SQLGlot returned-columns uses the same pipeline as Macaw:
;; field-references (dispatched on the same backend) → resolve-field (Macaw's logic)
(defmethod sql-tools/returned-columns-impl :sqlglot
  [backend driver query]
  (sql-tools.common/returned-columns backend driver query))

(defmethod sql-tools/referenced-tables-raw-impl :sqlglot
  [backend driver sql-str opts]
  (try
    (let [dialect (driver->dialect driver)
          ;; sql-parsing/referenced-tables returns [[catalog schema table] ...]
          ;; Convert to [{:schema ... :table ...} ...] format.
          ;; Do NOT normalize case here — SQLGlot already applies dialect-appropriate case rules
          ;; (e.g., uppercase for Snowflake, lowercase for Postgres). Additional normalization
          ;; via normalize-table-spec would incorrectly lowercase Snowflake identifiers, breaking
          ;; AppDB lookups where identifiers are stored in their native case.
          ;; This matches the Macaw implementation which also returns raw identifiers.
          table-tuples (sql-parsing/referenced-tables (sql-parsing/parser backend) dialect sql-str)]
      (mapv (fn [[_catalog schema table]]
              {:schema schema :table table})
            table-tuples))
    (catch Exception e
      ;; Return empty sequence on parse error to follow the Macaw implementation behavior.
      (if (and (sql-parsing/parse-error? e) (not (:fail-on-parse-error? opts)))
        []
        (throw e)))))

(defmethod sql-tools/simple-query?-impl :sqlglot
  [backend sql-string]
  (try
    ;; No dialect available from caller, use nil for SQLGlot's default dialect
    (sql-parsing/simple-query? (sql-parsing/parser backend) nil sql-string)
    (catch Exception e
      (log/debugf "Failed to parse query: %s" (ex-message e))
      {:is_simple false})))

(defmethod sql-tools/add-into-clause-impl :sqlglot
  [backend driver sql table-name]
  (sql-parsing/add-into-clause (sql-parsing/parser backend) (driver->dialect driver) sql table-name))

(defmethod sql-tools/add-insert-clause-impl :sqlglot
  [backend driver sql table-name]
  (sql-parsing/add-insert-clause (sql-parsing/parser backend) (driver->dialect driver) sql table-name))

(defmethod sql-tools/replace-names-impl :sqlglot
  [backend driver sql-string replacements _opts]
  ;; Convert map keys to list-of-pairs for JSON serialization
  ;; {:tables {{:table "a"} "b"}} -> {:tables [[{:table "a"} "b"]]}
  (let [replacements' (-> replacements
                          (update :tables #(when % (vec %)))
                          (update :columns #(when % (vec %))))]
    (sql-parsing/replace-names (sql-parsing/parser backend) (driver->dialect driver) sql-string replacements')))

(defmethod sql-tools/transpile-sql-impl :sqlglot
  [backend sql from-dialect to-dialect]
  (sql-parsing/transpile-sql (sql-parsing/parser backend) sql from-dialect to-dialect))
