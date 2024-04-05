(ns metabase.legacy-mbql.util
  "Utilitiy functions for working with MBQL queries."
  (:refer-clojure :exclude [replace])
  (:require
   [clojure.string :as str]
   [metabase.legacy-mbql.predicates :as mbql.preds]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.schema.helpers :as schema.helpers]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   #?@(:clj
       [[metabase.models.dispatch :as models.dispatch]])))

(defn qualified-name
  "Like `name`, but if `x` is a namespace-qualified keyword, returns that a string including the namespace."
  [x]
  (if (and (keyword? x) (namespace x))
    (str (namespace x) "/" (name x))
    (name x)))

(mu/defn normalize-token :- :keyword
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased
  keyword."
  [token :- schema.helpers/KeywordOrString]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (-> (qualified-name token)
      str/lower-case
      (str/replace #"_" "-")
      keyword))

(defn mbql-clause?
  "True if `x` is an MBQL clause (a sequence with a keyword as its first arg). (Since this is used by the code in
  `normalize` this handles pre-normalized clauses as well.)"
  [x]
  (and (sequential? x)
       (not (map-entry? x))
       (keyword? (first x))))

(defn is-clause?
  "If `x` is an MBQL clause, and an instance of clauses defined by keyword(s) `k-or-ks`?

    (is-clause? :count [:count 10])        ; -> true
    (is-clause? #{:+ :- :* :/} [:+ 10 20]) ; -> true"
  [k-or-ks x]
  (and
   (mbql-clause? x)
   (if (coll? k-or-ks)
     ((set k-or-ks) (first x))
     (= k-or-ks (first x)))))

(defn check-clause
  "Returns `x` if it's an instance of a clause defined by keyword(s) `k-or-ks`

    (check-clause :count [:count 10]) ; => [:count 10]
    (check-clause? #{:+ :- :* :/} [:+ 10 20]) ; -> [:+ 10 20]
    (check-clause :sum [:count 10]) ; => nil"
  [k-or-ks x]
  (when (is-clause? k-or-ks x)
    x))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Functions for manipulating queries                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- combine-compound-filters-of-type [compound-type subclauses]
  (mapcat #(lib.util.match/match-one %
             [(_ :guard (partial = compound-type)) & args]
             args
             _
             [&match])
          subclauses))

(declare simplify-compound-filter)

(defn- simplify-and-or-filter
  [op args]
  (let [args (distinct (filter some? args))]
    (case (count args)
      ;; an empty filter, toss it
      0 nil
      ;; single arg, unwrap it
      1 (simplify-compound-filter (first args))
      (if (some (partial is-clause? op) args)
        ;; clause of the same type embedded, faltten it
        (recur op (combine-compound-filters-of-type op args))
        ;; simplify the arguments
        (let [simplified (map simplify-compound-filter args)]
          (if (= simplified args)
            ;; no change, we can stop
            (into [op] args)
            ;; there is a change, we might be able to simplify even further
            (recur op simplified)))))))

