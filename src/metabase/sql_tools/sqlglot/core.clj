(ns metabase.sql-tools.sqlglot.core
  (:require
   [clojure.string :as str]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.sql-tools.interface :as sql-tools]
   [metabase.util.log :as log])
  (:import
   (org.graalvm.polyglot PolyglotException)))

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

(defmethod sql-tools/referenced-tables-impl :sqlglot
  [_parser driver query]
  (referenced-tables driver query))

;;;; field-references

(def ^:private ^:const normalizable-keys
  "Keys that should have their string values normalized for case.
   Matches Macaw's col-fields which normalizes [:type :column :table :schema :database :alias]."
  #{:type :column :table :schema :database :alias})

(defn- normalize-field
  "Normalize identifier strings in a field spec using driver-specific case rules.
   Only normalizes specific keys (column, table, schema, etc.) to match Macaw's col-fields."
  [driver field]
  (if (map? field)
    (reduce-kv (fn [m k v]
                 (assoc m k
                        (cond
                          (and (normalizable-keys k) (string? v))
                          (driver.sql/normalize-name driver v)

                          (map? v)
                          (normalize-field driver v)

                          (set? v)
                          (set (map #(normalize-field driver %) v))

                          (sequential? v)
                          (mapv #(normalize-field driver %) v)

                          :else v)))
               {}
               field)
    field))

(defmethod sql-tools/field-references-impl :sqlglot
  [_parser driver sql-string]
  (let [result (sql-parsing/field-references (driver->dialect driver) sql-string)]
    (-> result
        (update :used-fields #(set (map (partial normalize-field driver) %)))
        (update :returned-fields #(mapv (partial normalize-field driver) %))
        (update :errors #(set (map convert-error %))))))

;;;; referenced-fields

(defmethod sql-tools/referenced-fields-impl :sqlglot
  [parser driver query]
  (sql-tools.common/referenced-fields parser driver query))

;;;; Validation
;; SQLGlot validation uses the same pipeline as Macaw:
;; field-references (dispatched to :sqlglot) → resolve-field (Macaw's logic)
(defmethod sql-tools/validate-query-impl :sqlglot
  [parser driver query]
  (sql-tools.common/validate-query parser driver query))

;;;; returned-columns
;; SQLGlot returned-columns uses the same pipeline as Macaw:
;; field-references (dispatched to :sqlglot) → resolve-field (Macaw's logic)
(defmethod sql-tools/returned-columns-impl :sqlglot
  [parser driver query]
  (sql-tools.common/returned-columns parser driver query))

(defmethod sql-tools/referenced-tables-raw-impl :sqlglot
  [_parser driver sql-str]
  (try
    (let [dialect (driver->dialect driver)
          ;; sql-parsing/referenced-tables returns [[catalog schema table] ...]
          ;; Convert to [{:schema ... :table ...} ...] format.
          ;; Do NOT normalize case here — SQLGlot already applies dialect-appropriate case rules
          ;; (e.g., uppercase for Snowflake, lowercase for Postgres). Additional normalization
          ;; via normalize-table-spec would incorrectly lowercase Snowflake identifiers, breaking
          ;; AppDB lookups where identifiers are stored in their native case.
          ;; This matches the Macaw implementation which also returns raw identifiers.
          table-tuples (sql-parsing/referenced-tables dialect sql-str)]
      (mapv (fn [[_catalog schema table]]
              {:schema schema :table table})
            table-tuples))
    (catch PolyglotException e
      ;; Return empty sequence on parse error to follow the Macaw implementation behavior.
      (if (str/starts-with? (str (.getMessage e)) "ParseError")
        []
        (throw e)))))

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
