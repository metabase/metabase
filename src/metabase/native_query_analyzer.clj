(ns metabase.native-query-analyzer
  "Integration with Macaw, which parses native SQL queries. All SQL-specific logic is in Macaw, the purpose of this
  namespace is to:

  1. Translate Metabase-isms into generic SQL that Macaw can understand.
  2. Contain Metabase-specific business logic.

  The primary way of interacting with parsed queries is through their associated QueryFields (see model
  file). QueryFields are maintained through the `update-query-fields-for-card!` function. This is invoked as part of
  the lifecycle of a card (see Card model).

  Query rewriting happens with the `replace-names` function."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [macaw.core :as macaw]
   [metabase.config :as config]
   [metabase.native-query-analyzer.parameter-substitution :as nqa.sub]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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

(defn- field-query
  "Exact match for quoted fields, case-insensitive match for non-quoted fields"
  [field value]
  (if (= (first value) \")
    [:= field (-> value (subs 1 (dec (count value))) (str/replace "\"\"" "\""))]
    [:= [:lower field] (u/lower-case-en value)]))

(defn- table-query
  [t]
  (if-not (:schema t)
    (field-query :t.name (:table t))
    [:and
     (field-query :t.name (:table t))
     (field-query :t.schema (:schema t))]))

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
                                           :where
                                           [:and
                                            [:= :t.db_id db-id]
                                            (into [:or]
                                                  (map (partial column-query tables) columns))]))))

(defn- indirect-field-ids-for-query
  "Similar to direct-field-ids-for-query, but for wildcard selects"
  [{table-wildcard-maps :table-wildcards
    all-wildcard-maps   :has-wildcard?
    table-maps          :tables}
   db-id]
  (let [table-wildcards           (map :component table-wildcard-maps)
        has-wildcard?             (and (seq all-wildcard-maps)
                                       (reduce #(and %1 %2) true (map :component all-wildcard-maps)))
        tables                    (map :component table-maps)
        active-fields-from-tables
        (fn [tables]
          (t2/select-pks-set :model/Field (merge field-and-table-fragment
                                                 {:where [:and
                                                          [:= :t.db_id db-id]
                                                          [:= :f.active true]
                                                          (into [:or] (map table-query tables))]})))]
    (cond
      ;; select * from ...
      ;; so, get everything in all the tables
      (and has-wildcard? (seq tables)) (active-fields-from-tables tables)
      ;; select foo.* from ...
      ;; limit to the named tables
      (seq table-wildcards)            (active-fields-from-tables table-wildcards))))

(defn- field-ids-for-card
  "Returns a `{:direct #{...} :indirect #{...}}` map with field IDs that (may) be referenced in the given cards's
  query. Errs on the side of optimism: i.e., it may return fields that are *not* in the query, and is unlikely to fail
  to return fields that are in the query.

  Direct references are columns that are named in the query; indirect ones are from wildcards. If a field could be
  both direct and indirect, it will *only* show up in the `:direct` set."
  [card]
  (let [query        (:dataset_query card)
        db-id        (:database query)
        sql-string   (:query (nqa.sub/replace-tags query))
        parsed-query (macaw/query->components (macaw/parsed-query sql-string))
        direct-ids   (direct-field-ids-for-query parsed-query db-id)
        indirect-ids (set/difference
                      (indirect-field-ids-for-query parsed-query db-id)
                      direct-ids)]
    {:direct   direct-ids
     :indirect indirect-ids}))

(defn update-query-fields-for-card!
  "Clears QueryFields associated with this card and creates fresh, up-to-date-ones.

  Any card is accepted, but this functionality only works for ones with a native query.

  If you're invoking this from a test, be sure to turn on [[*parse-queries-in-test?*]].

  Returns `nil` (and logs the error) if there was a parse error."
  [{card-id :id, query :dataset_query :as card}]
  (when (and (active?)
             (= :native (:type query)))
    (try
      (let [{:keys [direct indirect]} (field-ids-for-card card)
            id->record                (fn [direct? field-id]
                                        {:card_id          card-id
                                         :field_id         field-id
                                         :direct_reference direct?})
            query-field-records       (concat
                                       (map (partial id->record true) direct)
                                       (map (partial id->record false) indirect))]
        ;; This feels inefficient at first glance, but the number of records should be quite small and doing some sort
        ;; of upsert-or-delete would involve comparisons in Clojure-land that are more expensive than just "killing and
        ;; filling" the records.
        (t2/with-transaction [_conn]
          (t2/delete! :model/QueryField :card_id card-id)
          (t2/insert! :model/QueryField query-field-records)))
      (catch Exception e
        (log/error e "Error parsing native query")))))

;; TODO: does not support template tags
(defn replace-names
  "Returns a modified query with the given table and column renames applied. `renames` is expected to be a map with
  `:tables` and `:columns` keys, and values of the shape `old-name -> new-name`:

  (replace-names \"SELECT o.id, o.total FROM orders o\" {:columns {\"id\" \"pk\"
                                                                   \"total\" \"amount\"}
                                                         :tables {\"orders\" \"purchases\"}})
 ;; => \"SELECT o.pk, o.amount FROM purchases o\""
  [sql-query renames]
  (macaw/replace-names sql-query renames))
