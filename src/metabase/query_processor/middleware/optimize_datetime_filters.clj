(ns metabase.query-processor.middleware.optimize-datetime-filters
  "Middlware that optimizes equality (`=` and `!=`) and comparison (`<`, `between`, etc.) filter clauses against
  bucketed datetime fields. See docstring for `optimize-datetime-filters` for more details."
  (:require [clojure.tools.logging :as log]
            [metabase.mbql.util :as mbql.u]
            [metabase.util.date-2 :as u.date]))

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

(defmethod can-optimize-filter? :default
  [filter-clause]
  (mbql.u/match-one filter-clause
    [_ (field :guard optimizable-field?) [:absolute-datetime _ (unit :guard optimizable-units)]]
    (= (datetime-field-unit field) unit)))

(defmethod can-optimize-filter? :between
  [filter-clause]
  (mbql.u/match-one filter-clause
    [_
     (field :guard optimizable-field?)
     [:absolute-datetime _ (unit-1 :guard optimizable-units)]
     [:absolute-datetime _ (unit-2 :guard optimizable-units)]]
    (= (datetime-field-unit field) unit-1 unit-2)))

(defn- lower-bound [unit t]
  (:start (u.date/range t unit)))

(defn- upper-bound [unit t]
  (:end (u.date/range t unit)))

(defn- change-datetime-field-unit-to-default [field]
  (mbql.u/replace field
    [:datetime-field wrapped _]
    [:datetime-field wrapped :default]))

(defmulti ^:private optimize-filter
  {:arglists '([clause])}
  (fn [clause]
    (mbql.u/dispatch-by-clause-name-or-class clause)))

(defmethod optimize-filter :=
  [[_ field [_ inst unit]]]
  (let [[_ _ datetime-field-unit] (mbql.u/match-one field :datetime-field)]
    (when (= unit datetime-field-unit)
      (let [field' (change-datetime-field-unit-to-default field)]
        [:and
         [:>= field' [:absolute-datetime (lower-bound unit inst) :default]]
         [:< field'  [:absolute-datetime (upper-bound unit inst) :default]]]))))

(defmethod optimize-filter :!=
  [filter-clause]
  (mbql.u/negate-filter-clause ((get-method optimize-filter :=) filter-clause)))

(defn- optimize-comparison-filter
  [trunc-fn [filter-type field [_ inst unit]] new-filter-type]
  [new-filter-type
   (change-datetime-field-unit-to-default field)
   [:absolute-datetime (trunc-fn unit inst) :default]])

(defmethod optimize-filter :<
  [filter-clause]
  (optimize-comparison-filter lower-bound filter-clause :<))

(defmethod optimize-filter :<=
  [filter-clause]
  (optimize-comparison-filter upper-bound filter-clause :<))

(defmethod optimize-filter :>
  [filter-clause]
  (optimize-comparison-filter upper-bound filter-clause :>=))

(defmethod optimize-filter :>=
  [filter-clause]
  (optimize-comparison-filter lower-bound filter-clause :>=))

(defmethod optimize-filter :between
  [[_ field [_ lower unit] [_ upper]]]
  (let [field' (change-datetime-field-unit-to-default field)]
    [:and
     [:>= field' [:absolute-datetime (lower-bound unit lower) :default]]
     [:<  field' [:absolute-datetime (upper-bound unit upper) :default]]]))

(defn- optimize-datetime-filters* [{query-type :type, :as query}]
  (if (not= query-type :query)
    query
    (mbql.u/replace query
      (_ :guard (partial mbql.u/is-clause? (set (keys (methods optimize-filter)))))
      (if (can-optimize-filter? &match)
        (let [optimized (optimize-filter &match)]
          (when-not (= &match optimized)
            (log/tracef "Optimized filter %s to %s" (pr-str &match) (pr-str optimized)))
          optimized)
        &match))))

(defn optimize-datetime-filters
  "Middlware that optimizes equality (`=` and `!=`) and comparison (`<`, `between`, etc.) filter clauses against
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
    (qp (optimize-datetime-filters* query) rff context)))
