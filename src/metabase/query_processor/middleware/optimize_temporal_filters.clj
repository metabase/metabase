(ns metabase.query-processor.middleware.optimize-temporal-filters
  "Middlware that optimizes equality filter clauses against bucketed temporal fields. See docstring for
  `optimize-temporal-filters` for more details."
  (:require
   [clojure.walk :as walk]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private optimizable-units
  #{:second :minute :hour :day :week :month :quarter :year})

;;; TODO -- we can use [[metabase.lib/temporal-bucket]] for this once we convert this middleware to MLv2
(defn- temporal-unit [field]
  (lib.util.match/match-one field [(_ :guard #{:field :expression}) _ (opts :guard :temporal-unit)] (:temporal-unit opts)))

(defn- optimizable-field? [field]
  (lib.util.match/match-one field
    [(_ :guard #{:field :expression}) _ (_ :guard (comp optimizable-units :temporal-unit))]))

(defmulti ^:private can-optimize-filter?
  mbql.u/dispatch-by-clause-name-or-class)

(defn- optimizable-temporal-value?
  "Can `temporal-value` clause can be optimized?"
  [temporal-value]
  (lib.util.match/match-one temporal-value
    [:relative-datetime (_ :guard #{0 :current})]
    true

    [(_ :guard #{:absolute-datetime :relative-datetime}) _ (unit :guard optimizable-units)]
    true))

(defn- field-and-temporal-value-have-compatible-units?
  "Do datetime `field` clause and `temporal-value` clause have 'compatible' units that mean we'll be able to optimize
  the filter clause they're in?"
  [field temporal-value]
  (lib.util.match/match-one temporal-value
    [:relative-datetime (_ :guard #{0 :current})]
    true

    [(_ :guard #{:absolute-datetime :relative-datetime}) _ (unit :guard optimizable-units)]
    (= (temporal-unit field) unit)))

;;; TODO -- once we convert this middleware to MLv2 we can use [[metabase.lib.metadata.calculation/type-of]]
(defn- field-or-expression-effective-type [field-or-expression]
  (lib.util.match/match-one field-or-expression
    [(_tag :guard #{:field :expression}) _ (opts :guard :effective-type)]
    (:effective-type opts)

    [:field (id :guard pos-int?) _opts]
    (when-let [field (lib.metadata/field (qp.store/metadata-provider) id)]
      (:effective-type field))

    [(_tag :guard #{:field :expression}) _ (opts :guard :base-type)]
    (:base-type opts)))

(defmethod can-optimize-filter? :default
  [filter-clause]
  (lib.util.match/match-one filter-clause
    [_tag
     (field :guard optimizable-field?)
     (temporal-value :guard optimizable-temporal-value?)]
    (field-and-temporal-value-have-compatible-units? field temporal-value)))

(defmethod can-optimize-filter? :between
  [filter-clause]
  (lib.util.match/match-one filter-clause
    [_
     (field :guard optimizable-field?)
     (temporal-value-1 :guard optimizable-temporal-value?)
     (temporal-value-2 :guard optimizable-temporal-value?)]
    (and (field-and-temporal-value-have-compatible-units? field temporal-value-1)
         (field-and-temporal-value-have-compatible-units? field temporal-value-2))))

(mu/defn ^:private temporal-literal-lower-bound
  [unit t :- (ms/InstanceOfClass java.time.temporal.Temporal)]
  (:start (u.date/range t unit)))

(mu/defn ^:private temporal-literal-upper-bound
  [unit t :- (ms/InstanceOfClass java.time.temporal.Temporal)]
  (:end (u.date/range t unit)))

(defn- change-temporal-unit-to-default [field]
  (lib.util.match/replace field
    [(_ :guard #{:field :expression}) _ (_ :guard (comp optimizable-units :temporal-unit))]
    (mbql.u/update-field-options &match assoc :temporal-unit :default)

    [:absolute-datetime t _unit]
    [:absolute-datetime t :default]))

(defmulti ^:private temporal-value-lower-bound
  "Get a clause representing the *lower* bound that should be used when converting a `temporal-value-clause` (e.g.
  `:absolute-datetime` or `:relative-datetime`) to an optimized range."
  {:arglists '([temporal-value-clause temporal-unit])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmulti ^:private temporal-value-upper-bound
  "Get a clause representing the *upper* bound that should be used when converting a `temporal-value-clause` (e.g.
  `:absolute-datetime` or `:relative-datetime`) to an optimized range."
  {:arglists '([temporal-value-clause temporal-unit])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmethod temporal-value-lower-bound :absolute-datetime
  [[_ t unit] _]
  [:absolute-datetime (temporal-literal-lower-bound unit t) :default])

(defmethod temporal-value-upper-bound :absolute-datetime
  [[_ t unit] _]
  [:absolute-datetime (temporal-literal-upper-bound unit t) :default])

(defmethod temporal-value-lower-bound :relative-datetime
  [[_ n unit] temporal-unit]
  [:relative-datetime (if (= n :current) 0 n) (or unit temporal-unit)])

(defmethod temporal-value-upper-bound :relative-datetime
  [[_ n unit] temporal-unit]
  [:relative-datetime (inc (if (= n :current) 0 n)) (or unit temporal-unit)])

(defn- date-field-with-day-bucketing? [x]
  (and (isa? (field-or-expression-effective-type x) :type/Date)
       (= (temporal-unit x) :day)))

(defmulti ^:private optimize-filter
  "Optimize a filter clause against a temporal-bucketed `:field` or `:expression` clause and `:absolute-datetime` or `:relative-datetime`
  value by converting to an unbucketed range."
  {:arglists '([clause])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmethod optimize-filter :=
  [[_tag field temporal-value]]
  (if (date-field-with-day-bucketing? field)
    [:= (change-temporal-unit-to-default field) (change-temporal-unit-to-default temporal-value)]
    (let [temporal-unit (lib.util.match/match-one field
                          [(_ :guard #{:field :expression}) _ (opts :guard :temporal-unit)]
                          (:temporal-unit opts))]
      (when (field-and-temporal-value-have-compatible-units? field temporal-value)
        (let [field' (change-temporal-unit-to-default field)]
          [:and
           [:>= field' (temporal-value-lower-bound temporal-value temporal-unit)]
           [:< field'  (temporal-value-upper-bound temporal-value temporal-unit)]])))))

(defmethod optimize-filter :!=
  [[_tag field temporal-value :as filter-clause]]
  (if (date-field-with-day-bucketing? field)
    [:!= (change-temporal-unit-to-default field) (change-temporal-unit-to-default temporal-value)]
    (mbql.u/negate-filter-clause ((get-method optimize-filter :=) filter-clause))))

(defn- optimize-comparison-filter
  [optimize-temporal-value-fn [tag field temporal-value] new-filter-type]
  (if (date-field-with-day-bucketing? field)
    [tag (change-temporal-unit-to-default field) (change-temporal-unit-to-default temporal-value)]
    [new-filter-type
     (change-temporal-unit-to-default field)
     (optimize-temporal-value-fn temporal-value (temporal-unit field))]))

(defmethod optimize-filter :<
  [filter-clause]
  (optimize-comparison-filter temporal-value-lower-bound filter-clause :<))

(defmethod optimize-filter :<=
  [filter-clause]
  (optimize-comparison-filter temporal-value-upper-bound filter-clause :<))

(defmethod optimize-filter :>
  [filter-clause]
  (optimize-comparison-filter temporal-value-upper-bound filter-clause :>=))

(defmethod optimize-filter :>=
  [filter-clause]
  (optimize-comparison-filter temporal-value-lower-bound filter-clause :>=))

(defmethod optimize-filter :between
  [[_tag field lower-bound upper-bound]]
  (if (date-field-with-day-bucketing? field)
    [:between
     (change-temporal-unit-to-default field)
     (change-temporal-unit-to-default lower-bound)
     (change-temporal-unit-to-default upper-bound)]
    (let [field' (change-temporal-unit-to-default field)]
      [:and
       [:>= field' (temporal-value-lower-bound lower-bound (temporal-unit field))]
       [:<  field' (temporal-value-upper-bound upper-bound (temporal-unit field))]])))

(defn- optimize-temporal-filters* [query]
  (lib.util.match/replace query
    (_ :guard (partial mbql.u/is-clause? (set (keys (methods optimize-filter)))))
    (or (when (can-optimize-filter? &match)
          (u/prog1 (optimize-filter &match)
            (if <>
              (when-not (= &match <>)
                (log/tracef "Optimized filter %s to %s" (pr-str &match) (pr-str <>)))
              ;; if for some reason `optimize-filter` doesn't return an optimized filter clause, log and error and use
              ;; the original. `can-optimize-filter?` shouldn't have said we could optimize this filter in the first
              ;; place
              (log/error "Error optimizing temporal filter clause" (pr-str &match)))))
        &match)))

(defn optimize-temporal-filters
  "Middlware that optimizes equality (`=` and `!=`) and comparison (`<`, `between`, etc.) filter clauses against
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
  [{query-type :type, :as query}]
  (if (not= query-type :query)
    query
    ;; walk query, looking for inner-query forms that have a `:filter` key
    (walk/postwalk
     (fn [form]
       (if-not (and (map? form) (seq (:filter form)))
         form
         ;; optimize the filters in this inner-query form.
         (let [optimized (optimize-temporal-filters* form)]
           ;; if we did some optimizations, we should flatten/deduplicate the filter clauses afterwards.
           (cond-> optimized
             (not= optimized form) (update :filter mbql.u/combine-filter-clauses)))))
     query)))
