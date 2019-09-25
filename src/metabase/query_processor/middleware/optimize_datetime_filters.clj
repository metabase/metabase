(ns metabase.query-processor.middleware.optimize-datetime-filters
  "Middlware that optimizes `=` and `not=` datetime filters that use bucketing. Rewrites those filters as `between`
  filters that do not use bucketing, so the data warehouses can better utilize indexes."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.util.date :as du]))

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

(defn- lower-bound [unit inst]
  (du/date-trunc unit inst))

(defn- upper-bound [unit inst]
  (du/relative-date unit 1 (lower-bound unit inst)))

(defn- change-datetime-field-unit-to-default [field]
  (mbql.u/replace field
    [:datetime-field wrapped _]
    [:datetime-field wrapped :default]))

(defmulti ^:private optimize-filter
  mbql.u/dispatch-by-clause-name-or-class)

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
  [trunc-fn [filter-type field [_ inst unit]]]
  [filter-type (change-datetime-field-unit-to-default field) [:absolute-datetime (trunc-fn unit inst) :default]])

(defmethod optimize-filter :<  [filter-clause] (optimize-comparison-filter lower-bound filter-clause))
(defmethod optimize-filter :<= [filter-clause] (optimize-comparison-filter lower-bound filter-clause))
(defmethod optimize-filter :>  [filter-clause] (optimize-comparison-filter upper-bound filter-clause))
(defmethod optimize-filter :>= [filter-clause] (optimize-comparison-filter upper-bound filter-clause))

(defmethod optimize-filter :between
  [[_ field [_ lower unit] [_ upper]]]
  (let [field' (change-datetime-field-unit-to-default field)]
    [:and
     [:>= field' [:absolute-datetime (lower-bound unit lower) :default]]
     [:< field'  [:absolute-datetime (upper-bound unit upper) :default]]]))

(defn- optimize-datetime-filters* [{query-type :type, :as query}]
  (if (not= query-type :query)
    query
    (mbql.u/replace query
      (_ :guard (partial mbql.u/is-clause? (set (keys (methods optimize-filter)))))
      (if (can-optimize-filter? &match)
        (optimize-filter &match)
        &match))))

(defn optimize-datetime-filters
  "Middlware that optimizes `=` and `not=` datetime filters that use bucketing. Rewrites those filters as `between`
  filters that do not use bucketing, so the data warehouses can better utilize indexes.

  This namespace expects to run *after* the `wrap-value-literals` middleware, meaning datetime literal strings like
  `\"2019-09-24\"` should already have been converted to `:absolute-datetime` clauses."
  [qp]
  (comp qp optimize-datetime-filters*))
