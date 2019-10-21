(ns metabase.query-processor.middleware.optimize-datetime-filters
  "Middlware that optimizes equality (`=` and `!=`) and comparison (`<`, `between`, etc.) filter clauses against
  bucketed datetime fields. See docstring for `optimize-datetime-filters` for more details."
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

(defn- lower-bound [unit inst report-timezone]
  (du/date-trunc unit inst (or report-timezone "UTC")))

(defn- upper-bound [unit inst report-timezone]
  (du/relative-date unit 1 (lower-bound unit inst report-timezone)))

(defn- change-datetime-field-unit-to-default [field]
  (mbql.u/replace field
    [:datetime-field wrapped _]
    [:datetime-field wrapped :default]))

(defmulti ^:private optimize-filter
  {:arglists '([clause report-timezone])}
  (fn [clause _]
    (mbql.u/dispatch-by-clause-name-or-class clause)))

(defmethod optimize-filter :=
  [[_ field [_ inst unit]] report-timezone]
  (let [[_ _ datetime-field-unit] (mbql.u/match-one field :datetime-field)]
    (when (= unit datetime-field-unit)
      (let [field' (change-datetime-field-unit-to-default field)]
        [:and
         [:>= field' [:absolute-datetime (lower-bound unit inst report-timezone) :default]]
         [:< field'  [:absolute-datetime (upper-bound unit inst report-timezone) :default]]]))))

(defmethod optimize-filter :!=
  [filter-clause report-timezone]
  (mbql.u/negate-filter-clause ((get-method optimize-filter :=) filter-clause report-timezone)))

(defn- optimize-comparison-filter
  [trunc-fn [filter-type field [_ inst unit]] report-timezone]
  [filter-type
   (change-datetime-field-unit-to-default field)
   [:absolute-datetime (trunc-fn unit inst report-timezone) :default]])

(defmethod optimize-filter :<
  [filter-clause report-timezone]
  (optimize-comparison-filter lower-bound filter-clause report-timezone))

(defmethod optimize-filter :<=
  [filter-clause report-timezone]
  (optimize-comparison-filter lower-bound filter-clause report-timezone))

(defmethod optimize-filter :>
  [filter-clause report-timezone]
  (optimize-comparison-filter upper-bound filter-clause report-timezone))

(defmethod optimize-filter :>=
  [filter-clause report-timezone]
  (optimize-comparison-filter upper-bound filter-clause report-timezone))

(defmethod optimize-filter :between
  [[_ field [_ lower unit] [_ upper]] report-timezone]
  (let [field' (change-datetime-field-unit-to-default field)]
    [:and
     [:>= field' [:absolute-datetime (lower-bound unit lower report-timezone) :default]]
     [:<  field' [:absolute-datetime (upper-bound unit upper report-timezone) :default]]]))

(defn- optimize-datetime-filters* [{query-type :type, {:keys [report-timezone]} :settings, :as query}]
  (if (not= query-type :query)
    query
    (mbql.u/replace query
      (_ :guard (partial mbql.u/is-clause? (set (keys (methods optimize-filter)))))
      (if (can-optimize-filter? &match)
        (optimize-filter &match report-timezone)
        &match))))

(defn optimize-datetime-filters
  "Middlware that optimizes equality (`=` and `!=`) and comparison (`<`, `between`, etc.) filter clauses against
  bucketed datetime fields. Rewrites those filter clauses as logically equivalent filter clauses that do not use
  bucketing (i.e., their datetime unit is `:default`, meaning no bucketing functions need be applied).

    [:= [:datetime-field [:field-id 1] :month] [:absolute-datetime #inst \"2019-09-01\" :month]]
    ->
    [:and
     [:>= [:datetime-field [:field-id 1] :default] [:absolute-datetime #inst \"2019-09-01\" :month]]
     [:<  [:datetime-field [:field-id 1] :default] [:absolute-datetime #inst \"2019-10-01\" :month]]]

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
  (comp qp optimize-datetime-filters*))