(defn simplify-compound-filter
  "Simplify compound `:and`, `:or`, and `:not` compound filters, combining or eliminating them where possible. This
  also fixes theoretically disallowed compound filters like `:and` with only a single subclause, and eliminates `nils`
  and duplicate subclauses from the clauses."
  [x]
  (cond
    ;; look for filters in the values
    (map? x) (update-vals x simplify-compound-filter)
    (seq? x) (recur (vec x))
    ;; not a map and not vector, leave it as is
    (not (vector? x)) x
    ;; an empty filter, toss it
    (not (some some? x)) nil
    :else (let [[op & [farg :as args]] x]
            (case op
              :not (if-not (seqable? farg)
                     x
                     (case (first farg)
                       ;; double negation, eliminate both
                       :not (recur (second farg))
                       ;; use de Morgan's law to push the negation down
                       :and (simplify-and-or-filter :or (map #(vector :not %) (rest farg)))
                       :or  (simplify-and-or-filter :and (map #(vector :not %) (rest farg)))
                       x))
              :and (simplify-and-or-filter :and args)
              :or  (simplify-and-or-filter :or args)
              ;; simplify the elements of the vector
              (mapv simplify-compound-filter x)))))

(mu/defn combine-filter-clauses :- mbql.s/Filter
  "Combine two filter clauses into a single clause in a way that minimizes slapping a bunch of `:and`s together if
  possible."
  [filter-clause & more-filter-clauses]
  (simplify-compound-filter (cons :and (cons filter-clause more-filter-clauses))))

(mu/defn add-filter-clause-to-inner-query :- mbql.s/MBQLQuery
  "Add a additional filter clause to an *inner* MBQL query, merging with the existing filter clause with `:and` if
  needed."
  [inner-query :- mbql.s/MBQLQuery
   new-clause  :- [:maybe mbql.s/Filter]]
  (if-not new-clause
    inner-query
    (update inner-query :filter combine-filter-clauses new-clause)))

(mu/defn add-filter-clause :- mbql.s/Query
  "Add an additional filter clause to an `outer-query`. If `new-clause` is `nil` this is a no-op."
  [outer-query :- mbql.s/Query new-clause :- [:maybe mbql.s/Filter]]
  (update outer-query :query add-filter-clause-to-inner-query new-clause))

(defn desugar-inside
  "Rewrite `:inside` filter clauses as a pair of `:between` clauses."
  [m]
  (lib.util.match/replace m
    [:inside lat-field lon-field lat-max lon-min lat-min lon-max]
    [:and
     [:between lat-field lat-min lat-max]
     [:between lon-field lon-min lon-max]]))

(defn desugar-is-null-and-not-null
  "Rewrite `:is-null` and `:not-null` filter clauses as simpler `:=` and `:!=`, respectively."
  [m]
  (lib.util.match/replace m
    [:is-null field]  [:=  field nil]
    [:not-null field] [:!= field nil]))

(defn desugar-is-empty-and-not-empty
  "Rewrite `:is-empty` and `:not-empty` filter clauses as simpler `:=` and `:!=`, respectively.

   If `:not-empty` is called on `:metabase.lib.schema.expression/emptyable` type, expand check for empty string. For
   non-`emptyable` types act as `:is-null`. If field has nil base type it is considered not emptyable expansion wise."
  [m]
  (lib.util.match/replace m
    [:is-empty field]
    (if (isa? (get-in field [2 :base-type]) :metabase.lib.schema.expression/emptyable)
      [:or [:= field nil] [:= field ""]]
      [:= field nil])

    [:not-empty field]
    (if (isa? (get-in field [2 :base-type]) :metabase.lib.schema.expression/emptyable)
      [:and [:!= field nil] [:!= field ""]]
      [:!= field nil])))

(defn- replace-field-or-expression
  "Replace a field or expression inside :time-interval"
  [m unit]
  (lib.util.match/replace m
    [:field id-or-name opts]
    [:field id-or-name (assoc opts :temporal-unit unit)]

    :expression
    (let [[_expression expression-name opts] &match]
      [:expression expression-name (assoc opts :temporal-unit unit)])))

(defn desugar-time-interval
  "Rewrite `:time-interval` filter clauses as simpler ones like `:=` or `:between`."
  [m]
  (lib.util.match/replace m
    [:time-interval field-or-expression n unit] (recur [:time-interval field-or-expression n unit nil])

    ;; replace current/last/next with corresponding value of n and recur
    [:time-interval field-or-expression :current unit options] (recur [:time-interval field-or-expression  0 unit options])
    [:time-interval field-or-expression :last    unit options] (recur [:time-interval field-or-expression -1 unit options])
    [:time-interval field-or-expression :next    unit options] (recur [:time-interval field-or-expression  1 unit options])

    [:time-interval field-or-expression (n :guard #{-1}) unit (_ :guard :include-current)]
    [:between
     (replace-field-or-expression field-or-expression unit)
     [:relative-datetime n unit]
     [:relative-datetime 0 unit]]

    [:time-interval field-or-expression (n :guard #{1}) unit (_ :guard :include-current)]
    [:between
     (replace-field-or-expression field-or-expression unit)
     [:relative-datetime 0 unit]
     [:relative-datetime n unit]]

    [:time-interval field-or-expression (n :guard #{-1 0 1}) unit _]
    [:= (replace-field-or-expression field-or-expression unit) [:relative-datetime n unit]]

    [:time-interval field-or-expression (n :guard neg?) unit (_ :guard :include-current)]
    [:between
     (replace-field-or-expression field-or-expression unit)
     [:relative-datetime n unit]
     [:relative-datetime 0 unit]]

    [:time-interval field-or-expression (n :guard neg?) unit _]
    [:between
     (replace-field-or-expression field-or-expression unit)
     [:relative-datetime n unit]
     [:relative-datetime -1 unit]]

    [:time-interval field-or-expression n unit (_ :guard :include-current)]
    [:between
     (replace-field-or-expression field-or-expression unit)
     [:relative-datetime 0 unit]
     [:relative-datetime n unit]]

    [:time-interval field-or-expression n unit _]
    [:between
     (replace-field-or-expression field-or-expression unit)
     [:relative-datetime 1 unit]
     [:relative-datetime n unit]]))

(defn desugar-does-not-contain
  "Rewrite `:does-not-contain` filter clauses as simpler `:not` clauses."
  [m]
  (lib.util.match/replace m
    [:does-not-contain & args]
    [:not (into [:contains] args)]))

(defn desugar-equals-and-not-equals-with-extra-args
  "`:=` and `!=` clauses with more than 2 args automatically get rewritten as compound filters.

     [:= field x y]  -> [:or  [:=  field x] [:=  field y]]
     [:!= field x y] -> [:and [:!= field x] [:!= field y]]"
  [m]
  (lib.util.match/replace m
    [:= field x y & more]
    (apply vector :or (for [x (concat [x y] more)]
                        [:= field x]))

    [:!= field x y & more]
    (apply vector :and (for [x (concat [x y] more)]
                         [:!= field x]))))

(defn desugar-current-relative-datetime
  "Replace `relative-datetime` clauses like `[:relative-datetime :current]` with `[:relative-datetime 0 <unit>]`.
  `<unit>` is inferred from the `:field` the clause is being compared to (if any), otherwise falls back to `default.`"
  [m]
  (lib.util.match/replace m
    [clause field & (args :guard (partial some (partial = [:relative-datetime :current])))]
    (let [temporal-unit (or (lib.util.match/match-one field [:field _ {:temporal-unit temporal-unit}] temporal-unit)
                            :default)]
      (into [clause field] (lib.util.match/replace args
                             [:relative-datetime :current]
                             [:relative-datetime 0 temporal-unit])))))

(def temporal-extract-ops->unit
  "Mapping from the sugar syntax to extract datetime to the unit."
  {[:get-year        nil]       :year-of-era
   [:get-quarter     nil]       :quarter-of-year
   [:get-month       nil]       :month-of-year
   ;; default get-week mode is iso
   [:get-week        nil]       :week-of-year-iso
   [:get-week        :iso]      :week-of-year-iso
   [:get-week        :us]       :week-of-year-us
   [:get-week        :instance] :week-of-year-instance
   [:get-day         nil]       :day-of-month
   [:get-day-of-week nil]       :day-of-week
   [:get-hour        nil]       :hour-of-day
   [:get-minute      nil]       :minute-of-hour
   [:get-second      nil]       :second-of-minute})

(def ^:private temporal-extract-ops
  (->> (keys temporal-extract-ops->unit)
       (map first)
       set))

(defn desugar-temporal-extract
  "Replace datetime extractions clauses like `[:get-year field]` with `[:temporal-extract field :year]`."
  [m]
  (lib.util.match/replace m
    [(op :guard temporal-extract-ops) field & args]
    [:temporal-extract field (temporal-extract-ops->unit [op (first args)])]))

(defn- desugar-divide-with-extra-args [expression]
  (lib.util.match/replace expression
    [:/ x y z & more]
    (recur (into [:/ [:/ x y]] (cons z more)))))

(mu/defn desugar-expression :- mbql.s/FieldOrExpressionDef
  "Rewrite various 'syntactic sugar' expressions like `:/` with more than two args into something simpler for drivers
  to compile."
  [expression :- mbql.s/FieldOrExpressionDef]
  (-> expression
      desugar-divide-with-extra-args))

(defn- maybe-desugar-expression [clause]
  (cond-> clause
    (mbql.preds/FieldOrExpressionDef? clause) desugar-expression))

(mu/defn desugar-filter-clause :- mbql.s/Filter
  "Rewrite various 'syntatic sugar' filter clauses like `:time-interval` and `:inside` as simpler, logically
  equivalent clauses. This can be used to simplify the number of filter clauses that need to be supported by anything
  that needs to enumerate all the possible filter types (such as driver query processor implementations, or the
  implementation [[negate-filter-clause]] below.)"
  [filter-clause :- mbql.s/Filter]
  (-> filter-clause
      desugar-current-relative-datetime
      desugar-equals-and-not-equals-with-extra-args
      desugar-does-not-contain
      desugar-time-interval
      desugar-is-null-and-not-null
      desugar-is-empty-and-not-empty
      desugar-inside
      simplify-compound-filter
      desugar-temporal-extract
      maybe-desugar-expression))

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

(mu/defn negate-filter-clause :- mbql.s/Filter
  "Return the logical compliment of an MBQL filter clause, generally without using `:not` (except for the string
  filter clause types). Useful for generating highly optimized filter clauses and for drivers that do not support
  top-level `:not` filter clauses."
  [filter-clause :- mbql.s/Filter]
  (-> filter-clause desugar-filter-clause negate* simplify-compound-filter))

(mu/defn query->source-table-id :- [:maybe pos-int?]
  "Return the source Table ID associated with `query`, if applicable; handles nested queries as well. If `query` is
  `nil`, returns `nil`.

  Throws an Exception when it encounters a unresolved source query (i.e., the `:source-table \"card__id\"`
  form), because it cannot return an accurate result for a query that has not yet been preprocessed."
  {:arglists '([outer-query])}
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

(mu/defn join->source-table-id :- [:maybe pos-int?]
  "Like `query->source-table-id`, but for a join."
  [join]
  (query->source-table-id {:type :query, :query join}))

(mu/defn add-order-by-clause :- mbql.s/MBQLQuery
  "Add a new `:order-by` clause to an MBQL `inner-query`. If the new order-by clause references a Field that is
  already being used in another order-by clause, this function does nothing."
  [inner-query                                        :- mbql.s/MBQLQuery
   [_ [_ id-or-name :as _field], :as order-by-clause] :- mbql.s/OrderBy]
  (let [existing-fields (set (for [[_ [_ id-or-name]] (:order-by inner-query)]
                               id-or-name))]
    (if (existing-fields id-or-name)
      ;; Field already referenced, nothing to do
      inner-query
      ;; otherwise add new clause at the end
      (update inner-query :order-by (comp vec distinct conj) order-by-clause))))

(defn dispatch-by-clause-name-or-class
  "Dispatch function perfect for use with multimethods that dispatch off elements of an MBQL query. If `x` is an MBQL
  clause, dispatches off the clause name; otherwise dispatches off `x`'s class."
  ([x]
   (letfn [(clause-type [x]
             (when (mbql-clause? x)
               (first x)))
           (mlv2-lib-type [x]
             (when (map? x)
               (:lib/type x)))
           (model-type [#?(:clj x :cljs _x)]
             #?(:clj (models.dispatch/model x)
                :cljs nil))]
     (or
      (clause-type x)
      (mlv2-lib-type x)
      (model-type x)
      (type x))))
  ([x _]
   (dispatch-by-clause-name-or-class x)))

(mu/defn expression-with-name :- mbql.s/FieldOrExpressionDef
  "Return the `Expression` referenced by a given `expression-name`."
  [inner-query expression-name :- [:or :keyword ::lib.schema.common/non-blank-string]]
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
           (throw (ex-info (i18n/tru "No expression named ''{0}''" (qualified-name expression-name))
                           {:type            :invalid-query
                            :expression-name expression-name
                            :tried           allowed-names
                            :found           found}))))))))

(mu/defn aggregation-at-index :- mbql.s/Aggregation
  "Fetch the aggregation at index. This is intended to power aggregate field references (e.g. [:aggregation 0]).
   This also handles nested queries, which could be potentially ambiguous if multiple levels had aggregations. To
   support nested queries, you'll need to keep tract of how many `:source-query`s deep you've traveled; pass in this
   number to as optional arg `nesting-level` to make sure you reference aggregations at the right level of nesting."
  ([query index]
   (aggregation-at-index query index 0))

  ([query         :- mbql.s/Query
    index         :- ::lib.schema.common/int-greater-than-or-equal-to-zero
    nesting-level :- ::lib.schema.common/int-greater-than-or-equal-to-zero]
   (if (zero? nesting-level)
     (or (nth (get-in query [:query :aggregation]) index)
         (throw (ex-info (i18n/tru "No aggregation at index: {0}" index) {:index index})))
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

;;; --------------------------------- Unique names & transforming ags to have names ----------------------------------

(defn unique-name-generator
  "Return a function that can be used to uniquify string names. Function maintains an internal counter that will suffix
  any names passed to it as needed so all results will be unique.

    (let [unique-name (unique-name-generator)]
      [(unique-name \"A\")
       (unique-name \"B\")
       (unique-name \"A\")])
    ;; -> [\"A\" \"B\" \"A_2\"]

  By default, unique aliases are generated for each unique `[id original-name]` key pair. By default, a unique `id` is
  generated for every call, meaning repeated calls to [[unique-name-generator]] with the same `original-name` will
  return different unique aliases. If idempotence is desired, the function returned by the generator also has a 2
  airity version with the signature

    (unique-name-fn id original-name)

  for example:

    (let [unique-name (unique-name-generator)]
      [(unique-name :x \"A\")
       (unique-name :x \"B\")
       (unique-name :x \"A\")
       (unique-name :y \"A\")])
    ;; -> [\"A\" \"B\" \"A\" \"A_2\"]

  Finally, [[unique-name-generator]] accepts the following options to further customize behavior:

  ### `:name-key-fn`

  Generated aliases are unique by the value of `[id (name-key-fn original-name)]`; the default is `identity`, so by
  default aliases are unique by `[id name-key-fn]`. Specify something custom here if you want to make the unique
  aliases unique by some other value, for example to make them unique without regards to case:

    (let [f (unique-name-generator :name-key-fn str/lower-case)]
      [(f \"x\")
       (f \"X\")
       (f \"X\")])
    ;; -> [\"x\" \"X_2\" \"X_3\"]

  This is useful for databases that treat column aliases as case-insensitive (see #19618 for some examples of this).

  ### `:unique-alias-fn`

  The function used to generate a potentially-unique alias given an original alias and unique suffix with the signature

    (unique-alias-fn original suffix)

  By default, combines them like `original_suffix`, but you can supply a custom function if you need to change this
  behavior:

    (let [f (unique-name-generator :unique-alias-fn (fn [x y] (format \"%s~~%s\" y x)))]
      [(f \"x\")
       (f \"x\")])
  ;; -> [\"x\" \"2~~x\"]

  This is useful if you need to constrain the generated suffix in some way, for example by limiting its length or
  escaping characters disallowed in a column alias.

  Values generated by this function are recursively checked for uniqueness, and will keep trying values a unique value
  is generated; for this reason the function *must* return a unique value for every unique input. Use caution when
  limiting the length of the identifier generated (consider appending a hash in cases like these)."
  [& {:keys [name-key-fn unique-alias-fn]
      :or   {name-key-fn     identity
             unique-alias-fn (fn [original suffix]
                               (str original \_ suffix))}}]
  (let [id+original->unique (atom {})   ; map of [id original-alias] -> unique-alias
        original->count     (atom {})]  ; map of original-alias -> count
    (fn generate-name
      ([alias]
       (generate-name (gensym) alias))

      ([id original]
       (let [name-key (name-key-fn original)]
         (or
          ;; if we already have generated an alias for this key (e.g. `[id original]`), return it as-is.
          (@id+original->unique [id name-key])
          ;; otherwise generate a new unique alias.
          ;; see if we're the first to try to use this candidate alias. Update the usage count in `original->count`
          (let [total-count (get (swap! original->count update name-key (fnil inc 0)) name-key)]
            (if (= total-count 1)
              ;; if we are the first to do it, record it in `id+original->unique` and return it.
              (do
                (swap! id+original->unique assoc [id name-key] original)
                original)
              ;; otherwise prefix the alias by the current total count (e.g. `id` becomes `id_2`) and recur. If `id_2`
              ;; is unused, it will get returned. Otherwise we'll recursively try `id_2_2`, and so forth.
              (let [candidate (unique-alias-fn original (str total-count))]
                ;; double-check that `unique-alias-fn` isn't doing something silly like truncating the generated alias
                ;; to aggressively or forgetting to include the `suffix` -- otherwise we could end up with an infinite
                ;; loop
                (assert (not= candidate original)
                        (str "unique-alias-fn must return a different string than its input. Input: "
                             (pr-str candidate)))
                (recur id candidate))))))))))

(mu/defn uniquify-names :- [:and
                            [:sequential :string]
                            [:fn
                             {:error/message "sequence of unique strings"}
                             distinct?]]
  "Make the names in a sequence of string names unique by adding suffixes such as `_2`.

     (uniquify-names [\"count\" \"sum\" \"count\" \"count_2\"])
     ;; -> [\"count\" \"sum\" \"count_2\" \"count_2_2\"]"
  [names :- [:sequential :string]]
  (map (unique-name-generator) names))

(def ^:private NamedAggregation
  [:and
   mbql.s/aggregation-options
   [:fn
    {:error/message "`:aggregation-options` with a `:name`"}
    #(:name (nth % 2))]])

(def ^:private UniquelyNamedAggregations
  [:and
   [:sequential NamedAggregation]
   [:fn
    {:error/message "sequence of named aggregations with unique names"}
    (fn [clauses]
      (apply distinct? (for [[_tag _wrapped {ag-name :name}] clauses]
                         ag-name)))]])

(mu/defn uniquify-named-aggregations :- UniquelyNamedAggregations
  "Make the names of a sequence of named aggregations unique by adding suffixes such as `_2`."
  [named-aggregations :- [:sequential NamedAggregation]]
  (let [unique-names (uniquify-names
                      (for [[_ _wrapped-ag {ag-name :name}] named-aggregations]
                        ag-name))]
    (map
     (fn [[_ wrapped-ag options] unique-name]
       [:aggregation-options wrapped-ag (assoc options :name unique-name)])
     named-aggregations
     unique-names)))

(mu/defn pre-alias-aggregations :- [:sequential NamedAggregation]
  "Wrap every aggregation clause in an `:aggregation-options` clause, using the name returned
  by `(aggregation->name-fn ag-clause)` as names for any clauses that do not already have a `:name` in
  `:aggregation-options`.

    (pre-alias-aggregations annotate/aggregation-name
     [[:count] [:count] [:aggregation-options [:sum [:field 1 nil] {:name \"Sum-41\"}]])
    ;; -> [[:aggregation-options [:count] {:name \"count\"}]
           [:aggregation-options [:count] {:name \"count\"}]
           [:aggregation-options [:sum [:field 1 nil]] {:name \"Sum-41\"}]]

  Most often, `aggregation->name-fn` will be something like `annotate/aggregation-name`, but for purposes of keeping
  the `metabase.legacy-mbql` module seperate from the `metabase.query-processor` code we'll let you pass that in yourself."
  {:style/indent 1}
  [aggregation->name-fn :- fn?
   aggregations         :- [:sequential mbql.s/Aggregation]]
  (lib.util.match/replace aggregations
    [:aggregation-options _ (_ :guard :name)]
    &match

    [:aggregation-options wrapped-ag options]
    [:aggregation-options wrapped-ag (assoc options :name (aggregation->name-fn wrapped-ag))]

    [(_ :guard keyword?) & _]
    [:aggregation-options &match {:name (aggregation->name-fn &match)}]))

(mu/defn pre-alias-and-uniquify-aggregations :- UniquelyNamedAggregations
  "Wrap every aggregation clause in a `:named` clause with a unique name. Combines `pre-alias-aggregations` with
  `uniquify-named-aggregations`."
  {:style/indent 1}
  [aggregation->name-fn :- fn?
   aggregations         :- [:sequential mbql.s/Aggregation]]
  (-> (pre-alias-aggregations aggregation->name-fn aggregations)
      uniquify-named-aggregations))

(defn- safe-min [& args]
  (transduce
   (filter some?)
   (completing
    (fn [acc n]
      (if acc
        (min acc n)
        n)))
   nil
   args))

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
  (let [mbql-limit        (when (= query-type :query)
                            (safe-min items limit))
        constraints-limit (or
                           (when-not aggregations
                             max-results-bare-rows)
                           max-results)]
    (safe-min mbql-limit constraints-limit)))

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

(mu/defn update-field-options :- mbql.s/Reference
  "Like [[clojure.core/update]], but for the options in a `:field`, `:expression`, or `:aggregation` clause."
  {:arglists '([field-or-ag-ref-or-expression-ref f & args])}
  [[clause-type id-or-name opts] :- mbql.s/Reference f & args]
  (let [opts (not-empty (remove-empty (apply f opts args)))]
    ;; `:field` clauses should have a `nil` options map if there are no options. `:aggregation` and `:expression`
    ;; should get the arg removed if it's `nil` or empty. (For now. In the future we may change this if we make the
    ;; 3-arg versions the "official" normalized versions.)
    (cond
      opts                   [clause-type id-or-name opts]
      (= clause-type :field) [clause-type id-or-name nil]
      :else                  [clause-type id-or-name])))

(defn assoc-field-options
  "Like [[clojure.core/assoc]], but for the options in a `:field`, `:expression`, or `:aggregation` clause."
  [clause & kvs]
  (apply update-field-options clause assoc kvs))

(defn with-temporal-unit
  "Set the `:temporal-unit` of a `:field` clause to `unit`."
  [[_ _ {:keys [base-type]} :as clause] unit]
  ;; it doesn't make sense to call this on an `:expression` or `:aggregation`.
  (assert (is-clause? :field clause))
  (if (or (not base-type)
          (mbql.s/valid-temporal-unit-for-base-type? base-type unit))
    (assoc-field-options clause :temporal-unit unit)
    (do
      (log/warn (i18n/tru "{0} is not a valid temporal unit for {1}; not adding to clause {2}"
                          unit base-type (pr-str clause)))
      clause)))

(defn remove-namespaced-options
  "Update a `:field`, `:expression` reference, or `:aggregation` reference clause by removing all namespaced keys in the
  options map. This is mainly for clause equality comparison purposes -- in current usage namespaced keys are used by
  individual pieces of middleware or driver implementations for tracking little bits of information that should not be
  considered relevant when comparing clauses for equality."
  [field-or-ref]
  (update-field-options field-or-ref (partial into {} (remove (fn [[k _]]
                                                                (qualified-keyword? k))))))

(defn referenced-field-ids
  "Find all the `:field` references with integer IDs in `coll`, which can be a full MBQL query, a snippet of MBQL, or a
  sequence of those things; return a set of Field IDs. Includes Fields referenced indirectly via `:source-field`.
  Returns `nil` if no IDs are found."
  [coll]
  (not-empty
   (into #{}
         (comp cat (filter some?))
         (lib.util.match/match coll
           [:field (id :guard integer?) opts]
           [id (:source-field opts)]))))

(defn matching-locations
  "Find the forms matching pred, returns a list of tuples of location (as used in get-in) and the match."
  [form pred]
  (loop [stack [[[] form]], matches []]
    (if-let [[loc form :as top] (peek stack)]
      (let [stack (pop stack)
            onto-stack #(into stack (map (fn [[k v]] [(conj loc k) v])) %)]
        (cond
          (pred form)        (recur stack                                  (conj matches top))
          (map? form)        (recur (onto-stack form)                      matches)
          (sequential? form) (recur (onto-stack (map-indexed vector form)) matches)
          :else              (recur stack                                  matches)))
      matches)))

(defn wrap-field-id-if-needed
  "Wrap a raw Field ID in a `:field` clause if needed."
  [field-id-or-form]
  (cond
    (mbql-clause? field-id-or-form)
    field-id-or-form

    (integer? field-id-or-form)
    [:field field-id-or-form nil]

    :else
    field-id-or-form))

(mu/defn unwrap-field-clause :- [:maybe mbql.s/field]
  "Unwrap something that contains a `:field` clause, such as a template tag.
  Also handles unwrapped integers for legacy compatibility.

    (unwrap-field-clause [:field 100 nil]) ; -> [:field 100 nil]"
  [field-form]
  (if (integer? field-form)
    [:field field-form nil]
    (lib.util.match/match-one field-form :field)))

(mu/defn unwrap-field-or-expression-clause :- mbql.s/Field
  "Unwrap a `:field` clause or expression clause, such as a template tag. Also handles unwrapped integers for
  legacy compatibility."
  [field-or-ref-form]
  (or (unwrap-field-clause field-or-ref-form)
      (lib.util.match/match-one field-or-ref-form :expression)))
