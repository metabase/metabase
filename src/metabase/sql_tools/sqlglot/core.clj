^{:clj-kondo/ignore [:metabase/modules]} ;; TODO: remove before merging
(ns metabase.sql-tools.sqlglot.core
  (:require
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.macaw.core :as sql-tools.macaw]
   [metabase.util :as u]
   [metabase.util.log :as log]))

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

;;;; returned-columns
;; SQLGlot returned-columns uses the same pipeline as Macaw:
;; field-references (dispatched to :sqlglot) → resolve-field (Macaw's logic)
(defmethod sql-tools/returned-columns-impl :sqlglot
  [_parser driver query]
  (sql-tools.macaw/returned-columns driver query))

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
