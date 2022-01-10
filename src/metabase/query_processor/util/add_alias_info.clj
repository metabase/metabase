(ns metabase.query-processor.util.add-alias-info
  (:require [clojure.walk :as walk]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(defn- remove-namespaced-options [options]
  (not-empty (into {}
                   (remove (fn [[k _]]
                             (when (keyword? k)
                               (namespace k))))
                   options)))

(s/defn normalize-clause :- mbql.s/FieldOrAggregationReference
  "Normalize a `:field`/`:expression`/`:aggregation` clause by removing extra info so it can serve as a key for
  `:qp/refs`."
  [clause :- mbql.s/FieldOrAggregationReference]
  (mbql.u/match-one clause
    :field
    (mbql.u/update-field-options &match (comp remove-namespaced-options
                                              #_remove-default-temporal-unit
                                              #(dissoc % :source-field)))

    ;; for `:expression` and `:aggregation` references, remove the options map if they are empty.
    [:expression expression-name opts]
    (if-let [opts (not-empty (remove-namespaced-options opts))]
      [:expression expression-name opts]
      [:expression expression-name])

    [:aggregation index opts]
    (if-let [opts (remove-namespaced-options opts)]
      [:aggregation index opts]
      [:aggregation index])

    _
    &match))

(defn- clause-options [clause]
  (mbql.u/match-one clause
    [:field _ opts]       opts
    [:expression _ opts]  opts
    [:aggregation _ opts] opts))

(s/defn ^:private selected-clauses :- {mbql.s/FieldOrAggregationReference su/IntGreaterThanOrEqualToZero}
  "Get all the clauses that are returned by this level of the query as a map of normalized-clause -> index of that column
  in the results."
  [{:keys [fields breakout aggregation]}]
  (into
   {}
   (comp cat
         (map-indexed
          (fn [i clause]
            [(normalize-clause clause) i])))
   [breakout
    (map-indexed
     (fn [i ag]
       (mbql.u/replace ag
         [:aggregation-options wrapped opts]
         [:aggregation i]

         ;; aggregation clause should be preprocessed into an `:aggregation-options` clause by now.
         _
         (throw (ex-info (tru "Expected :aggregation-options clause, got {0}" (pr-str ag))
                         {:type qp.error-type/qp, :clause ag}))))
     aggregation)
    fields]))

(defn- exports [query]
  (into #{} (mbql.u/match (dissoc query :source-query :source-metadata)
              [(_ :guard #{:field :expression :aggregation}) _ (_ :guard (every-pred map? ::position))])))

(defn- join-with-alias [{:keys [joins]} join-alias]
  (some (fn [join]
          (when (= (:alias join) join-alias)
            join))
        joins))

(defn- matching-join-source-clause [source-query clause]
  (when-let [{:keys [join-alias], :as opts} (clause-options clause)]
    (when join-alias
      (when-let [matching-join-source-query (:source-query (join-with-alias source-query join-alias))]
        (some (fn [a-clause]
                (when (= (mbql.u/update-field-options (normalize-clause clause) dissoc :join-alias)
                         (mbql.u/update-field-options (normalize-clause a-clause) dissoc :join-alias))
                  a-clause))
         (exports matching-join-source-query))))))

(defn- add-alias-info* [{:keys [source-table joins], aggregations :aggregation, :as inner-query}]
  (assert (not (:strategy inner-query)) "add-alias-info* should not be called on a join") ; not user-facing
  (let [this-level-joins (into #{} (map :alias) joins)
        clause->position (comp (selected-clauses inner-query) normalize-clause)
        unique-name      (mbql.u/unique-name-generator)
        position->alias* (atom {})
        position->alias  (fn [position original-alias]
                           (or (get @position->alias* position)
                               (let [unique-alias (unique-name original-alias)]
                                 (swap! position->alias* assoc position unique-alias)
                                 unique-alias)))]
    (mbql.u/replace inner-query
      ;; don't rewrite anything inside any source queries or source metadata.
      (_ :guard (constantly (some (partial contains? (set &parents))
                                  [:source-query :source-metadata])))
      &match

      [:field id-or-name opts]
      (let [field                       (when (integer? id-or-name)
                                          (qp.store/field id-or-name))
            field-name                  (or #_(::source-alias opts)
                                            (:name field)
                                            (when (string? id-or-name)
                                              id-or-name))
            table-id                    (:table_id field)
            {:keys [join-alias]}        opts
            join-is-this-level?         (some-> join-alias this-level-joins)
            matching-join-source-clause (matching-join-source-clause inner-query &match)
            join-desired-alias          (some-> matching-join-source-clause clause-options ::desired-alias)
            table                       (cond
                                          join-is-this-level?                      join-alias
                                          (and table-id (= table-id source-table)) table-id
                                          :else                                    ::source)
            source-alias                (cond
                                          (and join-alias (not join-is-this-level?))   (format "%s__%s" join-alias field-name)
                                          (and join-is-this-level? join-desired-alias) join-desired-alias
                                          :else                                        field-name)
            desired-alias               (if join-alias
                                          (format "%s__%s" join-alias (or join-desired-alias field-name))
                                          field-name)]
        [:field id-or-name (merge opts
                                  {::source-table table
                                   ::source-alias source-alias}
                                  (when-let [position (clause->position &match)]
                                    {::desired-alias (position->alias position desired-alias)
                                     ::position      position}))])

      [:aggregation index & more]
      (let [position (clause->position &match)
            [opts]   more]
        (when-not position
          (throw (ex-info (tru "Aggregation does not exist at index {0}" index)
                          {:type   qp.error-type/invalid-query
                           :clause &match
                           :path   &parents
                           :query  inner-query})))
        (let [[_ ag-name _] (nth aggregations index)]
          [:aggregation index (merge opts
                                     {::desired-alias (position->alias position ag-name)
                                      ::position      position})]))

      [:expression expression-name & more]
      (let [position (clause->position &match)
            [opts]   more]
        [:expression expression-name (merge opts
                                            {::desired-alias expression-name}
                                            (when position
                                              {::desired-alias (position->alias position expression-name)
                                               ::position      position}))]))))

(defn add-alias-info
  "Add extra info to `:field` clauses, `:expression` references, and `:aggregation` references in `query`. `query` must
  be fully preprocessed.

  Adds some or all of the following keys:

  ### `::source-table`

  String name, integer Table ID, or the keyword `::source`. Use this alias to qualify the clause during compilation.
  String names are aliases for joins. `::source` means this clause comes from the `:source-query`; the alias to use is
  theoretically driver-specific but in practice is
  `source` (see [[metabase.driver.sql.query-processor/source-query-alias]]). An integer Table ID means this comes from
  the `:source-table` (either directly or indirectly via one or more `:source-query`s; use the Table's schema and name
  to qualify the clause.

  ### `::source-alias`

  String name to use to refer to this clause during compilation.

  ### `::desired-alias`

  If this clause is 'selected' (i.e., appears in `:fields`, `:aggregation`, or `:breakout`), select the clause `AS`
  this alias. This alias is guaranteed to be unique.

  ### `::position`

  If this clause is 'selected', this is the position the clause will appear in the results (i.e. the corresponding
  column index)."
  [query]
  (walk/postwalk
   (fn [form]
     (if (and (map? form)
              ((some-fn :source-query :source-table) form)
              (not (:strategy form)))
       (add-alias-info* form)
       form))
   query))
