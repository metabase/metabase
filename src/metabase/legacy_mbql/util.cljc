(ns metabase.legacy-mbql.util
  "Utilitiy functions for working with MBQL queries."
  (:refer-clojure :exclude [replace some mapv every?])
  (:require
   #?@(:clj
       [[metabase.legacy-mbql.jvm-util :as mbql.jvm-u]
        [metabase.models.dispatch :as models.dispatch]])
   [clojure.string :as str]
   [metabase.legacy-mbql.predicates :as mbql.preds]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.schema.helpers :as schema.helpers]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.namespaces :as shared.ns]
   [metabase.util.performance :refer [some mapv every?]]
   [metabase.util.time :as u.time]))

(shared.ns/import-fns
 [schema.helpers
  mbql-clause?
  is-clause?
  check-clause])

(mu/defn normalize-token :- [:or :keyword :string]
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased
  keyword."
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

(defn- combine-compound-filters-of-type
  {:deprecated "0.57.0"}
  [compound-type subclauses]
  (mapcat #(lib.util.match/match-lite %
             [(t :guard (= t compound-type)) & args]
             args
             _
             [%])
          subclauses))

(declare simplify-compound-filter)

(defn- simplify-and-or-filter
  {:deprecated "0.57.0"}
  [op args]
  #_{:clj-kondo/ignore [:deprecated-var]}
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
  and duplicate subclauses from the clauses.

  DEPRECATED: This will be removed in the near future.
  Use [[metabase.lib.filter.simplify-compound/simplify-compound-filter]] going forward."
  {:deprecated "0.57.0"}
  [x]
  #_{:clj-kondo/ignore [:deprecated-var]}
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
  possible.

  DEPRECATED: This will be removed in the near future. Use lib utils going forward."
  {:deprecated "0.57.0"}
  [filter-clause & more-filter-clauses]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (simplify-compound-filter (cons :and (cons filter-clause more-filter-clauses))))

;;; TODO (Cam 7/16/25) -- why does the LEGACY MBQL UTILS have STAGE STUFF IN IT!
(defn legacy-last-stage-number
  "Returns the canonical stage number of the last stage of the legacy `inner-query`."
  {:deprecated "0.57.0"}
  [inner-query]
  (loop [{:keys [source-query qp/stage-had-source-card]} inner-query, n 0]
    (if (or (nil? source-query)
            stage-had-source-card)
      n
      (recur source-query (inc n)))))

(defn desugar-inside
  "Rewrite `:inside` filter clauses as a pair of `:between` clauses."
  {:deprecated "0.57.0"}
  [m]
  (lib.util.match/replace m
    [:inside lat-field lon-field lat-max lon-min lat-min lon-max]
    [:and
     [:between lat-field lat-min lat-max]
     [:between lon-field lon-min lon-max]]))

(defn desugar-is-null-and-not-null
  "Rewrite `:is-null` and `:not-null` filter clauses as simpler `:=` and `:!=`, respectively."
  {:deprecated "0.57.0"}
  [m]
  (lib.util.match/replace m
    [:is-null field]  [:=  field nil]
    [:not-null field] [:!= field nil]))

(declare field-options)

