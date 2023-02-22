(ns metabase.lib.schema
  (:require
   [metabase.types]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(comment metabase.types/keep-me)

(mr/def :lib/options
  [:map
   [:lib/uuid ms/NonBlankString]])

(mr/def :mbql/date-bucketing-unit
  [:enum :default :day :day-of-week :day-of-month :day-of-year :week :week-of-year
   :month :month-of-year :quarter :quarter-of-year :year])

(mr/def :mbql/time-bucketing-unit
  [:enum :default :millisecond :second :minute :minute-of-hour :hour :hour-of-day])

(mr/def :mbql/datetime-bucketing-unit
  [:or
   :mbql/date-bucketing-unit
   :mbql/time-bucketing-unit])

(mr/def :mbql/field-options
  [:map
   [:temporal-unit {:optional true} :mbql/datetime-bucketing-unit]])

(mr/def :mbql/field-ref
  [:and
   [:catn
    [:clause [:= :field]]
    [:id-or-name [:altn
                  [:id ms/IntGreaterThanZero]
                  [:name ms/NonBlankString]]]
    [:options [:maybe :mbql/field-options]]]
   [:fn (fn [[_field id-or-name options]]
          (or (integer? id-or-name)
              (and (string? id-or-name)
                   (isa? (:base-type options) :type/*))))]])

(mr/def :mbql/aggregation-ref
  [:catn
   [:clause [:= :aggregation]]
   [:index ms/IntGreaterThanZero]])

(mr/def :mbql/expression-ref
  [:catn
   [:clause [:= :expression]]
   [:name ms/NonBlankString]])

;; this is a placeholder that will be resolved later once we have metadata and `append` it to the query. Used to
;; implement [[metabase.lib.field/field]] so you don't have to pass metadata to it directly.
(mr/def :lib/field-placeholder
  [:catn
   [:clause [:= :lib/field-placeholder]]
   [:info [:fn map?]]])

(mr/def :mbql/ref
  [:or
   :lib/field-placeholder
   :mbql/field-ref
   :mbql/aggregation-ref
   :mbql/expression-ref])

(mr/def :mbql/order-by-direction
  [:enum :asc :desc])

(mr/def :mbql/asc
  [:catn
   [:direction [:= :asc]]
   [:options :lib/options]
   [:ref :mbql/ref]])

(mr/def :mbql/desc
  [:catn
   [:direction [:= :desc]]
   [:options :lib/options]
   [:ref :mbql/ref]])

(mr/def :mbql/order-by
  [:or :mbql/asc :mbql/desc])

(mr/def :mbql/inner-query
  [:map
   [:order-by {:optional true} [:sequential :mbql/order-by]]])

(mr/def :mbql/query-type
  [:enum :native :query])

(mr/def :mbql/outer-query
  [:and
   [:map
    [:database ms/IntGreaterThanOrEqualToZero]
    [:type :mbql/query-type]]
   [:multi
    {:dispatch :type}
    [:query [:map
             [:query :mbql/inner-query]]]
    [:native [:map
              [:native [:map]]]]]])
