(ns metabase.mbql.util
  "Utilitiy functions for working with MBQL queries."
  (:refer-clojure :exclude [replace])
  (:require [clojure.string :as str]
            [java-time
             [amount :as t.amount]
             [core :as t.core]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.schema.helpers :as mbql.s.helpers]
            [metabase.mbql.util.match :as mbql.match]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]))

(defn qualified-name
  "Like `name`, but if `x` is a namespace-qualified keyword, returns that a string including the namespace."
  [x]
  (if (and (keyword? x) (namespace x))
    (str (namespace x) "/" (name x))
    (name x)))

(s/defn normalize-token :- s/Keyword
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased
  keyword."
  [token :- su/KeywordOrString]
  (-> (qualified-name token)
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

;; TODO - it would be ultra handy to have a `match-all` function that could handle clauses with recursive matches,
;; e.g. with a query like
;;
;;    {:query {:source-table 1, :joins [{:source-table 2, ...}]}}
;;
;; it would be useful to be able to do
;;
;;
;;    ;; get *all* the source tables
;;    (mbql.u/match-all query
;;      (&match :guard (every-pred map? :source-table))
;;      (:source-table &match))

(defmacro replace
  "Like `match`, but replace matches in `x` with the results of result body. The same pattern options are supported,
  and `&parents` and `&match` anaphors are available in the same way. (`&match` is particularly useful here if you
  want to use keywords or sets of keywords as patterns.)"
  {:style/indent 1}
  [x & patterns-and-results]
  ;; as with `match` actual impl is in `match` namespace to discourage you from using the constituent functions and
  ;; macros that power this macro directly
  `(mbql.match/replace ~x ~patterns-and-results))

(defn update-in-unless-empty
  "Like `update-in`, but only updates in the existing value is non-empty."
  [m ks f & args]
  (if-not (seq (get-in m ks))
    m
    (apply update-in m ks f args)))

(defmacro replace-in
  "Like `replace`, but only replaces things in the part of `x` in the keypath `ks` (i.e. the way to `update-in` works.)"
  {:style/indent 2}
  [x ks & patterns-and-results]
  `(update-in-unless-empty ~x ~ks (fn [x#] (mbql.match/replace x# ~patterns-and-results))))

;; TODO - it would be useful to have something like a `replace-all` function as well


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

(defn simplify-compound-filter
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

(defn desugar-inside
  "Rewrite `:inside` filter clauses as a pair of `:between` clauses."
  [m]
  (replace m
    [:inside lat-field lon-field lat-max lon-min lat-min lon-max]
    [:and
     [:between lat-field lat-min lat-max]
     [:between lon-field lon-min lon-max]]))

(defn desugar-is-null-and-not-null
  "Rewrite `:is-null` and `:not-null` filter clauses as simpler `:=` and `:!=`, respectively."
  [m]
  (replace m
    [:is-null field]  [:=  field nil]
    [:not-null field] [:!= field nil]))

(defn desugar-time-interval
  "Rewrite `:time-interval` filter clauses as simpler ones like `:=` or `:between`."
  [m]
  (replace m
    [:time-interval field n unit] (recur [:time-interval field n unit nil])

    ;; replace current/last/next with corresponding value of n and recur
    [:time-interval field :current unit options] (recur [:time-interval field  0 unit options])
    [:time-interval field :last    unit options] (recur [:time-interval field -1 unit options])
    [:time-interval field :next    unit options] (recur [:time-interval field  1 unit options])

    [:time-interval field (n :guard #{-1}) unit (_ :guard :include-current)]
    [:between [:datetime-field field unit] [:relative-datetime n unit] [:relative-datetime 0 unit]]

    [:time-interval field (n :guard #{1}) unit (_ :guard :include-current)]
    [:between [:datetime-field field unit] [:relative-datetime 0 unit] [:relative-datetime n unit]]

    [:time-interval field (n :guard #{-1 0 1}) unit _]
    [:= [:datetime-field field unit] [:relative-datetime n unit]]

    [:time-interval field (n :guard neg?) unit (_ :guard :include-current)]
    [:between [:datetime-field field unit] [:relative-datetime n unit] [:relative-datetime 0 unit]]

    [:time-interval field (n :guard neg?) unit _]
    [:between [:datetime-field field unit] [:relative-datetime n unit] [:relative-datetime -1 unit]]

    [:time-interval field n unit (_ :guard :include-current)]
    [:between [:datetime-field field unit] [:relative-datetime 0 unit] [:relative-datetime n unit]]

    [:time-interval field n unit _]
    [:between [:datetime-field field unit] [:relative-datetime 1 unit] [:relative-datetime n unit]]))

(defn desugar-does-not-contain
  "Rewrite `:does-not-contain` filter clauses as simpler `:not` clauses."
  [m]
  (replace m
    [:does-not-contain & args]
    [:not (into [:contains] args)]))

(defn desugar-equals-and-not-equals-with-extra-args
  "`:=` and `!=` clauses with more than 2 args automatically get rewritten as compound filters.

     [:= field x y]  -> [:or  [:=  field x] [:=  field y]]
     [:!= field x y] -> [:and [:!= field x] [:!= field y]]"
  [m]
  (replace m
    [:= field x y & more]
    (apply vector :or (for [x (concat [x y] more)]
                        [:= field x]))

    [:!= field x y & more]
    (apply vector :and (for [x (concat [x y] more)]
                         [:!= field x]))))

(defn desugar-current-relative-datetime
  "Replace `relative-datetime` clauses like `[:relative-datetime :current]` with `[:relative-datetime 0 <unit>]`.
  `<unit>` is inferred from the `:datetime-field` the clause is being compared to (if any), otherwise falls back to
  `default.`"
  [m]
  (replace m
    [clause field [:relative-datetime :current & _]]
    [clause field [:relative-datetime 0 (or (match-one field [:datetime-field _ unit] unit)
                                            :default)]]))

(s/defn desugar-filter-clause :- mbql.s/Filter
  "Rewrite various 'syntatic sugar' filter clauses like `:time-interval` and `:inside` as simpler, logically
  equivalent clauses. This can be used to simplify the number of filter clauses that need to be supported by anything
  that needs to enumerate all the possible filter types (such as driver query processor implementations, or the
  implementation `negate-filter-clause` below.)"
  [filter-clause :- mbql.s/Filter]
  (-> filter-clause
      desugar-current-relative-datetime
      desugar-equals-and-not-equals-with-extra-args
      desugar-does-not-contain
      desugar-time-interval
      desugar-is-null-and-not-null
      desugar-inside
      simplify-compound-filter))

(defmulti ^:private negate* first)

(defmethod negate* :not [[_ subclause]]    subclause)
(defmethod negate* :and [[_ & subclauses]] (into [:or]  (map negate* subclauses)))
(defmethod negate* :or  [[_ & subclauses]] (into [:and] (map negate* subclauses)))
(defmethod negate* :=   [[_ field value]]  [:!= field value])
(defmethod negate* :!=  [[_ field value]]  [:=  field value])
(defmethod negate* :>   [[_ field value]]  [:<= field value])
(defmethod negate* :<   [[_ field value]]  [:>= field value])
(defmethod negate* :>=  [[_ field value]]  [:<  field value])
(defmethod negate* :<=  [[_ field value]]  [:>  field value])

(defmethod negate* :between [[_ field min max]] [:or [:< field min] [:> field max]])

(defmethod negate* :contains    [clause] [:not clause])
(defmethod negate* :starts-with [clause] [:not clause])
(defmethod negate* :ends-with   [clause] [:not clause])

(s/defn negate-filter-clause :- mbql.s/Filter
  "Return the logical compliment of an MBQL filter clause, generally without using `:not` (except for the string
  filter clause types). Useful for generating highly optimized filter clauses and for drivers that do not support
  top-level `:not` filter clauses."
  [filter-clause :- mbql.s/Filter]
  (-> filter-clause desugar-filter-clause negate* simplify-compound-filter))

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

(s/defn unwrap-field-clause :- (mbql.s.helpers/one-of mbql.s/field-id mbql.s/field-literal)
  "Un-wrap a `Field` clause and return the lowest-level clause it wraps, either a `:field-id` or `:field-literal`."
  [clause :- mbql.s/Field]
  (match-one clause
    :field-id                     &match
    :field-literal                &match
    [:fk-> _ dest-field]          (recur dest-field)
    [:joined-field _ field]       (recur field)
    [:datetime-field field _]     (recur field)
    [:binning-strategy field & _] (recur field)))

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

(s/defn add-order-by-clause :- mbql.s/MBQLQuery
  "Add a new `:order-by` clause to an MBQL `inner-query`. If the new order-by clause references a Field that is
  already being used in another order-by clause, this function does nothing."
  [inner-query :- mbql.s/MBQLQuery, [_ field, :as order-by-clause] :- mbql.s/OrderBy]
  (let [existing-fields (set (for [[_ existing-field] (:order-by inner-query)]
                               (maybe-unwrap-field-clause existing-field)))]
    (if (existing-fields (maybe-unwrap-field-clause field))
      ;; Field already referenced, nothing to do
      inner-query
      ;; otherwise add new clause at the end
      (update inner-query :order-by (comp vec conj) order-by-clause))))

(defn relative-date
  "Return a new Temporal value relative to `t` using a relative date `unit`.

    (relative-date :year -1 (t/zoned-date-time \"2019-11-04T10:57:00-08:00[America/Los_Angeles]\"))
    ;; ->
    (t/zoned-date-time \"2020-11-04T10:57-08:00[America/Los_Angeles]\")"
  ^java.time.temporal.Temporal [unit amount t]
  (if (zero? amount)
    t
    (t.core/plus t (case unit
                     :millisecond (t.amount/millis amount)
                     :second      (t.amount/seconds amount)
                     :minute      (t.amount/minutes amount)
                     :hour        (t.amount/hours amount)
                     :day         (t.amount/days amount)
                     :week        (t.amount/days (* amount 7))
                     :month       (t.amount/months amount)
                     :quarter     (t.amount/months (* amount 3))
                     :year        (t.amount/years amount)))))

(s/defn add-datetime-units :- mbql.s/DateTimeValue
  "Return a `relative-datetime` clause with `n` units added to it."
  [absolute-or-relative-datetime :- mbql.s/DateTimeValue
   n                             :- s/Num]
  (if (is-clause? :relative-datetime absolute-or-relative-datetime)
    (let [[_ original-n unit] absolute-or-relative-datetime]
      [:relative-datetime (+ n original-n) unit])
    (let [[_ timestamp unit] absolute-or-relative-datetime]
      [:absolute-datetime (relative-date unit n timestamp) unit])))

(defn dispatch-by-clause-name-or-class
  "Dispatch function perfect for use with multimethods that dispatch off elements of an MBQL query. If `x` is an MBQL
  clause, dispatches off the clause name; otherwise dispatches off `x`'s class."
  [x]
  (if (mbql-clause? x)
    (first x)
    (class x)))

(s/defn expression-with-name :- mbql.s/FieldOrExpressionDef
  "Return the `Expression` referenced by a given `expression-name`."
  [{inner-query :query} :- mbql.s/Query, expression-name :- (s/cond-pre s/Keyword su/NonBlankString)]
  (let [allowed-names [(qualified-name expression-name) (keyword expression-name)]]
    (loop [{:keys [expressions source-query]} inner-query, found #{}]
      (or
       ;; look for either string or keyword version of `expression-name` in `expressions`
       (some (partial get expressions) allowed-names)
       ;; otherwise, if we have a source query recursively look in that (do we allow that??)
       (let [found (into found (keys expressions))]
         (if source-query
           (recur source-query found)
           ;; failing that throw an Exception with detailed info about what we tried and what the actual expressions
           ;; were
           (throw (ex-info (str (tru "No expression named ''{0}''" (qualified-name expression-name)))
                           {:type            :invalid-query
                            :expression-name expression-name
                            :tried           allowed-names
                            :found           found}))))))))

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

(defn temporal-field?
  "Is `field` used to record something date or time related, i.e. does `field` have a base type or special type that
  derives from `:type/Temporal`?"
  [field]
  (or (isa? (:base_type field)    :type/Temporal)
      (isa? (:special_type field) :type/Temporal)))

(defn time-field?
  "Is `field` used to record a time of day (e.g. hour/minute/second), but not the date itself? i.e. does `field` have a
  base type or special type that derives from `:type/Time`?"
  [field]
  (or (isa? (:base_type field)    :type/Time)
      (isa? (:special_type field) :type/Time)))

(defn temporal-but-not-time-field?
  "Does `field` have a base type or special type that derives from `:type/Temporal`, but not `:type/Time`? (i.e., is
  Field a Date or DateTime?)"
  [field]
  (and (temporal-field? field)
       (not (time-field? field))))

(defn datetime-arithmetics?
  "Is a given artihmetics clause operating on datetimes?"
  [clause]
  (boolean
   (match-one clause
     #{:datetime-field :interval :relative-datetime})))


;;; --------------------------------- Unique names & transforming ags to have names ----------------------------------

(defn unique-name-generator
  "Return a function that can be used to uniquify string names. Function maintains an internal counter that will suffix
  any names passed to it as needed so all results will be unique.

    (let [unique-name (unique-name-generator)]
      [(unique-name \"A\")
       (unique-name \"B\")
       (unique-name \"A\")])
    ;; -> [\"A\" \"B\" \"A_2\"]

  If idempotence is desired, the function returned by the generator also has a 2 airity version where the first argument is the object for which we are generating the name.

    (let [unique-name (unique-name-generator)]
      [(unique-name :x \"A\")
       (unique-name :x \"B\")
       (unique-name :x \"A\")
       (unique-name :y \"A\")])
    ;; -> [\"A\" \"B\" \"A\" \"A_2\"]
  "
  []
  (let [identity-objects->aliases (atom {})
        aliases                   (atom {})]
    (fn generate-name
      ([alias] (generate-name (gensym) alias))
      ([identity-object alias]
       (or (@identity-objects->aliases [identity-object alias])
           (loop [maybe-unique alias]
             (let [total-count (get (swap! aliases update maybe-unique (fnil inc 0)) maybe-unique)]
               (if (= total-count 1)
                 (do
                   (swap! identity-objects->aliases assoc [identity-object alias] maybe-unique)
                   maybe-unique)
                 (recur (str maybe-unique \_ total-count))))))))))

(s/defn uniquify-names :- (s/constrained [s/Str] distinct? "sequence of unique strings")
  "Make the names in a sequence of string names unique by adding suffixes such as `_2`.

     (uniquify-names [\"count\" \"sum\" \"count\" \"count_2\"])
     ;; -> [\"count\" \"sum\" \"count_2\" \"count_2_2\"]"
  [names :- [s/Str]]
  (map (unique-name-generator) names))

(def ^:private NamedAggregation
  (s/constrained
   mbql.s/aggregation-options
   #(:name (nth % 2))
   "`:aggregation-options` with a `:name`"))

(def ^:private UniquelyNamedAggregations
  (s/constrained
   [NamedAggregation]
   (fn [clauses]
     (apply distinct? (for [[_ _ {ag-name :name}] clauses]
                        ag-name)))
   "sequence of named aggregations with unique names"))

(s/defn uniquify-named-aggregations :- UniquelyNamedAggregations
  "Make the names of a sequence of named aggregations unique by adding suffixes such as `_2`."
  [named-aggregations :- [NamedAggregation]]
  (let [unique-names (uniquify-names
                      (for [[_ wrapped-ag {ag-name :name}] named-aggregations]
                        ag-name))]
    (map
     (fn [[_ wrapped-ag options] unique-name]
       [:aggregation-options wrapped-ag (assoc options :name unique-name)])
     named-aggregations
     unique-names)))

(s/defn pre-alias-aggregations :- [NamedAggregation]
  "Wrap every aggregation clause in an `:aggregation-options` clause, using the name returned
  by `(aggregation->name-fn ag-clause)` as names for any clauses that do not already have a `:name` in
  `:aggregation-options`.

    (pre-alias-aggregations annotate/aggregation-name
     [[:count] [:count] [:aggregation-options [:sum [:field-id 1] {:name \"Sum-41\"}]])
    ;; -> [[:aggregation-options [:count] {:name \"count\"}]
           [:aggregation-options [:count] {:name \"count\"}]
           [:aggregation-options [:sum [:field-id 1]] {:name \"Sum-41\"}]]

  Most often, `aggregation->name-fn` will be something like `annotate/aggregation-name`, but for purposes of keeping
  the `metabase.mbql` module seperate from the `metabase.query-processor` code we'll let you pass that in yourself."
  {:style/indent 1}
  [aggregation->name-fn :- (s/pred fn?), aggregations :- [mbql.s/Aggregation]]
  (replace aggregations
    [:aggregation-options _ (_ :guard :name)]
    &match

    [:aggregation-options wrapped-ag options]
    [:aggregation-options wrapped-ag (assoc options :name (aggregation->name-fn wrapped-ag))]

    [(_ :guard keyword?) & _]
    [:aggregation-options &match {:name (aggregation->name-fn &match)}]))

(s/defn pre-alias-and-uniquify-aggregations :- UniquelyNamedAggregations
  "Wrap every aggregation clause in a `:named` clause with a unique name. Combines `pre-alias-aggregations` with
  `uniquify-named-aggregations`."
  {:style/indent 1}
  [aggregation->name-fn :- (s/pred fn?), aggregations :- [mbql.s/Aggregation]]
  (-> (pre-alias-aggregations aggregation->name-fn aggregations)
      uniquify-named-aggregations))

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
     `max-rows-limit`"
  [{{:keys [max-results max-results-bare-rows]}                      :constraints
    {limit :limit, aggregations :aggregation, {:keys [items]} :page} :query
    query-type                                                       :type}]
  (let [safe-min          (fn [& args]
                            (when-let [args (seq (filter some? args))]
                              (reduce min args)))
        mbql-limit        (when (= query-type :query)
                            (safe-min items limit))
        constraints-limit (or
                           (when-not aggregations
                             max-results-bare-rows)
                           max-results)]
    (safe-min mbql-limit constraints-limit)))

(s/defn ->joined-field :- mbql.s/JoinField
  "Convert a Field clause to one that uses an appropriate `alias`, e.g. for a joined table."
  [table-alias :- s/Str, field-clause :- mbql.s/Field]
  (replace field-clause
    :joined-field
    (throw (Exception. (format "%s already has an alias." &match)))

    #{:field-id :field-literal}
    [:joined-field table-alias &match]))

(def ^:private default-join-alias "source")

(s/defn deduplicate-join-aliases :- mbql.s/Joins
  "Make sure every join in `:joins` has a unique alias. If a `:join` does not already have an alias, this will give it
  one."
  [joins :- [mbql.s/Join]]
  (let [joins          (for [join joins]
                         (update join :alias #(or % default-join-alias)))
        unique-aliases (uniquify-names (map :alias joins))]
    (mapv
     (fn [join alias]
       (assoc join :alias alias))
     joins
     unique-aliases)))
