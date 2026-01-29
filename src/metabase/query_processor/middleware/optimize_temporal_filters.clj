(ns metabase.query-processor.middleware.optimize-temporal-filters
  "Middleware that optimizes equality filter clauses against bucketed temporal fields. See docstring for
  `optimize-temporal-filters` for more details."
  (:refer-clojure :exclude [get-in])
  (:require
   [better-cond.core :as b]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [get-in]]))

(def ^:private optimizable-units
  #{:second :minute :hour :day :week :month :quarter :year})

(defn- temporal-ref? [x]
  (and (lib.util/clause-of-type? x #{:field :expression})
       (or (lib/raw-temporal-bucket x)
           (let [[_field opts _id-or-name] x]
             (when-let [expr-type ((some-fn :effective-type :base-type) opts)]
               (isa? expr-type :type/Temporal))))))

(defn- optimizable-expr? [expr]
  (lib.util.match/match-one expr
    #{:field :expression}
    (and (temporal-ref? &match)
         (let [unit (or (lib/raw-temporal-bucket &match) :default)]
           (or (= unit :default)
               (contains? optimizable-units unit))))))

(defmulti ^:private can-optimize-filter?
  {:arglists '([mbql-clause])}
  lib/dispatch-value)

(defn- optimizable-temporal-value?
  "Can `temporal-value` clause can be optimized?"
  [temporal-value]
  (lib.util.match/match-one temporal-value
    [:relative-datetime _opts (_n :guard #{0 :current})]
    true

    [(_tag :guard #{:absolute-datetime :relative-datetime}) _opts _n _unit]
    (let [unit (or (lib/raw-temporal-bucket &match) :default)]
      (or (= unit :default)
          (contains? optimizable-units unit)))))

(defn- field-and-temporal-value-have-compatible-units?
  "Do datetime `field` clause and `temporal-value` clause have 'compatible' units that mean we'll be able to optimize
  the filter clause they're in?"
  [field temporal-value]
  (lib.util.match/match-one temporal-value
    [:relative-datetime _opts (_n :guard #{0 :current})]
    true

    [(_tag :guard #{:absolute-datetime :relative-datetime}) _opts _n _unit]
    (let [field-unit (or (lib/raw-temporal-bucket field) :default)
          value-unit (or (lib/raw-temporal-bucket &match) :default)]
      (cond
        (= field-unit :default) (contains? optimizable-units value-unit)
        (= value-unit :default) (contains? optimizable-units field-unit)
        :else                   (= field-unit value-unit)))))

(defmethod can-optimize-filter? :default
  [filter-clause]
  (lib.util.match/match-one filter-clause
    [_tag
     _opts
     (field :guard optimizable-expr?)
     (temporal-value :guard optimizable-temporal-value?)]
    (field-and-temporal-value-have-compatible-units? field temporal-value)))

(defn- not-default-bucket-clause?
  [clause]
  (and (vector? clause)
       (not= :default (get-in clause [2 :temporal-unit]))))

;; TODO: I believe we do not generate __filter clauses that have default temporal bucket on column arg which should be
;;       optimized__. Unfortunately I'm not certain about that. If I was, the following `can-optimize-filter? :>=` and
;;       `can-optimize-filter? :>=` definitions would be redundant after update of `optimizable-expr?`, ie. changing
;;       the logic to something along "if `expr` has default temporal unit we should not optimize".

(defmethod can-optimize-filter? :>=
  [filter-clause]
  (lib.util.match/match-one
    filter-clause
    [_tag
     _opts
    ;; Don't optimize >= with column that has default temporal bucket
     (field :guard (every-pred not-default-bucket-clause? optimizable-expr?))
     (temporal-value :guard optimizable-temporal-value?)]
    (field-and-temporal-value-have-compatible-units? field temporal-value)))

(defmethod can-optimize-filter? :<
  [filter-clause]
  (lib.util.match/match-one
    filter-clause
    [_tag
     _opts
     ;; Don't optimize < with column that has default temporal bucket
     (field :guard (every-pred not-default-bucket-clause? optimizable-expr?))
     (temporal-value :guard optimizable-temporal-value?)]
    (field-and-temporal-value-have-compatible-units? field temporal-value)))

(defmethod can-optimize-filter? :between
  [filter-clause]
  (lib.util.match/match-one filter-clause
    [:between
     _opts
     [(_offset :guard #{:+ :-})
      _plus_minus_opts
      (field :guard (every-pred (comp #{:field :expression} first) optimizable-expr?))
      [:interval _interval_opts _n _unit]]
     (temporal-value-1 :guard optimizable-temporal-value?)
     (temporal-value-2 :guard optimizable-temporal-value?)]
    (and (field-and-temporal-value-have-compatible-units? field temporal-value-1)
         (field-and-temporal-value-have-compatible-units? field temporal-value-2))

    [:between
     _opts
     (field :guard (every-pred (comp #{:field :expression} first) optimizable-expr?))
     (temporal-value-1 :guard optimizable-temporal-value?)
     (temporal-value-2 :guard optimizable-temporal-value?)]
    (and (field-and-temporal-value-have-compatible-units? field temporal-value-1)
         (field-and-temporal-value-have-compatible-units? field temporal-value-2))))

(mr/def ::temporal
  (lib.schema.common/instance-of-class java.time.temporal.Temporal))

(mu/defn- temporal-literal-lower-bound :- ::temporal
  [unit :- (into [:enum] u.date/add-units)
   t    :- ::temporal]
  (:start (u.date/range t unit)))

(mu/defn- temporal-literal-upper-bound :- ::temporal
  [unit :- (into [:enum] u.date/add-units)
   t    :- ::temporal]
  (:end (u.date/range t unit)))

(defn- change-temporal-unit-to-default [field]
  (lib.util.match/replace field
    [(_tag :guard #{:field :expression}) (_opts :guard (comp optimizable-units :temporal-unit)) _id-or-name]
    (lib/update-options &match assoc :temporal-unit :default)

    [:absolute-datetime _opts t _unit]
    [:absolute-datetime _opts t :default]))

(defmulti ^:private temporal-value-lower-bound
  "Get a clause representing the *lower* bound that should be used when converting a `temporal-value-clause` (e.g.
  `:absolute-datetime` or `:relative-datetime`) to an optimized range."
  {:arglists '([temporal-value-clause temporal-unit])}
  (fn [temporal-value-clause _temporal-unit]
    (lib/dispatch-value temporal-value-clause)))

(defmulti ^:private temporal-value-upper-bound
  "Get a clause representing the *upper* bound that should be used when converting a `temporal-value-clause` (e.g.
  `:absolute-datetime` or `:relative-datetime`) to an optimized range."
  {:arglists '([temporal-value-clause temporal-unit])}
  (fn [temporal-value-clause _temporal-unit]
    (lib/dispatch-value temporal-value-clause)))

(defmethod temporal-value-lower-bound :default
  [_temporal-value-clause _temporal-unit]
  nil)

(defmethod temporal-value-upper-bound :default
  [_temporal-value-clause _temporal-unit]
  nil)

(mr/def ::date-add-unit
  (into [:enum] u.date/add-units))

(mu/defn- target-unit-for-new-bound :- [:maybe ::date-add-unit]
  [value-unit :- [:maybe :keyword]
   field-unit :- [:maybe :keyword]]
  (or (when (and value-unit
                 (not= value-unit :default))
        value-unit)
      (when (and field-unit
                 (not= field-unit :default))
        field-unit)))

(mu/defmethod temporal-value-lower-bound :absolute-datetime :- :mbql.clause/absolute-datetime
  [[_tag _opts t unit] temporal-unit]
  (let [target-unit (target-unit-for-new-bound unit temporal-unit)]
    (lib/absolute-datetime (temporal-literal-lower-bound target-unit t) :default)))

(mu/defmethod temporal-value-upper-bound :absolute-datetime :- :mbql.clause/absolute-datetime
  [[_tag _opts t unit] temporal-unit]
  (let [target-unit (target-unit-for-new-bound unit temporal-unit)]
    (lib/absolute-datetime (temporal-literal-upper-bound target-unit t) :default)))

(mu/defmethod temporal-value-lower-bound :relative-datetime :- [:maybe :mbql.clause/relative-datetime]
  [[_tag _opts n unit] temporal-unit]
  (when-not (= temporal-unit :default)
    (let [target-unit (target-unit-for-new-bound unit temporal-unit)]
      (lib/relative-datetime (if (= n :current) 0 n) target-unit))))

(mu/defmethod temporal-value-upper-bound :relative-datetime :- [:maybe :mbql.clause/relative-datetime]
  [[_tag _opts n unit] temporal-unit]
  (when-not (= temporal-unit :default)
    (let [target-unit (target-unit-for-new-bound unit temporal-unit)]
      (lib/relative-datetime (inc (if (= n :current) 0 n)) target-unit))))

(mu/defn- date-field-with-day-bucketing?
  [query path expr :- [:maybe ::lib.schema.expression/expression]]
  (and (isa? (lib.walk/apply-f-for-stage-at-path lib/type-of query path expr) :type/Date)
       (= (lib/raw-temporal-bucket expr) :day)))

(defmulti ^:private optimize-filter
  "Optimize a filter clause against a temporal-bucketed `:field` or `:expression` clause and `:absolute-datetime` or
  `:relative-datetime`value by converting to an unbucketed range."
  {:arglists '([query path clause])}
  (fn [_query _path clause]
    (lib/dispatch-value clause)))

(defmethod optimize-filter :=
  [query path [_tag _opts field temporal-value]]
  (if (date-field-with-day-bucketing? query path field)
    (lib/= (change-temporal-unit-to-default field) (change-temporal-unit-to-default temporal-value))
    (let [temporal-unit (lib/raw-temporal-bucket field)]
      (when (field-and-temporal-value-have-compatible-units? field temporal-value)
        (when-let [lower-bound (temporal-value-lower-bound temporal-value temporal-unit)]
          (when-let [upper-bound (temporal-value-upper-bound temporal-value temporal-unit)]
            (let [field' (change-temporal-unit-to-default field)]
              (lib/and
               (lib/>= field' lower-bound)
               (lib/< (lib/fresh-uuids field') upper-bound)))))))))

(defmethod optimize-filter :!=
  [query path [_tag _opts field temporal-value :as filter-clause]]
  (if (date-field-with-day-bucketing? query path field)
    (lib/!= (change-temporal-unit-to-default field) (change-temporal-unit-to-default temporal-value))
    (when-let [optimized ((get-method optimize-filter :=) query path filter-clause)]
      (lib/negate-boolean-expression optimized))))

(mu/defn- optimize-comparison-filter :- [:maybe ::lib.schema.mbql-clause/clause]
  [query path optimize-temporal-value-fn [tag opts field temporal-value] new-filter-type :- [:enum :< :>=]]
  (b/cond
    (date-field-with-day-bucketing? query path field)
    [tag opts (change-temporal-unit-to-default field) (change-temporal-unit-to-default temporal-value)]

    :let [new-bound (optimize-temporal-value-fn temporal-value (lib/raw-temporal-bucket field))]
    new-bound
    ((case new-filter-type
       :<  lib/<
       :>= lib/>=)
     (change-temporal-unit-to-default field)
     new-bound)

    :else
    (log/errorf "optimize-temporal-value-fn %s did not return a new bound" optimize-temporal-value-fn)))

(defmethod optimize-filter :<
  [query path filter-clause]
  (optimize-comparison-filter query path #'temporal-value-lower-bound filter-clause :<))

(defmethod optimize-filter :<=
  [query path filter-clause]
  (optimize-comparison-filter query path #'temporal-value-upper-bound filter-clause :<))

(defmethod optimize-filter :>
  [query path filter-clause]
  (optimize-comparison-filter query path #'temporal-value-upper-bound filter-clause :>=))

(defmethod optimize-filter :>=
  [query path filter-clause]
  (optimize-comparison-filter query path #'temporal-value-lower-bound filter-clause :>=))

(defmethod optimize-filter :between
  [query path [_tag _opts field lower-bound upper-bound]]
  (if (date-field-with-day-bucketing? query path field)
    (lib/between
     (change-temporal-unit-to-default field)
     (change-temporal-unit-to-default lower-bound)
     (change-temporal-unit-to-default upper-bound))
    (when-let [new-lower-bound (temporal-value-lower-bound lower-bound (lib/raw-temporal-bucket field))]
      (when-let [new-upper-bound (temporal-value-upper-bound upper-bound (lib/raw-temporal-bucket field))]
        (let [field' (change-temporal-unit-to-default field)]
          (lib/and
           (lib/>= field' new-lower-bound)
           (lib/<  (lib/fresh-uuids field') new-upper-bound)))))))

(def ^:private optimizable-filter-types
  (set (keys (methods optimize-filter))))

(defn- optimize-temporal-filters* [query path clause]
  (when (lib.util/clause-of-type? clause optimizable-filter-types)
    (or (when (can-optimize-filter? clause)
          (u/prog1 (optimize-filter query path clause)
            (if <>
              (when-not (= clause <>)
                (log/tracef "Optimized filter %s to %s" (pr-str clause) (pr-str <>)))
              ;; if for some reason `optimize-filter` doesn't return an optimized filter clause, log and error and use
              ;; the original. `can-optimize-filter?` shouldn't have said we could optimize this filter in the first
              ;; place
              (log/error "Error optimizing temporal filter clause: optimize-filter unexpectedly returned nil" (pr-str clause)))))
        clause)))

(mu/defn optimize-temporal-filters :- ::lib.schema/query
  "Middleware that optimizes equality (`=` and `!=`) and comparison (`<`, `between`, etc.) filter clauses against
  bucketed datetime fields. Rewrites those filter clauses as logically equivalent filter clauses that do not use
  bucketing (i.e., their datetime unit is `:default`, meaning no bucketing functions need be applied).

    [:= [:field 1 {:temporal-unit :month}] [:absolute-datetime #t \"2019-09-01\" :month]]
    ->
    [:and
     [:>= [:field 1 {:temporal-unit :default}] [:absolute-datetime #t \"2019-09-01\" :month]]
     [:<  [:field 1 {:temporal-unit :default}] [:absolute-datetime #t \"2019-10-01\" :month]]]

  The equivalent SQL, before and after, looks like:

    -- before
    SELECT ... WHERE date_trunc('month', my_field) = date_trunc('month', timestamp '2019-09-01 00:00:00')

    -- after
    SELECT ... WHERE my_field >= timestamp '2019-09-01 00:00:00' AND my_field < timestamp '2019-10-01 00:00:00'

  The idea here is that by avoiding casts/extraction/truncation operations, databases will be able to make better use
  of indexes on these columns.

  This namespace expects to run *after* the `wrap-value-literals` middleware, meaning datetime literal strings like
  `\"2019-09-24\"` should already have been converted to `:absolute-datetime` clauses."
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages
   query
   (fn [query path stage]
     (when (seq (:filters stage))
       (letfn [(update-filters [filters]
                 (let [filters' (lib.walk/walk-clauses* filters #(optimize-temporal-filters* query path %))]
                   (if (= filters' filters)
                     filters
                     ;; if we did some optimizations, we should flatten/deduplicate the filter clauses afterwards.
                     (lib/simplify-filters filters'))))]
         (update stage :filters update-filters))))))
