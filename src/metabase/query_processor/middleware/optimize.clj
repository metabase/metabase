(ns metabase.query-processor.middleware.optimize
  (:require [clj-time.core :as t]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.query-processor.middleware.parameters.dates :as date-params]
            [metabase.util :as u]
            [metabase.util.date :as du])
  (:import java.sql.Timestamp org.joda.time.DateTime))

(defn- ^DateTime date-maybe-parse [date]
  (if (instance? DateTime date)
    date
    (if (instance? Timestamp date)
      (DateTime. ^long (.getTime ^Timestamp date))
      (date-params/parse-absolute-date date))))

(defn- add-period [date period]
  (du/coerce-to-timestamp (t/plus (date-maybe-parse date) period)))

(defn- unit-to-period [unit]
  (case unit
    :hour (t/hours 1)
    :minute (t/minutes 1)
    :day (t/days 1)
    :week (t/weeks 1)
    :month (t/months 1)
    :year (t/years 1)
    :quarter (t/months 3)))

(defn- optimize-date-predicates [query]
  (mbql.u/replace query

    ;; We don't optimize for the unit=:year because `[:absolute-datetime ... :year]` results in `YEAR(...)` in SQL terms
    ;; and we would have to create a new `:absolute-datetime-padded` clause for that only. Given that
    ;; `:absolute-datetime ... :year` is probably never used in the UI it doesn't make sense to go to such lengths.
    ;; For `:relative-datetime` however we do generate `:year`-constrained clauses. On the other hand instead of
    ;; creating a new clause for this we could just fix existing implementations of `relative-datetime` to always return
    ;; at least the date portion but we would then have to fix bucketing so that it's able to parse out years out of
    ;; date values

    [:between [:datetime-field field (unit :guard #{:day :week :month :quarter :hour :minute})] [:absolute-datetime from _] [:absolute-datetime to _]]
    [:and
     [:>= [:datetime-field field :default] [:absolute-datetime from unit]]
     [:< [:datetime-field field :default] [:absolute-datetime (add-period to (unit-to-period unit)) unit]]]

    [:> [:datetime-field field (unit :guard #{:day :week :month :quarter :hour :minute})] [:absolute-datetime date _]]
    [:>= [:datetime-field field :default] [:absolute-datetime (add-period date (unit-to-period unit)) unit]]

    [:< [:datetime-field field (unit :guard #{:day :week :month :quarter :hour :minute})] [:absolute-datetime date _]]
    [:< [:datetime-field field :default] [:absolute-datetime date unit]]

    [:between [:datetime-field field unit] [:relative-datetime from _] [:relative-datetime to _]]
    [:and
     [:>= [:datetime-field field :default] [:relative-datetime from unit {:padded? true}]]
     [:< [:datetime-field field :default] [:relative-datetime (+ to 1) unit {:padded? true}]]]

    [:= [:datetime-field field unit] [:relative-datetime date _]]
    [:and
     [:>= [:datetime-field field :default] [:relative-datetime date unit {:padded? true}]]
     [:< [:datetime-field field :default] [:relative-datetime (+ date 1) unit {:padded? true}]]]))

(schema.core/defn ^:private optimize* :- mbql.s/Query
  [query]
  (u/update-when query :query (comp optimize-date-predicates)))

(defn optimize-mbql
  "Optimize some clauses, for example date handling where it would otherwise result in SQL functions applied directly
  to the date field and prevent index from being used:
  `[:= [:datetime-field [:field-id 123] :day] [:absolute-datetime '2019-01-01' :day]]` would otherwise result in
    `DATE(field) = DATE('2019-01-01')`
  after we rewrite the query to
  `[:and [:>= [:datetime-field [:field-id 123] :day] [:absolute-datetime '2019-01-01' :day]] [:< [:datetime-field [:field-id 123] :day] [:absolute-datetime '2019-01-02' :day]]]`
    would result in
    `field >= DATE('2019-01-01') && field < DATE('2019-01-02')`"
  [qp]
  (comp qp optimize*))
