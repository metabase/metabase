(ns metabase.query-analysis.native-query-analyzer
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
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.query-analysis.native-query-analyzer.impl :as nqa.impl]
   [metabase.query-analysis.native-query-analyzer.parameter-substitution :as nqa.sub]
   [metabase.query-analysis.native-query-analyzer.replacement :as nqa.replacement]
   [metabase.util :as u]
   [potemkin :as p]
   [toucan2.core :as t2]))

(comment nqa.replacement/keep-me)

(p/import-vars
 [nqa.replacement replace-names])

(def ^:private field-and-table-fragment
  "HoneySQL fragment to get the Field and Table"
  {:select [[:f.id :field-id] [:f.name :column]
            [:t.id :table-id] [:t.name :table]]
   :from   [[:metabase_field :f]]
   ;; (t2/table-name :model/Table) doesn't work on CI since models/table.clj hasn't been loaded
   :join   [[:metabase_table :t] [:= :table_id :t.id]]})

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

(defn table-reference
  "Used by tests"
  [db-id table]
  (t2/select-one :model/QueryTable
                 {:select [[:t.id :table-id] [:t.name :table]]
                  :from   [[(t2/table-name :model/Table) :t]]
                  :where  [:and
                           [:= :t.db_id db-id]
                           (table-query {:table (name table)})]}))

(defn field-reference
  "Used by tests"
  [db-id table column]
  (t2/select-one :model/QueryField (assoc field-and-table-fragment
                                          :where [:and
                                                  [:= :t.db_id db-id]
                                                  (column-query nil {:table  (name table)
                                                                     :column (name column)})])))

(defn- strip-redundant-refs
  "Strip out duplicate references, and unqualified references that are shadowed by found or qualified ones."
  [references]
  ;; TODO handle schema
  (let [qualified? (into #{} (comp (filter :table) (map :column)) references)]
    (into #{}
          (filter (fn [{:keys [table column]}]
                    (or table (not (qualified? column)))))
          references)))

(defn- strip-redundant-table-refs
  "Strip out duplicate references, and unqualified references that are shadowed by found or qualified ones."
  [references]
  (let [qualified? (into #{} (comp (filter :schema) (map :table)) references)]
    (into #{}
          (filter (fn [{:keys [schema table]}]
                    (or schema (not (qualified? table)))))
          references)))

(defn- consolidate-columns
  "Qualify analyzed columns with the corresponding database IDs, where we are able to resolve them."
  [analyzed-columns database-columns]
  ;; TODO we should handle schema as well
  (let [->tab-key             (comp u/lower-case-en :table)
        ->col-key             (comp u/lower-case-en :column)
        column->records       (group-by ->col-key database-columns)
        table+column->records (group-by (juxt ->tab-key ->col-key) database-columns)]
    (strip-redundant-refs
     (mapcat (fn [{:keys [table column] :as reference}]
               (or (if table
                     (table+column->records [(normalized-key table) (normalized-key column)])
                     (column->records (normalized-key column)))
                   [(update-vals reference strip-quotes)]))
             analyzed-columns))))

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
  [{table-maps :tables} db-id]
  (let [tables (map :component table-maps)]
    (consolidate-tables
     tables
     (t2/select :model/QueryTable
                {:select [[:t.id :table-id] [:t.name :table]]
                 :from   [[(t2/table-name :model/Table) :t]]
                 :where  [:and
                         [:= :t.db_id db-id]
                         (into [:or] (map table-query tables))]}))))

(defn- explicit-field-refs-for-query
  "Given the results of query analysis, return references to the corresponding fields and model outputs."
  [{column-maps :columns table-maps :tables} db-id]
  (let [columns (map :component column-maps)
        tables  (map :component table-maps)]
    (consolidate-columns
     columns
     (t2/select :model/QueryField (assoc field-and-table-fragment
                                         :where [:and
                                                 [:= :t.db_id db-id]
                                                 (into [:or] (map (partial column-query tables) columns))])))))

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

(defn- implicit-references-for-query
  "Similar to explicit-field-ids-for-query, but for wildcard selects"
  [parsed-query db-id]
  (when-let [tables (wildcard-tables parsed-query)]
    (t2/select :model/QueryField (merge field-and-table-fragment
                                        {:where [:and
                                                 [:= :t.db_id db-id]
                                                 [:= :f.active true]
                                                 (into [:or] (map table-query tables))]}))))

(defn- mark-reference [refs explicit?]
  (map #(assoc % :explicit-reference explicit?) refs))

(defn- deduce-or-fetch-table-refs [parsed-query db-id field-refs]
  (let [tables    (map :component (:tables parsed-query))
        implicit? (into #{} (map (juxt :schema :table)) field-refs)]
    (if (every? implicit? (map (juxt :schema :table) tables))
      (distinct (map #(dissoc % :field-id :column) field-refs))
      ;; if any tables are references without referencing any of their columns, we might as well fetch every table
      (table-refs-for-query parsed-query db-id))))

(defn- references-for-sql
  "Returns a `{:explicit #{...} :implicit #{...}}` map with field IDs that (may) be referenced in the given card's
  query. Errs on the side of optimism: i.e., it may return fields that are *not* in the query, and is unlikely to fail
  to return fields that are in the query.

  Explicit references are columns that are named in the query; implicit ones are from wildcards. If a field could be
  both explicit and implicit, it will *only* show up in the `:explicit` set."
  [driver query]
  (let [db-id         (:database query)
        macaw-opts    (nqa.impl/macaw-options driver)
        sql-string    (:query (nqa.sub/replace-tags query))
        parsed-query  (macaw/query->components (macaw/parsed-query sql-string macaw-opts) macaw-opts)
        explicit-refs (explicit-field-refs-for-query parsed-query db-id)
        implicit-refs (set/difference (set (implicit-references-for-query parsed-query db-id))
                                      (set explicit-refs))
        field-refs    (concat (mark-reference explicit-refs true)
                              (mark-reference implicit-refs false))
        table-refs    (deduce-or-fetch-table-refs parsed-query db-id field-refs)]
    {:tables table-refs
     :fields field-refs}))

(defn references-for-native
  "Returns a `{:explicit #{...} :implicit #{...}}` map with field IDs that (may) be referenced in the given card's
  query. Currently only support SQL-based dialects."
  [query]
  (let [driver (driver.u/database->driver (:database query))]
    ;; TODO this approach is not extensible, we need to move to multimethods.
    ;; See https://github.com/metabase/metabase/issues/43516 for long term solution.
    (when (isa? driver/hierarchy driver :sql)
      (references-for-sql driver query))))