(defn- emptyable?
  {:deprecated "0.57.0"}
  [clause]
  (if (is-clause? #{:field :expression :aggregation} clause)
    (-> clause
        field-options
        :base-type
        (isa? :metabase.lib.schema.expression/emptyable))
    (mbql.preds/Emptyable? clause)))

(defn- desugar-is-empty-and-not-empty
  "Rewrite `:is-empty` and `:not-empty` filter clauses as simpler `:=` and `:!=`, respectively.

   If `:not-empty` is called on `:metabase.lib.schema.expression/emptyable` type, expand check for empty string. For
   non-`emptyable` types act as `:is-null`. If field has nil base type it is considered not emptyable expansion wise."
  {:deprecated "0.57.0"}
  [m]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (lib.util.match/replace m
    [:is-empty clause]
    (if (emptyable? clause)
      [:or [:= clause nil] [:= clause ""]]
      [:= clause nil])

    [:not-empty clause]
    (if (emptyable? clause)
      [:and [:!= clause nil] [:!= clause ""]]
      [:!= clause nil])))

(defn- replace-field-or-expression
  "Replace a field or expression inside :time-interval"
  {:deprecated "0.57.0"}
  [m unit]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (lib.util.match/replace m
    [:field id-or-name opts]
    [:field id-or-name (assoc opts :temporal-unit unit)]

    :expression
    (let [[_expression expression-name opts] &match]
      [:expression expression-name (assoc opts :temporal-unit unit)])))

(defn- desugar-time-interval
  "Rewrite `:time-interval` filter clauses as simpler ones like `:=` or `:between`."
  {:deprecated "0.57.0"}
  [m]
  #_{:clj-kondo/ignore [:deprecated-var]}
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

(defn desugar-relative-time-interval
  "Transform `:relative-time-interval` to `:and` expression."
  {:deprecated "0.57.0"}
  [m]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (lib.util.match/replace
    m
    [:relative-time-interval col value bucket offset-value offset-bucket]
    (let [col-default-bucket (cond-> col (and (vector? col) (= 3 (count col)))
                                     (update 2 assoc :temporal-unit :default))
          offset [:interval offset-value offset-bucket]
          lower-bound (if (neg? value)
                        [:relative-datetime value bucket]
                        [:relative-datetime 1 bucket])
          upper-bound (if (neg? value)
                        [:relative-datetime 0 bucket]
                        [:relative-datetime (inc value) bucket])
          lower-with-offset [:+ lower-bound offset]
          upper-with-offset [:+ upper-bound offset]]
      [:and
       [:>= col-default-bucket lower-with-offset]
       [:<  col-default-bucket upper-with-offset]])))

(defn desugar-during
  "Transform a `:during` expression to an `:and` expression."
  {:deprecated "0.57.0"}
  [m]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (lib.util.match/replace
    m
    [:during col value unit]
    (let [col-default-bucket (cond-> col
                               (and (vector? col) (= 3 (count col)))
                               (update 2 assoc :temporal-unit :default))
          lower-bound (u.time/truncate value unit)
          upper-bound (u.time/add lower-bound unit 1)]
      [:and
       [:>= col-default-bucket lower-bound]
       [:<  col-default-bucket upper-bound]])))

(defn desugar-if
  "Transform a `:if` expression to an `:case` expression."
  {:deprecated "0.57.0"}
  [m]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (lib.util.match/replace
    m
    [:if & args]
    (into [:case] args)))

(defn desugar-in
  "Transform `:in` and `:not-in` expressions to `:=` and `:!=` expressions."
  {:deprecated "0.57.0"}
  [m]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (lib.util.match/replace m
    [:in & args]
    (into [:=] args)

    [:not-in & args]
    (into [:!=] args)))

(defn- desugar-does-not-contain
  "Rewrite `:does-not-contain` filter clauses as simpler `[:not [:contains ...]]` clauses.

  Note that [[desugar-multi-argument-comparisons]] will have already desugared any 3+ argument `:does-not-contain` to
  several `[:and [:does-not-contain ...] [:does-not-contain ...] ...]` clauses, which then get rewritten here into
  `[:and [:not [:contains ...]] [:not [:contains ...]]]`."
  {:deprecated "0.57.0"}
  [m]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (lib.util.match/replace m
    [:does-not-contain & args]
    [:not (into [:contains] args)]))

(defn- desugar-multi-argument-comparisons
  "`:=`, `!=`, `:contains`, `:does-not-contain`, `:starts-with` and `:ends-with` clauses with more than 2 args
  automatically get rewritten as compound filters.

     [:= field x y]                -> [:or  [:=  field x] [:=  field y]]
     [:!= field x y]               -> [:and [:!= field x] [:!= field y]]
     [:does-not-contain field x y] -> [:and [:does-not-contain field x] [:does-not-contain field y]]

  Note that the optional options map is in different positions for `:contains`, `:does-not-contain`, `:starts-with` and
  `:ends-with` depending on the number of arguments. 2-argument forms use the legacy style `[:contains field x opts]`.
  Multi-argument forms use pMBQL style with the options at index 1, **even if there are no options**:
  `[:contains {} field x y z]`."
  {:deprecated "0.57.0"}
  [m]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (lib.util.match/replace m
    [:= field x y & more]
    (apply vector :or (for [x (concat [x y] more)]
                        [:= field x]))

    [:!= field x y & more]
    (apply vector :and (for [x (concat [x y] more)]
                         [:!= field x]))

    [(op :guard #{:contains :does-not-contain :starts-with :ends-with})
     (opts :guard map?)
     field x y & more]
    (let [tail (when (seq opts) [opts])]
      (apply vector
             (if (= op :does-not-contain) :and :or)
             (for [x (concat [x y] more)]
               (into [op field x] tail))))))

(defn desugar-current-relative-datetime
  "Replace `relative-datetime` clauses like `[:relative-datetime :current]` with `[:relative-datetime 0 <unit>]`.
  `<unit>` is inferred from the `:field` the clause is being compared to (if any), otherwise falls back to `default.`"
  {:deprecated "0.57.0"}
  [m]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (lib.util.match/replace m
    [clause field & (args :guard (partial some (partial = [:relative-datetime :current])))]
    (let [temporal-unit (or (lib.util.match/match-lite-recursive field
                              [:field _ {:temporal-unit temporal-unit}] temporal-unit)
                            :default)]
      (into [clause field] (lib.util.match/replace args
                             [:relative-datetime :current]
                             [:relative-datetime 0 temporal-unit])))))

(def ^{:deprecated "0.57.0"} temporal-extract-ops->unit
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
   [:get-day-of-week :iso]      :day-of-week-iso
   [:get-hour        nil]       :hour-of-day
   [:get-minute      nil]       :minute-of-hour
   [:get-second      nil]       :second-of-minute})

(def ^:private ^{:deprecated "0.57.0"} temporal-extract-ops
  #_{:clj-kondo/ignore [:deprecated-var]}
  (->> (keys temporal-extract-ops->unit)
       (map first)
       set))

(defn- desugar-temporal-extract
  "Replace datetime extractions clauses like `[:get-year field]` with `[:temporal-extract field :year]`."
  {:deprecated "0.57.0"}
  [m]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (lib.util.match/replace m
    [(op :guard temporal-extract-ops) field & args]
    [:temporal-extract field (temporal-extract-ops->unit [op (first args)])]))

(defn- desugar-divide-with-extra-args
  {:deprecated "0.57.0"}
  [expression]
  (lib.util.match/replace expression
    [:/ x y z & more]
    (recur (into [:/ [:/ x y]] (cons z more)))))

(defn- temporal-case-expression
  "Creates a `:case` expression with a condition for each value of the given unit."
  {:deprecated "0.57.0"}
  [column unit n]
  (let [user-locale #?(:clj  (i18n/user-locale)
                       :cljs nil)]
    [:case
     (vec (for [raw-value (range 1 (inc n))]
            [[:= column raw-value] (u.time/format-unit raw-value unit user-locale)]))
     {:default ""}]))

(defn- desugar-temporal-names
  "Given an expression like `[:month-name column]`, transforms this into a `:case` expression, which matches the input
  numbers and transforms them into names.

  Uses the user's locale rather than the site locale, so the results will depend on the runner of the query, not just
  the query itself. Filtering should be done based on the number, rather than the name."
  {:deprecated "0.57.0"}
  [expression]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (lib.util.match/replace expression
    [:month-name column]
    (recur (temporal-case-expression column :month-of-year 12))
    [:quarter-name column]
    (recur (temporal-case-expression column :quarter-of-year 4))
    [:day-name column]
    (recur (temporal-case-expression column :day-of-week 7))))

(mu/defn desugar-expression :- ::mbql.s/FieldOrExpressionDef
  "Rewrite various 'syntactic sugar' expressions like `:/` with more than two args into something simpler for drivers
  to compile."
  {:deprecated "0.57.0"}
  [expression :- ::mbql.s/FieldOrExpressionDef]
  #_{:clj-kondo/ignore [:deprecated-var]}
  ;; The `mbql.jvm-u/desugar-host-and-domain` is implemented only for jvm because regexes are not compatible with
  ;; Safari.
  (let [desugar-host-and-domain* #?(:clj  mbql.jvm-u/desugar-host-and-domain
                                    :cljs (fn [x]
                                            (log/warn "`desugar-host-and-domain` implemented only on JVM.")
                                            x))]
    (-> expression
        desugar-divide-with-extra-args
        desugar-host-and-domain*
        desugar-temporal-names)))

