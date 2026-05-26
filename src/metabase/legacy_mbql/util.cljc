(ns metabase.legacy-mbql.util
  "Utility functions for working with MBQL queries.

  DEPRECATED: Use [[metabase.lib.core]] for MBQL manipulation in all new code."
  {:deprecated "0.57.0"}
  (:refer-clojure :exclude [every? not-empty get-in #?(:clj for)])
  (:require
   [clojure.string :as str]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [every? not-empty get-in #?(:clj for)]]))

(defn mbql-clause?
  "True if `x` is an MBQL clause (a sequence with a keyword as its first arg).

  Deprecated: Use [[metabase.lib.core/clause?]] going forward."
  {:deprecated "0.57.0"}
  [x]
  (and (sequential? x)
       (not (map-entry? x))
       (keyword? (first x))))

(defn is-clause?
  "If `x` is an MBQL clause, and an instance of clauses defined by keyword(s) `k-or-ks`?

    (is-clause? :count [:count 10])        ; -> true
    (is-clause? #{:+ :- :* :/} [:+ 10 20]) ; -> true

  Deprecated: use [[metabase.lib.core/clause-of-type?]] going forward."
  {:deprecated "0.57.0"}
  [k-or-ks x]
  (and
   (mbql-clause? x)
   (if (coll? k-or-ks)
     ((set k-or-ks) (first x))
     (= k-or-ks (first x)))))

(mu/defn normalize-token :- [:or :keyword :string]
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased
  keyword.

  DEPRECATED: use [[metabase.lib.normalize]] going forward to normalize things."
  {:deprecated "0.57.0"}
  [token :- [:or :keyword :string]]
  (let [s (u/qualified-name token)]
    (if (str/starts-with? s "type/")
      ;; TODO (Cam 8/12/25) -- there's tons of code using incorrect parameter types or normalizing base types
      ;; incorrectly, for example [[metabase.actions.models/implicit-action-parameters]]. We need to actually start
      ;; validating parameters against the `:metabase.lib.schema.parameter/parameter` schema. We should probably throw
      ;; an error here instead of silently correcting it... I was going to do that but it broke too many things
      (do
        (log/error "normalize-token should not be getting called on a base type! This probably means we're using a base type in the wrong place, like as a parameter type")
        (keyword s))
      #_{:clj-kondo/ignore [:discouraged-var]}
      (-> s
          #?(:clj u/lower-case-en :cljs str/lower-case)
          (str/replace \_ \-)
          keyword))))

(declare field-options)

(mu/defn query->source-table-id :- [:maybe ::lib.schema.id/table]
  "Return the source Table ID associated with `query`, if applicable; handles nested queries as well. If `query` is
  `nil`, returns `nil`.

  Throws an Exception when it encounters a unresolved source query (i.e., the `:source-table \"card__id\"`
  form), because it cannot return an accurate result for a query that has not yet been preprocessed.

  Prefer [[metabase.lib.core/source-table-id]] going forward."
  {:arglists '([outer-query]), :deprecated "0.57.0"}
  [{{source-table-id :source-table, source-query :source-query} :query, query-type :type, :as query} :- [:maybe :map]]
  (cond
    ;; for native queries, there's no source table to resolve
    (not= query-type :query)
    nil

    ;; for MBQL queries with a *native* source query, it's the same story
    (and (nil? source-table-id) source-query (:native source-query))
    nil

    ;; for MBQL queries with an MBQL source query, recurse on the source query and try again
    (and (nil? source-table-id) source-query)
    (recur (assoc query :query source-query))

    ;; if ID is a `card__id` form that can only mean we haven't preprocessed the query and resolved the source query.
    ;; This is almost certainly an accident, so throw an Exception so we can make the proper fixes
    ((every-pred string? (partial re-matches mbql.s/source-table-card-id-regex)) source-table-id)
    (throw
     (ex-info
      (i18n/tru "Error: query''s source query has not been resolved. You probably need to `preprocess` the query first.")
      {}))

    ;; otherwise resolve the source Table
    :else
    source-table-id))

(mu/defn expression-with-name :- ::mbql.s/FieldOrExpressionDef
  "Return the expression referenced by a given `expression-name`."
  {:deprecated "0.57.0"}
  [inner-query expression-name :- ::lib.schema.common/non-blank-string]
  (loop [{:keys [expressions source-query]} inner-query, found #{}]
    (when (seq expressions)
      (assert (every? string? (keys expressions))
              (str ":expressions should always use string keys, got: " (pr-str expressions))))
    (or
     ;; look for`expression-name` in `expressions`
     (get expressions expression-name)
     ;; otherwise, if we have a source query recursively look in that (do we allow that??)
     (let [found (into found (keys expressions))]
       (if source-query
         (recur source-query found)
         ;; failing that throw an Exception with detailed info about what we tried and what the actual expressions
         ;; were
         (throw (ex-info (i18n/tru "No expression named ''{0}''" (u/qualified-name expression-name))
                         {:type            :invalid-query
                          :expression-name expression-name
                          :tried           expression-name
                          :found           found})))))))

(mu/defn aggregation-at-index :- ::mbql.s/Aggregation
  "Fetch the aggregation at index. This is intended to power aggregate field references (e.g. [:aggregation 0]).
   This also handles nested queries, which could be potentially ambiguous if multiple levels had aggregations. To
   support nested queries, you'll need to keep tract of how many `:source-query`s deep you've traveled; pass in this
   number to as optional arg `nesting-level` to make sure you reference aggregations at the right level of nesting."
  {:deprecated "0.57.0"}
  ([query index]
   (aggregation-at-index query index 0))

  ([query         :- ::mbql.s/Query
    index         :- nat-int?
    nesting-level :- nat-int?]
   (if (zero? nesting-level)
     (or (nth (get-in query [:query :aggregation]) index)
         (throw (ex-info (i18n/tru "No aggregation at index: {0}" index) {:index index})))
     ;; keep recursing deeper into the query until we get to the same level the aggregation reference was defined at
     (recur {:query (get-in query [:query :source-query])} index (dec nesting-level)))))

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

(defn field-options
  "Returns options in a `:field`, `:expression`, or `:aggregation` clause.

  DEPRECATED: Use MBQL 5 + [[metabase.lib.core/options]] going forward."
  {:deprecated "0.57.0"}
  [[_ _ opts]]
  opts)

(mu/defn update-field-options :- ::mbql.s/Reference
  "Like [[clojure.core/update]], but for the options in a `:field`, `:expression`, or `:aggregation` clause.

  DEPRECATED: Use MBQL 5 + [[metabase.lib.core/update-options]] going forward."
  {:arglists '([field-or-ag-ref-or-expression-ref f & args]), :deprecated "0.57.0"}
  [[clause-type id-or-name opts] :- ::mbql.s/Reference f & args]
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

(defn with-temporal-unit
  "Set the `:temporal-unit` of a `:field` clause to `unit`.

  DEPRECATED -- use [[metabase.lib.core/with-temporal-bucket]] in new code."
  {:deprecated "0.57.0"}
  [[_ _ {:keys [base-type]} :as clause] unit]
  ;; it doesn't make sense to call this on an `:expression` or `:aggregation`.
  (assert (is-clause? :field clause))
  (if (or (not base-type)
          (lib.schema.ref/valid-temporal-unit-for-base-type? base-type unit))
    (assoc-field-options clause :temporal-unit unit)
    (do
      (log/warnf "%s is not a valid temporal unit for %s; not adding to clause %s" unit base-type (pr-str clause))
      clause)))
