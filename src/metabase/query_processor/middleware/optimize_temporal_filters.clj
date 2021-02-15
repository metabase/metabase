(ns metabase.query-processor.middleware.optimize-temporal-filters
  "Middlware that optimizes equality filter clauses agat bucketed temporal fields. See docstring for
  `optimize-temporal-filters` for more details."
  (:require [clojure.tools.logging :as log]
            [metabase.mbql.util :as mbql.u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]))

(def ^:private optimizable-units
  #{:second :minute :hour :day :week :month :quarter :year})

(defn- datetime-field-unit [field]
  (last (mbql.u/match-one field :datetime-field)))

(defn- optimizable-field? [field]
  (mbql.u/match-one field
    [:datetime-field _ unit]
    (optimizable-units unit)))

(defmulti ^:private can-optimize-filter?
  mbql.u/dispatch-by-clause-name-or-class)

(defn- optimizable-temporal-value?
  "Can `temporal-value` clause can be optimized?"
  [temporal-value]
  (mbql.u/match-one temporal-value
    [:relative-datetime 0]
    true

    [(_ :guard #{:absolute-datetime :relative-datetime}) _ (unit :guard optimizable-units)]
    true))

(defn- field-and-temporal-value-have-compatible-units?
  "Do datetime `field` clause and `temporal-value` clause have 'compatible' units that mean we'll be able to optimize
  the filter clause they're in?"
  [field temporal-value]
  (mbql.u/match-one temporal-value
    [:relative-datetime (_ :guard #{0 :current})]
    true

    [(_ :guard #{:absolute-datetime :relative-datetime}) _ (unit :guard optimizable-units)]
    (= (datetime-field-unit field) unit)))

(defmethod can-optimize-filter? :default
  [filter-clause]
  (mbql.u/match-one filter-clause
    [_
     (field :guard optimizable-field?)
     (temporal-value :guard optimizable-temporal-value?)]
    (field-and-temporal-value-have-compatible-units? field temporal-value)))

(defmethod can-optimize-filter? :between
  [filter-clause]
  (mbql.u/match-one filter-clause
    [_
     (field :guard optimizable-field?)
     (temporal-value-1 :guard optimizable-temporal-value?)
     (temporal-value-2 :guard optimizable-temporal-value?)]
    (and (field-and-temporal-value-have-compatible-units? field temporal-value-1)
         (field-and-temporal-value-have-compatible-units? field temporal-value-2))))

(s/defn ^:private temporal-literal-lower-bound [unit t :- java.time.temporal.Temporal]
  (:start (u.date/range t unit)))

(s/defn ^:private temporal-literal-upper-bound [unit t :- java.time.temporal.Temporal]
  (:end (u.date/range t unit)))

(defn- change-datetime-field-unit-to-default [field]
  (mbql.u/replace field
    [:datetime-field wrapped _]
    [:datetime-field wrapped :default]))

(defmulti ^:private temporal-value-lower-bound
  "Get a clause representing the *lower* bound that should be used when converting a `temporal-value-clause` (e.g.
  `:absolute-datetime` or `:relative-datetime`) to an optimized range."
  {:arglists '([temporal-value-clause datetime-field-unit])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmulti ^:private temporal-value-upper-bound
  "Get a clause representing the *upper* bound that should be used when converting a `temporal-value-clause` (e.g.
  `:absolute-datetime` or `:relative-datetime`) to an optimized range."
  {:arglists '([temporal-value-clause datetime-field-unit])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmethod temporal-value-lower-bound :absolute-datetime
  [[_ t unit] _]
  [:absolute-datetime (temporal-literal-lower-bound unit t) :default])

(defmethod temporal-value-upper-bound :absolute-datetime
  [[_ t unit] _]
  [:absolute-datetime (temporal-literal-upper-bound unit t) :default])

(defmethod temporal-value-lower-bound :relative-datetime
  [[_ n unit] datetime-field-unit]
  [:relative-datetime n (or unit datetime-field-unit)])

(defmethod temporal-value-upper-bound :relative-datetime
  [[_ n unit] datetime-field-unit]
  [:relative-datetime (inc n) (or unit datetime-field-unit)])

(defmulti ^:private optimize-filter
  "Optimize a filter clause agat a bucketed `:datetime-field` clause and `:absolute-datetime` or `:relative-datetime`
  value by converting to an unbucketed range."
  {:arglists '([clause])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmethod optimize-filter :=
  [[_ field temporal-value]]
  (let [[_ _ datetime-field-unit] (mbql.u/match-one field :datetime-field)]
    (when (field-and-temporal-value-have-compatible-units? field temporal-value)
      (let [field' (change-datetime-field-unit-to-default field)]
        [:and
         [:>= field' (temporal-value-lower-bound temporal-value datetime-field-unit)]
         [:< field'  (temporal-value-upper-bound temporal-value datetime-field-unit)]]))))

(defmethod optimize-filter :!=
  [filter-clause]
  (mbql.u/negate-filter-clause ((get-method optimize-filter :=) filter-clause)))

(defn- optimize-comparison-filter
  [optimize-temporal-value-fn [filter-type field temporal-value] new-filter-type]
  [new-filter-type
   (change-datetime-field-unit-to-default field)
   (optimize-temporal-value-fn temporal-value (datetime-field-unit field))])

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
  [[_ field lower-bound upper-bound]]
  (let [field' (change-datetime-field-unit-to-default field)]
    [:and
     [:>= field' (temporal-value-lower-bound lower-bound (datetime-field-unit field))]
     [:<  field' (temporal-value-upper-bound upper-bound (datetime-field-unit field))]]))

(defn- optimize-temporal-filters* [{query-type :type, :as query}]
  (if (not= query-type :query)
    query
    (mbql.u/replace query
      (_ :guard (partial mbql.u/is-clause? (set (keys (methods optimize-filter)))))
      (if (can-optimize-filter? &match)
        (let [optimized (optimize-filter &match)]
          (when-not optimized
            (throw (ex-info (tru "Error optimizing temporal filter clause")
                            {:clause &match})))
          (when-not (= &match optimized)
            (log/tracef "Optimized filter %s to %s" (pr-str &match) (pr-str optimized)))
          optimized)
        &match))))

(defn optimize-temporal-filters
  "Middlware that optimizes equality (`=` and `!=`) and comparison (`<`, `between`, etc.) filter clauses agat
  bucketed datetime fields. Rewrites those filter clauses as logically equivalent filter clauses that do not use
  bucketing (i.e., their datetime unit is `:default`, meaning no bucketing functions need be applied).

    [:= [:datetime-field [:field-id 1] :month] [:absolute-datetime #t \"2019-09-01\" :month]]
    ->
    [:and
     [:>= [:datetime-field [:field-id 1] :default] [:absolute-datetime #t \"2019-09-01\" :month]]
     [:<  [:datetime-field [:field-id 1] :default] [:absolute-datetime #t \"2019-10-01\" :month]]]

  The equivalent SQL, before and after, looks like:

    -- before
    SELECT ... WHERE date_trunc('month', my_field) = date_trunc('month', timestamp '2019-09-01 00:00:00')

    -- after
    SELECT ... WHERE my_field >= timestamp '2019-09-01 00:00:00' AND my_field < timestamp '2019-10-01 00:00:00'

  The idea here is that by avoiding casts/extraction/truncation operations, databases will be able to make better use
  of indexes on these columns.

  This namespace expects to run *after* the `wrap-value-literals` middleware, meaning datetime literal strings like
  `\"2019-09-24\"` should already have been converted to `:absolute-datetime` clauses."
  [qp]
  (fn [query rff context]
    (qp (optimize-temporal-filters* query) rff context)))