(defn- maybe-desugar-expression
  {:deprecated "0.57.0"}
  [clause]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (cond-> clause
    (mbql.preds/FieldOrExpressionDef? clause) desugar-expression))

(mu/defn desugar-filter-clause :- mbql.s/Filter
  "Rewrite various 'syntatic sugar' filter clauses like `:time-interval` and `:inside` as simpler, logically
  equivalent clauses. This can be used to simplify the number of filter clauses that need to be supported by anything
  that needs to enumerate all the possible filter types (such as driver query processor implementations, or the
  implementation [[negate-filter-clause]] below.)

  DEPRECATED: This will be removed in a future release. Use [[metabase.lib.core/desugar-filter-clause]] instead going
  forward."
  {:deprecated "0.57.0"}
  [filter-clause :- mbql.s/Filter]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (-> filter-clause
      desugar-current-relative-datetime
      desugar-in
      desugar-multi-argument-comparisons
      desugar-does-not-contain
      desugar-time-interval
      desugar-relative-time-interval
      desugar-is-null-and-not-null
      desugar-is-empty-and-not-empty
      desugar-inside
      simplify-compound-filter
      desugar-temporal-extract
      desugar-during
      desugar-if
      maybe-desugar-expression))

(defmulti ^:private negate*
  {:arglists '([mbql-clause])}
  first)

(defmethod negate* :not [[_ subclause]]    subclause)
(defmethod negate* :and [[_ & subclauses]] (into [:or]  (map negate* subclauses)))
(defmethod negate* :or  [[_ & subclauses]] (into [:and] (map negate* subclauses)))
(defmethod negate* :=   [[_ field value]]  [:!= field value])
(defmethod negate* :!=  [[_ field value]]  [:=  field value])
(defmethod negate* :>   [[_ field value]]  [:<= field value])
(defmethod negate* :<   [[_ field value]]  [:>= field value])
(defmethod negate* :>=  [[_ field value]]  [:<  field value])
(defmethod negate* :<=  [[_ field value]]  [:>  field value])

(defmethod negate* :between
  [[_ field min-value max-value]]
  [:or [:< field min-value] [:> field max-value]])

(defmethod negate* :contains    [clause] [:not clause])
(defmethod negate* :starts-with [clause] [:not clause])
(defmethod negate* :ends-with   [clause] [:not clause])

(mu/defn negate-filter-clause :- mbql.s/Filter
  "Return the logical compliment of an MBQL filter clause, generally without using `:not` (except for the string
  filter clause types). Useful for generating highly optimized filter clauses and for drivers that do not support
  top-level `:not` filter clauses."
  [filter-clause :- mbql.s/Filter]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (-> filter-clause desugar-filter-clause negate* simplify-compound-filter))

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

