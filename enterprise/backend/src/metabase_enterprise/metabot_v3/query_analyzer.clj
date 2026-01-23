(ns metabase-enterprise.metabot-v3.query-analyzer
  "Integration with Macaw, which parses native SQL queries. All SQL-specific logic is in Macaw, the purpose of this
  namespace is to:

  1. Translate Metabase-isms into generic SQL that Macaw can understand.
  2. Encapsulate Metabase-specific business logic."
  (:require
   [clojure.string :as str]
   [macaw.core :as macaw]
   [metabase-enterprise.metabot-v3.query-analyzer.parameter-substitution :as nqa.sub]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;; NOTE: be careful when adding square braces, as the rules for nesting them are different.
(def ^:private quotes "\"`")

(defn- quote-stripper
  "Construct a function which unquotes values which use the given character as their quote."
  [quote-char]
  (let [doubled (str quote-char quote-char)
        single  (str quote-char)]
    #(-> (subs % 1 (dec (count %)))
         (str/replace doubled single))))

(def ^:private quote->stripper
  "Pre-constructed lambdas, to save some memory allocations."
  (zipmap quotes (map quote-stripper quotes)))

(defn- strip-quotes [value]
  (if-let [f (quote->stripper (first value))]
    (f value)
    value))

(defn- normalized-key [value]
  (u/lower-case-en (strip-quotes value)))

(defn- field-query
  "Exact match for quoted fields, case-insensitive match for non-quoted fields"
  [field value]
  (if-let [f (quote->stripper (first value))]
    [:= field (f value)]
    ;; Technically speaking, this is not correct for all databases.
    ;;
    ;; For example, Oracle treats non-quoted identifiers as uppercase, but still expects a case-sensitive match.
    ;; Similarly, Postgres treats all non-quoted identifiers as lowercase, and again expects an exact match.
    ;; H2 on the other hand will choose whether to cast it to uppercase or lowercase based on a system variable... T_T
    ;;
    ;; MySQL, by contrast, is truly case-insensitive, and as the lowest common denominator it's what we cater for.
    ;; In general, it's a huge anti-pattern to have any identifiers that differ only by case, so this extra leniency is
    ;; unlikely to ever cause issues in practice.
    ;;
    ;; If we want 100% correctness, we can use the Macaw :case-insensitive option here to do the right thing.
    [:= [:lower field] (u/lower-case-en value)]))

(defn- table-query
  [{:keys [schema table]}]
  (if-not schema
    (field-query :t.name table)
    [:and
     (field-query :t.name table)
     (field-query :t.schema schema)]))

(defn table-reference
  "Used by tests"
  ([db-id table]
   (table-reference db-id nil table))
  ([db-id schema table]
   (t2/select-one :model/QueryTable
                  {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
                   :from   [[(t2/table-name :model/Table) :t]]
                   :where  [:and
                            [:= :t.db_id db-id]
                            (table-query {:schema (some-> schema name)
                                          :table (name table)})]})))

(defn- strip-redundant-table-refs
  "Strip out duplicate references, and unqualified references that are shadowed by found or qualified ones."
  [references]
  (let [qualified? (into #{} (comp (filter :schema) (map :table)) references)]
    (into #{}
          (filter (fn [{:keys [schema table]}]
                    (or schema (not (qualified? table)))))
          references)))

(defn- consolidate-tables [analyzed-tables database-tables]
  (let [->schema-key          (comp u/lower-case-en :schema)
        ->table-key           (comp u/lower-case-en :table)
        table->records        (group-by ->table-key database-tables)
        schema+table->records (group-by (juxt ->schema-key ->table-key) database-tables)]
    (strip-redundant-table-refs
     (mapcat (fn [{:keys [schema table] :as reference}]
               (or (if schema
                     (schema+table->records [(normalized-key schema) (normalized-key table)])
                     (table->records (normalized-key table)))
                   [(update-vals reference strip-quotes)]))
             analyzed-tables))))

(defn- table-refs-for-query
  "Given the results of query analysis, return references to the corresponding tables and cards."
  [tables db-id]
  (consolidate-tables
   tables
   (when (seq tables)
     (t2/select :model/QueryTable
                {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
                 :from   [[(t2/table-name :model/Table) :t]]
                 :where  [:and
                          [:= :t.db_id db-id]
                          (into [:or] (map table-query tables))]}))))

(defn- tables-via-macaw
  "Returns a set of table identifiers that (may) be referenced in the given card's query.
  Errs on the side of optimism: i.e., it may return tables that are *not* in the query, and is unlikely to fail
  to return tables that are in the query."
  [driver query & {:keys [mode] :or {mode :compound-select}}]
  (let [db-id      (:database query)
        macaw-opts (driver.u/macaw-options driver)
        table-opts (assoc macaw-opts :mode mode)
        sql-string (:query (nqa.sub/replace-tags query))
        result     (macaw/query->tables sql-string table-opts)]
    (u/update-if-exists result :tables table-refs-for-query db-id)))

;; Keeping this multimethod private for now, need some hammock time on what to expose to drivers.
(defmulti ^:private tables-for-native*
  "Returns a set of table identifiers that (may) be referenced in the given card's query.
  Errs on the side of optimism: i.e., it may return tables that are *not* in the query, and is unlikely to fail
  to return tables that are in the query.

  If it is unable to analyze the query, it should return an error of the form `:query-analysis.error/...`"
  {:arglists '([driver query opts])}
  (fn [driver _query _opts] driver)
  :hierarchy #'driver/hierarchy)

(defmethod tables-for-native* :default
  [_driver _query _opts]
  :query-analysis.error/driver-not-supported)

(defmethod tables-for-native* :sql
  [driver query opts]
  (if (or (:all-drivers-trusted? opts)
          (driver.u/trusted-for-table-permissions? driver))
    (tables-via-macaw driver query opts)
    {:error :query-analysis.error/driver-not-supported}))

(defn tables-for-native
  "Returns a set of table identifiers that (may) be referenced in the given card's query.
  Takes an options :mode option, which determines the complexity of queries it can handle, and what types of false
  positives it may return."
  [query & {:as opts}]
  (let [driver (driver.u/database->driver (:database query))]
    (tables-for-native* driver query opts)))
