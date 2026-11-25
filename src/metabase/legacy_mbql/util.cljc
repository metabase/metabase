(ns metabase.legacy-mbql.util
  "Utility functions for working with MBQL queries.

  DEPRECATED: Use [[metabase.lib.core]] for MBQL manipulation in all new code."
  {:deprecated "0.57.0"}
  (:refer-clojure :exclude [not-empty #?(:clj for)])
  (:require
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [not-empty #?(:clj for)]]))

(defn query->max-rows-limit
  "Calculate the absolute maximum number of results that should be returned by this query (MBQL or native), useful for
  doing the equivalent of

    java.sql.Statement statement = ...;
    statement.setMaxRows(<max-rows-limit>).

  to ensure the DB cursor or equivalent doesn't fetch more rows than will be consumed.

  This is calculated as follows:

  *  If query is `MBQL` and has a `:limit` or `:page` clause, returns appropriate number
  *  If query has `:constraints` with `:max-results-bare-rows` or `:max-results`, returns the appropriate number
     *  `:max-results-bare-rows` is returned if set and Query does not have any aggregations
     *  `:max-results` is returned otherwise
  *  If none of the above are set, returns `nil`. In this case, you should use something like the Metabase QP's
     `max-rows-limit`

  DEPRECATED: this will be removed in the near future. Prefer [[metabase.lib.limit/max-rows-limit]] for new code."
  {:deprecated "0.57.0"}
  [{{:keys [max-results max-results-bare-rows]}                      :constraints
    {limit :limit, aggregations :aggregation, {:keys [items]} :page} :query
    query-type                                                       :type}]
  (let [mbql-limit        (when (= query-type :query)
                            (u/safe-min items limit))
        constraints-limit (or
                           (when-not aggregations
                             max-results-bare-rows)
                           max-results)]
    (u/safe-min mbql-limit constraints-limit)))

(defn- remove-empty [x]
  (cond
    (map? x)
    (not-empty (into {} (for [[k v] x
                              :let  [v (remove-empty v)]
                              :when (some? v)]
                          [k v])))

    (sequential? x)
    (not-empty (into (empty x) (filter some? (map remove-empty x))))

    :else
    x))

(mu/defn update-field-options :- ::mbql.s/Reference
  "Like [[clojure.core/update]], but for the options in a `:field`, `:expression`, or `:aggregation` clause.

  DEPRECATED: Use MBQL 5 + [[metabase.lib.core/update-options]] going forward."
  {:arglists '([field-or-ag-ref-or-expression-ref f & args]), :deprecated "0.57.0"}
  [[clause-type id-or-name opts] :- ::mbql.s/Reference
   f                             :- ifn?
   & args                        :- [:* [:or ::lib.schema.common/clause-arg fn?]]]
  (let [opts (not-empty (remove-empty (apply f opts args)))]
    ;; `:field` clauses should have a `nil` options map if there are no options. `:aggregation` and `:expression`
    ;; should get the arg removed if it's `nil` or empty. (For now. In the future we may change this if we make the
    ;; 3-arg versions the "official" normalized versions.)
    (cond
      opts                   [clause-type id-or-name opts]
      (= clause-type :field) [clause-type id-or-name nil]
      :else                  [clause-type id-or-name])))

(defn assoc-field-options
  "Like [[clojure.core/assoc]], but for the options in a `:field`, `:expression`, or `:aggregation` clause.

  DEPRECATED: Use MBQL 5 + [[metabase.lib.core/update-options]] going forward."
  {:deprecated "0.57.0"}
  [clause & kvs]
  (apply update-field-options clause assoc kvs))