(mu/defn expression-with-name :- ::mbql.s/FieldOrExpressionDef
  "Return the expression referenced by a given `expression-name`."
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
      ([an-alias]
       (generate-name (gensym) an-alias))

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
                (swap! id+original->unique assoc [id name-key] candidate)
                (recur id candidate))))))))))

(mu/defn uniquify-names :- [:and
                            [:sequential :string]
                            [:fn
                             {:error/message "sequence of unique strings"}
                             distinct?]]
  "Make the names in a sequence of string names unique by adding suffixes such as `_2`.

     (uniquify-names [\"count\" \"sum\" \"count\" \"count_2\"])
     ;; -> [\"count\" \"sum\" \"count_2\" \"count_2_2\"]"
  {:deprecated "0.57.0"}
  [names :- [:sequential :string]]
  (map (unique-name-generator) names))

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
  "Returns options in a `:field`, `:expression`, or `:aggregation` clause."
  [[_ _ opts]]
  opts)

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
  "Set the `:temporal-unit` of a `:field` clause to `unit`.

  DEPRECATED -- use [[metabase.lib.core/with-temporal-bucket]] in new code."
  {:deprecated "0.57.0"}
  [[_ _ {:keys [base-type]} :as clause] unit]
  ;; it doesn't make sense to call this on an `:expression` or `:aggregation`.
  (assert (is-clause? :field clause))
  (if (or (not base-type)
          (mbql.s/valid-temporal-unit-for-base-type? base-type unit))
    (assoc-field-options clause :temporal-unit unit)
    (do
      (log/warnf "%s is not a valid temporal unit for %s; not adding to clause %s" unit base-type (pr-str clause))
      clause)))

(defn referenced-field-ids
  "Find all the `:field` references with integer IDs in `coll`, which can be a full MBQL query, a snippet of MBQL, or a
  sequence of those things; return a set of Field IDs. Includes Fields referenced indirectly via `:source-field`.
  Returns `nil` if no IDs are found.

  DEPRECATED: Use [[metabase.lib.core/all-field-ids]] going forward."
  {:deprecated "0.57.0"}
  [coll]
  (not-empty
   (into #{}
         (comp cat (filter some?))
         (lib.util.match/match coll
           [:field (id :guard integer?) opts]
           [id (:source-field opts)]))))

(defn pred-matches-form?
  "Check if `form` or any of its children forms match `pred`. This function is used for validation; during normal
  operation it will never match, so calling this function before `matching-locations` is more efficient."
  [form pred]
  (cond
    (pred form)        true
    (map? form)        (reduce-kv (fn [b _ v] (or b (pred-matches-form? v pred))) false form)
    (sequential? form) (reduce (fn [b x] (or b (pred-matches-form? x pred))) false form)
    :else              false))

(defn matching-locations
  "Find the forms matching pred, returns a list of tuples of location (as used in get-in) and the match."
  [form pred]
  ;; Surprisingly enough, a list works better as a stack here than a vector.
  (loop [stack (list [[] form]), matches []]
    (if-let [[loc form :as top] (peek stack)]
      (let [stack (pop stack)
            map-onto-stack #(transduce (map (fn [[k v]] [(conj loc k) v])) conj stack %)
            seq-onto-stack #(transduce (map-indexed (fn [i v] [(conj loc i) v])) conj stack %)]
        (cond
          (pred form)        (recur stack                 (conj matches top))
          (map? form)        (recur (map-onto-stack form) matches)
          (sequential? form) (recur (seq-onto-stack form) matches)
          :else              (recur stack                 matches)))
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
