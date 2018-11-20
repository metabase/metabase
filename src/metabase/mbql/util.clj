(ns metabase.mbql.util
  "Utilitiy functions for working with MBQL queries."
  (:refer-clojure :exclude [replace])
  (:require [clojure.string :as str]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util.match :as mbql.match]
            [metabase.util :as u]
            [metabase.util
             [date :as du]
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]))

(s/defn normalize-token :- s/Keyword
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased
  keyword."
  [token :- su/KeywordOrString]
  (-> (u/keyword->qualified-name token)
      str/lower-case
      (str/replace #"_" "-")
      keyword))

(defn mbql-clause?
  "True if `x` is an MBQL clause (a sequence with a keyword as its first arg). (Since this is used by the code in
  `normalize` this handles pre-normalized clauses as well.)"
  [x]
  (and (sequential? x)
       (keyword? (first x))))

(defn is-clause?
  "If `x` an MBQL clause, and an instance of clauses defined by keyword(s) `k-or-ks`?

    (is-clause? :count [:count 10])        ; -> true
    (is-clause? #{:+ :- :* :/} [:+ 10 20]) ; -> true"
  [k-or-ks x]
  (and
   (mbql-clause? x)
   (if (coll? k-or-ks)
     ((set k-or-ks) (first x))
     (= k-or-ks (first x)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Match & Replace                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmacro match
  "Return a sequence of things that match a `pattern` or `patterns` inside `x`, presumably a query, returning `nil` if
  there are no matches. Recurses through maps and sequences. `pattern` can be one of several things:

  *  Keyword name of an MBQL clause
  *  Set of keyword names of MBQL clauses. Matches any clauses with those names
  *  A `core.match` pattern
  *  A symbol naming a class.
  *  A symbol naming a predicate function
  *  `_`, which will match anything

  Examples:

    ;; keyword pattern
    (match {:fields [[:field-id 10]]} :field-id) ; -> [[:field-id 10]]

    ;; set of keywords
    (match some-query #{:field-id :fk->}) ; -> [[:field-id 10], [:fk-> [:field-id 10] [:field-id 20]], ...]

    ;; `core.match` patterns:
    ;; match any `:field-id` clause with one arg (which should be all of them)
    (match some-query [:field-id _])
    (match some-query [:field-id (_ :guard #(> % 100))]) ; -> [[:field-id 200], ...]

    ;; symbol naming a Class
    ;; match anything that is an instance of that class
    (match some-query java.util.Date) ; -> [[#inst \"2018-10-08\", ...]

    ;; symbol naming a predicate function
    ;; match anything that satisfies that predicate
    (match some-query (every-pred integer? even?)) ; -> [2 4 6 8]

    ;; match anything with `_`
    (match 100 `_`) ; -> 100


  ### Using `core.match` patterns

  See [`core.match` documentation](`https://github.com/clojure/core.match/wiki/Overview`) for more details.

  Pattern-matching works almost exactly the way it does when using `core.match/match` directly, with a few
  differences:

  *  `mbql.util/match` returns a sequence of everything that matches, rather than the first match it finds

  *  patterns are automatically wrapped in vectors for you when appropriate

  *  things like keywords and classes are automatically converted to appropriate patterns for you

  *  this macro automatically recurses through sequences and maps as a final `:else` clause. If you don't want to
     automatically recurse, use a catch-all pattern (such as `_`). Our macro implementation will optimize out this
     `:else` clause if the last pattern is `_`

  ### Returing something other than the exact match with result body

  By default, `match` returns whatever matches the pattern you pass in. But what if you only want to return part of
  the match? You can, using `core.match` binding facilities. Bind relevant things in your pattern and pass in the
  optional result body. Whatever result body returns will be returned by `match`:

     ;; just return the IDs of Field ID clauses
     (match some-query [:field-id id] id) ; -> [1 2 3]

  You can also use result body to filter results; any `nil` values will be skipped:

    (match some-query [:field-id id]
      (when (even? id)
        id))
    ;; -> [2 4 6 8]

  Of course, it's more efficient to let `core.match` compile an efficient matching function, so prefer using
  patterns with `:guard` where possible.

  You can also call `recur` inside result bodies, to use the same matching logic against a different value.
  0
  ### `&match` and `&parents` anaphors

  For more advanced matches, like finding `:field-id` clauses nested anywhere inside `:datetime-field` clauses,
  `match` binds a pair of anaphors inside the result body for your convenience. `&match` is bound to the entire
  match, regardless of how you may have destructured it; `&parents` is bound to a sequence of keywords naming the
  parent top-level keys and clauses of the match.

    (mbql.u/match {:fields [[:datetime-field [:fk-> [:field-id 1] [:field-id 2]] :day]]} :field-id
      ;; &parents will be [:fields :datetime-field :fk->]
      (when (contains? (set &parents) :datetime-field)
        &match))
    ;; -> [[:field-id 1] [:field-id 2]]"
  {:style/indent 1}
  [x & patterns-and-results]
  ;; Actual implementation of these macros is in `mbql.util.match`. They're in a seperate namespace because they have
  ;; lots of other functions and macros they use for their implementation (which means they have to be public) that we
  ;; would like to discourage you from using directly.
  `(mbql.match/match ~x ~patterns-and-results))

(defmacro match-one
  "Like `match` but returns a single match rather than a sequence of matches."
  {:style/indent 1}
  [x & patterns-and-results]
  `(first (mbql.match/match ~x ~patterns-and-results)))


(defmacro replace
  "Like `match`, but replace matches in `x` with the results of result body. The same pattern options are supported,
  and `&parents` and `&match` anaphors are available in the same way. (`&match` is particularly useful here if you
  want to use keywords or sets of keywords as patterns.)"
  {:style/indent 1}
  [x & patterns-and-results]
  ;; as with `match` actual impl is in `match` namespace to discourage you from using the constituent functions and
  ;; macros that power this macro directly
  `(mbql.match/replace ~x ~patterns-and-results))

(defmacro replace-in
  "Like `replace`, but only replaces things in the part of `x` in the keypath `ks` (i.e. the way to `update-in` works.)"
  {:style/indent 2}
  [x ks & patterns-and-results]
  `(let [form# ~x
         ks#   ~ks]
     (if-not (seq (get-in form# ks#))
       form#
       (update-in form# ks# #(mbql.match/replace % ~patterns-and-results)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Functions for manipulating queries                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- combine-compound-filters-of-type [compound-type subclauses]

  (mapcat #(match-one %
             [(_ :guard (partial = compound-type)) & args]
             args

             _
             [&match])
          subclauses))

(s/defn simplify-compound-filter :- (s/maybe mbql.s/Filter)
  "Simplify compound `:and`, `:or`, and `:not` compound filters, combining or eliminating them where possible. This
  also fixes theoretically disallowed compound filters like `:and` with only a single subclause, and eliminates `nils`
  and duplicate subclauses from the clauses."
  [filter-clause]
  (replace filter-clause
    seq? (recur (vec &match))

    ;; if this an an empty filter, toss it
    nil                                  nil
    [& (_ :guard (partial every? nil?))] nil
    []                                   nil
    [(:or :and :or)]                     nil

    ;; if the COMPOUND clause contains any nils, toss them
    [(clause-name :guard #{:and :or}) & (args :guard (partial some nil?))]
    (recur (apply vector clause-name (filterv some? args)))

    ;; Rewrite a `:not` over `:and` using de Morgan's law
    [:not [:and & args]]
    (recur (apply vector :or (map #(vector :not %) args)))

    ;; Rewrite a `:not` over `:or` using de Morgan's law
    [:not [:or & args]]
    (recur (apply vector :and (map #(vector :not %) args)))

    ;; for `and` or `not` compound filters with only one subclase, just unnest the subclause
    [(:or :and :or) arg] (recur arg)

    ;; for `and` and `not` compound filters with subclauses of the same type pull up any compounds of the same type
    ;; e.g. [:and :a [:and b c]] ; -> [:and a b c]
    [:and & (args :guard (partial some (partial is-clause? :and)))]
    (recur (apply vector :and (combine-compound-filters-of-type :and args)))

    [:or & (args :guard (partial some (partial is-clause? :or)))]
    (recur (apply vector :or (combine-compound-filters-of-type :or args)))

    ;; for `and` or `or` clauses with duplicate args, remove the duplicates and recur
    [(clause :guard #{:and :or}) & (args :guard #(not (apply distinct? %)))]
    (recur (apply vector clause (distinct args)))

    ;; for `not` that wraps another `not`, eliminate both
    [:not [:not arg]]
    (recur arg)

    :else
    filter-clause))

(s/defn combine-filter-clauses :- mbql.s/Filter
  "Combine two filter clauses into a single clause in a way that minimizes slapping a bunch of `:and`s together if
  possible."
  [filter-clause & more-filter-clauses]
  (simplify-compound-filter (cons :and (cons filter-clause more-filter-clauses))))

(s/defn add-filter-clause :- mbql.s/Query
  "Add an additional filter clause to an `outer-query`. If `new-clause` is `nil` this is a no-op."
  [outer-query :- mbql.s/Query, new-clause :- (s/maybe mbql.s/Filter)]
  (if-not new-clause
    outer-query
    (update-in outer-query [:query :filter] combine-filter-clauses new-clause)))


(s/defn query->source-table-id :- (s/maybe su/IntGreaterThanZero)
  "Return the source Table ID associated with `query`, if applicable; handles nested queries as well. If `query` is
  `nil`, returns `nil`.

  Throws an Exception when it encounters a unresolved source query (i.e., the `:source-table \"card__id\"`
  form), because it cannot return an accurate result for a query that has not yet been preprocessed."
  {:arglists '([outer-query])}
  [{{source-table-id :source-table, source-query :source-query} :query, query-type :type, :as query}]
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
     (Exception.
      (str
       (tru "Error: query''s source query has not been resolved. You probably need to `preprocess` the query first."))))

    ;; otherwise resolve the source Table
    :else
    source-table-id))

(s/defn unwrap-field-clause :- (s/if (partial is-clause? :field-id)
                                 mbql.s/field-id
                                 mbql.s/field-literal)
  "Un-wrap a `Field` clause and return the lowest-level clause it wraps, either a `:field-id` or `:field-literal`."
  [[clause-name x y, :as clause] :- mbql.s/Field]
  ;; TODO - could use `match` to do this
  (case clause-name
    :field-id         clause
    :fk->             (recur y)
    :field-literal    clause
    :datetime-field   (recur x)
    :binning-strategy (recur x)))

(defn maybe-unwrap-field-clause
  "Unwrap a Field `clause`, if it's something that can be unwrapped (i.e. something that is, or wraps, a `:field-id` or
  `:field-literal`). Otherwise return `clause` as-is."
  [clause]
  (if (is-clause? #{:field-id :fk-> :field-literal :datetime-field :binning-strategy} clause)
    (unwrap-field-clause clause)
    clause))

(s/defn field-clause->id-or-literal :- (s/cond-pre su/IntGreaterThanZero su/NonBlankString)
  "Get the actual Field ID or literal name this clause is referring to. Useful for seeing if two Field clauses are
  referring to the same thing, e.g.

    (field-clause->id-or-literal [:datetime-field [:field-id 100] ...]) ; -> 100
    (field-clause->id-or-literal [:field-id 100])                       ; -> 100

  For expressions (or any other clauses) this returns the clause as-is, so as to facilitate the primary use case of
  comparing Field clauses."
  [clause :- mbql.s/Field]
  (second (unwrap-field-clause clause)))

(s/defn add-order-by-clause :- mbql.s/Query
  "Add a new `:order-by` clause to an MBQL query. If the new order-by clause references a Field that is already being
  used in another order-by clause, this function does nothing."
  [outer-query :- mbql.s/Query, [_ field, :as order-by-clause] :- mbql.s/OrderBy]
  (let [existing-fields (set (for [[_ existing-field] (-> outer-query :query :order-by)]
                               (maybe-unwrap-field-clause existing-field)))]
    (if (existing-fields (maybe-unwrap-field-clause field))
      ;; Field already referenced, nothing to do
      outer-query
      ;; otherwise add new clause at the end
      (update-in outer-query [:query :order-by] (comp vec conj) order-by-clause))))


(s/defn add-datetime-units :- mbql.s/DateTimeValue
  "Return a `relative-datetime` clause with `n` units added to it."
  [absolute-or-relative-datetime :- mbql.s/DateTimeValue
   n                             :- s/Num]
  (if (is-clause? :relative-datetime absolute-or-relative-datetime)
    (let [[_ original-n unit] absolute-or-relative-datetime]
      [:relative-datetime (+ n original-n) unit])
    (let [[_ timestamp unit] absolute-or-relative-datetime]
      [:absolute-datetime (du/relative-date unit n timestamp) unit])))


(defn dispatch-by-clause-name-or-class
  "Dispatch function perfect for use with multimethods that dispatch off elements of an MBQL query. If `x` is an MBQL
  clause, dispatches off the clause name; otherwise dispatches off `x`'s class."
  [x]
  (if (mbql-clause? x)
    (first x)
    (class x)))


(s/defn fk-clause->join-info :- (s/maybe mbql.s/JoinInfo)
  "Return the matching info about the JOINed for the 'destination' Field in an `fk->` clause, for the current level of
  nesting (`0` meaning this `fk->` clause was found in the top-level query; `1` meaning it was found in the first
  `source-query`, and so forth.)

     (fk-clause->join-info query [:fk-> [:field-id 1] [:field-id 2]] 0)
     ;; -> \"orders__via__order_id\""
  [query :- mbql.s/Query, nested-query-level :- su/NonNegativeInt, [_ source-field-clause :as fk-clause] :- mbql.s/fk->]
  ;; if we're dealing with something that's not at the top-level go ahead and recurse a level until we get to the
  ;; query we want to work with
  (if (pos? nested-query-level)
    (recur {:query (or (get-in query [:query :source-query])
                       (throw (Exception. (str (tru "Bad nested-query-level: query does not have a source query")))))}
           (dec nested-query-level)
           fk-clause)
    ;; ok, when we've reached the right level of nesting, look in `:join-tables` to find the appropriate info
    (let [source-field-id (field-clause->id-or-literal source-field-clause)]
      (some (fn [{:keys [fk-field-id], :as info}]
              (when (= fk-field-id source-field-id)
                info))
            (-> query :query :join-tables)))))


(s/defn expression-with-name :- mbql.s/FieldOrExpressionDef
  "Return the `Expression` referenced by a given `expression-name`."
  [query :- mbql.s/Query, expression-name :- su/NonBlankString]
  (or (get-in query, [:query :expressions (keyword expression-name)])
      (throw (Exception. (str (tru "No expression named ''{0}''" (name expression-name)))))))


(s/defn aggregation-at-index :- mbql.s/Aggregation
  "Fetch the aggregation at index. This is intended to power aggregate field references (e.g. [:aggregation 0]).
   This also handles nested queries, which could be potentially ambiguous if multiple levels had aggregations. To
   support nested queries, you'll need to keep tract of how many `:source-query`s deep you've traveled; pass in this
   number to as optional arg `nesting-level` to make sure you reference aggregations at the right level of nesting."
  ([query index]
   (aggregation-at-index query index 0))
  ([query :- mbql.s/Query, index :- su/NonNegativeInt, nesting-level :- su/NonNegativeInt]
   (if (zero? nesting-level)
     (or (nth (get-in query [:query :aggregation]) index)
         (throw (Exception. (str (tru "No aggregation at index: {0}" index)))))
     ;; keep recursing deeper into the query until we get to the same level the aggregation reference was defined at
     (recur {:query (get-in query [:query :source-query])} index (dec nesting-level)))))

(defn ga-id?
  "Is this ID (presumably of a Metric or Segment) a GA one?"
  [id]
  (boolean
   (when ((some-fn string? keyword?) id)
     (re-find #"^ga(id)?:" (name id)))))

(defn ga-metric-or-segment?
  "Is this metric or segment clause not a Metabase Metric or Segment, but rather a GA one? E.g. something like `[:metric
  ga:users]`. We want to ignore those because they're not the same thing at all as MB Metrics/Segments and don't
  correspond to objects in our application DB."
  [[_ id]]
  (ga-id? id))

(defn datetime-field?
  "Is `field` used to record something date or time related, i.e. does `field` have a base type or special type that
  derives from `:type/DateTime`?

  For historical reasons `:type/Time` derivies from `:type/DateTime`, meaning this function will still return true for
  Fields that record only time. You can use `datetime-but-not-time-field?` instead if you want to exclude time
  Fields."
  [field]
  (or (isa? (:base_type field)    :type/DateTime)
      (isa? (:special_type field) :type/DateTime)))

(defn time-field?
  "Is `field` used to record a time of day (e.g. hour/minute/second), but not the date itself? i.e. does `field` have a
  base type or special type that derives from `:type/Time`?"
  [field]
  (or (isa? (:base_type field)    :type/Time)
      (isa? (:special_type field) :type/Time)))

(defn datetime-but-not-time-field?
  "Is `field` used to record a specific moment in time, i.e. does `field` have a base type or special type that derives
  from `:type/DateTime` but not `:type/Time`?"
  [field]
  (and (datetime-field? field)
       (not (time-field? field))))


;;; --------------------------------- Unique names & transforming ags to have names ----------------------------------

(s/defn uniquify-names :- (s/constrained [s/Str] distinct? "sequence of unique strings")
  "Make the names in a sequence of string names unique by adding suffixes such as `_2`.

     (uniquify-names [\"count\" \"sum\" \"count\" \"count_2\"])
     ;; -> [\"count\" \"sum\" \"count_2\" \"count_2_2\"]"
  [names :- [s/Str]]
  (let [aliases     (atom {})
        unique-name (fn [original-name]
                      (let [total-count (get (swap! aliases update original-name #(if % (inc %) 1))
                                             original-name)]
                        (if (= total-count 1)
                          original-name
                          (recur (str original-name \_ total-count)))))]
    (map unique-name names)))

(def ^:private NamedAggregationsWithUniqueNames
  (s/constrained [mbql.s/named] #(distinct? (map last %)) "sequence of named aggregations with unique names"))

(s/defn uniquify-named-aggregations :- NamedAggregationsWithUniqueNames
  "Make the names of a sequence of named aggregations unique by adding suffixes such as `_2`."
  [named-aggregations :- [mbql.s/named]]
  (map (fn [[_ ag] unique-name]
         [:named ag unique-name])
       named-aggregations
       (uniquify-names (map last named-aggregations))))

(s/defn pre-alias-aggregations :- [mbql.s/named]
  "Wrap every aggregation clause in a `:named` clause, using the name returned by `(aggregation->name-fn ag-clause)`
  as names for any clauses that are not already wrapped in `:name`.

    (pre-alias-aggregations annotate/aggregation-name [[:count] [:count] [:named [:sum] \"Sum-41\"]])
    ;; -> [[:named [:count] \"count\"]
           [:named [:count] \"count\"]
           [:named [:sum [:field-id 1]] \"Sum-41\"]]

  Most often, `aggregation->name-fn` will be something like `annotate/aggregation-name`, but for purposes of keeping
  the `metabase.mbql` module seperate from the `metabase.query-processor` code we'll let you pass that in yourself."
  {:style/indent 1}
  [aggregation->name-fn :- (s/pred fn?), aggregations :- [mbql.s/Aggregation]]
  (replace aggregations
    [:named ag ag-name]       [:named ag ag-name]
    [(_ :guard keyword?) & _] [:named &match (aggregation->name-fn &match)]))

(s/defn pre-alias-and-uniquify-aggregations :- NamedAggregationsWithUniqueNames
  "Wrap every aggregation clause in a `:named` clause with a unique name. Combines `pre-alias-aggregations` with
  `uniquify-named-aggregations`."
  {:style/indent 1}
  [aggregation->name-fn :- (s/pred fn?), aggregations :- [mbql.s/Aggregation]]
  (-> (pre-alias-aggregations aggregation->name-fn aggregations)
      uniquify-named-aggregations))
