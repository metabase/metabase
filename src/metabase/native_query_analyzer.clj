(ns metabase.native-query-analyzer
  "Integration with Macaw, which parses native SQL queries. All SQL-specific logic is in Macaw, the purpose of this
  namespace is to:

  1. Translate Metabase-isms into generic SQL that Macaw can understand.
  2. Encapsulate Metabase-specific business logic.

  The primary way of interacting with parsed queries is through their associated QueryFields (see model
  file). QueryFields are maintained through the `update-query-fields-for-card!` function. This is invoked as part of
  the lifecycle of a card (see the Card model).

  Query rewriting happens with the `replace-names` function."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [macaw.core :as macaw]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.native-query-analyzer.impl :as nqa.impl]
   [metabase.native-query-analyzer.parameter-substitution :as nqa.sub]
   [metabase.native-query-analyzer.replacement :as nqa.replacement]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [potemkin :as p]
   [toucan2.core :as t2]))

(comment nqa.replacement/keep-me)

(p/import-vars
 [nqa.replacement replace-names])

(def ^:dynamic *parse-queries-in-test?*
  "Normally, a native card's query is parsed on every create/update. For most tests, this is an unnecessary
  expense. Therefore, we skip parsing while testing unless this variable is turned on.

  c.f. [[active?]]"
  false)

(defn- active?
  "Should the query run? Either we're not testing or it's been explicitly turned on.

  c.f. [[*parse-queries-in-test?*]], [[public-settings/sql-parsing-enabled]]"
  []
  (and (public-settings/sql-parsing-enabled)
       (or (not config/is-test?)
           *parse-queries-in-test?*)))

(def ^:private field-and-table-fragment
  "HoneySQL fragment to get the Field and Table"
  {:from [[:metabase_field :f]]
   ;; (t2/table-name :model/Table) doesn't work on CI since models/table.clj hasn't been loaded
   :join [[:metabase_table :t] [:= :table_id :t.id]]})

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

(defn- column-query
  "Generates the query for a column, incorporating its concrete table information (if known) or matching it against
  the provided list of all possible tables."
  [tables column]
  (if (:table column)
    [:and
     (field-query :f.name (:column column))
     (table-query column)]
    [:and
     (field-query :f.name (:column column))
     (into [:or] (map table-query tables))]))

(defn- direct-field-ids-for-query
  "Selects IDs of Fields that could be used in the query"
  [{column-maps :columns table-maps :tables} db-id]
  (let [columns (map :component column-maps)
        tables  (map :component table-maps)]
    (t2/select-pks-set :model/Field (assoc field-and-table-fragment
                                           :where [:and
                                                   [:= :t.db_id db-id]
                                                   (into [:or] (map (partial column-query tables) columns))]))))

(defn- wildcard-tables
  "Given a parsed query, return the list of tables we are selecting from using a wildcard."
  [{table-wildcards :table-wildcards
    all-wildcards   :has-wildcard?
    tables          :tables}]
  (let [has-wildcard? (and (seq all-wildcards) (every? :component all-wildcards))]
    (cond
      ;; select * from ...
      ;; so, get everything in all the tables
      (and has-wildcard? (seq tables)) (map :component tables)
      ;; select foo.* from ...
      ;; limit to the named tables
      (seq table-wildcards)            (map :component table-wildcards))))

(defn- indirect-field-ids-for-query
  "Similar to direct-field-ids-for-query, but for wildcard selects"
  [parsed-query db-id]
  (when-let [tables (wildcard-tables parsed-query)]
    (t2/select-pks-set :model/Field (merge field-and-table-fragment
                                           {:where [:and
                                                    [:= :t.db_id db-id]
                                                    [:= :f.active true]
                                                    (into [:or] (map table-query tables))]}))))

(defn- field-ids-for-sql
  "Returns a `{:direct #{...} :indirect #{...}}` map with field IDs that (may) be referenced in the given card's
  query. Errs on the side of optimism: i.e., it may return fields that are *not* in the query, and is unlikely to fail
  to return fields that are in the query.

  Direct references are columns that are named in the query; indirect ones are from wildcards. If a field could be
  both direct and indirect, it will *only* show up in the `:direct` set."
  [driver query]
  (let [db-id        (:database query)
        macaw-opts   (nqa.impl/macaw-options driver)
        sql-string   (:query (nqa.sub/replace-tags query))
        parsed-query (macaw/query->components (macaw/parsed-query sql-string macaw-opts) macaw-opts)
        direct-ids   (direct-field-ids-for-query parsed-query db-id)
        indirect-ids (set/difference
                      (indirect-field-ids-for-query parsed-query db-id)
                      direct-ids)]
    {:direct   direct-ids
     :indirect indirect-ids}))

(defn field-ids-for-native
  "Returns a `{:direct #{...} :indirect #{...}}` map with field IDs that (may) be referenced in the given card's
  query. Currently only support SQL-based dialects."
  [query]
  (when (and (active?) (:native query))
    (let [driver (driver.u/database->driver (:database query))]
      ;; TODO this approach is not extensible, we need to move to multimethods.
      ;; See https://github.com/metabase/metabase/issues/43516 for long term solution.
      (when (isa? driver/hierarchy driver :sql)
        (field-ids-for-sql driver query)))))
