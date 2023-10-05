(ns metabase.lib.schema.drill-thru
  "Malli schemas for possible drill-thru operations.

  Drill-thrus are not part of MBQL; they are a set of actions one can take to transform a query.
  For example, adding a filter like `created_at < 2022-01-01`, or following a foreign key."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.util.malli.registry :as mr]))

(mr/def ::pivot-types
  [:enum :category :location :time])

(mr/def ::drill-thru.common
  [:map
   [:type     keyword?]
   [:lib/type [:= :metabase.lib.drill-thru/drill-thru]]])

(mr/def ::drill-thru.object-details
  [:merge
   ::drill-thru.common
   [:map
    [:column    [:ref ::lib.schema.metadata/column]]
    [:object-id :any]
    [:many-pks? :boolean]]])

(mr/def ::drill-thru.pk
  [:merge
   ::drill-thru.object-details
   [:map
    [:type [:= :drill-thru/pk]]]])

(mr/def ::drill-thru.fk-details.fk-column
  [:merge
   [:ref ::lib.schema.metadata/column]
   [:map
    [:fk-target-field-id ::lib.schema.id/field]]])

(mr/def ::drill-thru.fk-details
  [:merge
   ::drill-thru.object-details
   [:map
    [:type   [:= :drill-thru/fk-details]]
    [:column [:ref ::drill-thru.fk-details.fk-column]]]])

(mr/def ::drill-thru.zoom
  [:merge
   ::drill-thru.object-details
   [:map
    [:type [:= :drill-thru/zoom]]]])

(mr/def ::drill-thru.quick-filter.operator
  [:map
   [:name   ::lib.schema.common/non-blank-string]
   [:filter [:ref ::lib.schema.expression/boolean]]])

(mr/def ::drill-thru.quick-filter
  [:merge
   ::drill-thru.common
   [:map
    [:type      [:= :drill-thru/quick-filter]]
    [:operators [:sequential ::drill-thru.quick-filter.operator]]]])

(mr/def ::drill-thru.fk-filter
  [:merge
   ::drill-thru.common
   [:map
    [:type   [:= :drill-thru/fk-filter]]
    [:filter ::lib.schema.expression/boolean]]])

(mr/def ::drill-thru.distribution
  [:merge
   ::drill-thru.common
   [:map
    [:type   [:= :drill-thru/distribution]]
    [:column [:ref ::lib.schema.metadata/column]]]])

(mr/def ::drill-thru.pivot
  [:merge
   ::drill-thru.common
   [:map
    [:type   [:= :drill-thru/pivot]]
    [:pivots [:map-of ::pivot-types [:sequential [:ref ::lib.schema.metadata/column]]]]]])

(mr/def ::drill-thru.sort
  [:merge
   ::drill-thru.common
   [:map
    [:type            [:= :drill-thru/sort]]
    [:sort-directions [:sequential ::lib.schema.order-by/direction]]]])

(mr/def ::drill-thru.summarize-column.aggregation-type
  [:enum :avg :distinct :sum])

(mr/def ::drill-thru.summarize-column
  [:merge
   ::drill-thru.common
   [:map
    [:type         [:= :drill-thru/summarize-column]]
    [:column       [:ref ::lib.schema.metadata/column]]
    [:aggregations [:sequential [:ref ::drill-thru.summarize-column.aggregation-type]]]]])

(mr/def ::drill-thru.summarize-column-by-time
  [:merge
   ::drill-thru.common
   [:map
    [:type     [:= :drill-thru/summarize-column-by-time]]
    [:column   [:ref ::lib.schema.metadata/column]]
    [:breakout [:ref ::lib.schema.metadata/column]]
    [:unit     ::lib.schema.temporal-bucketing/unit]]])

(mr/def ::drill-thru.column-filter
  [:merge
   ::drill-thru.common
   [:map
    [:type       [:= :drill-thru/column-filter]]
    [:column     [:ref ::lib.schema.metadata/column]]
    [:initial-op [:maybe ::lib.schema.filter/operator]]]])

(mr/def ::drill-thru.underlying-records
  [:merge
   ::drill-thru.common
   [:map
    [:type       [:= :drill-thru/underlying-records]]
    [:row-count  number?]
    [:table-name [:maybe string?]]]])

(mr/def ::drill-thru.automatic-insights
  [:merge
   ::drill-thru.common
   [:map
    [:type     [:= :drill-thru/automatic-insights]]
    [:lib/type [:= :metabase.lib.drill-thru/drill-thru]]
    [:column   [:ref ::lib.schema.metadata/column]]]])

(mr/def ::drill-thru.zoom-in.timeseries.next-unit
  [:enum :quarter :month :week :day :hour :minute])

(mr/def ::drill-thru.zoom-in.timeseries
  [:merge
   ::drill-thru.common
   [:map
    [:type      [:= :drill-thru/zoom-in.timeseries]]
    [:column    [:ref ::lib.schema.metadata/column]]
    [:value     some?]
    [:next-unit [:ref ::drill-thru.zoom-in.timeseries.next-unit]]]])

(mr/def ::drill-thru
  [:and
   ::drill-thru.common
   [:multi {:dispatch :type
            :error/fn (fn [{:keys [value]} _]
                        (str "Invalid drill thru (unknown :type): " (pr-str value)))}
    [:drill-thru/pk                       ::drill-thru.pk]
    [:drill-thru/fk-details               ::drill-thru.fk-details]
    [:drill-thru/zoom                     ::drill-thru.zoom]
    [:drill-thru/quick-filter             ::drill-thru.quick-filter]
    [:drill-thru/fk-filter                ::drill-thru.fk-filter]
    [:drill-thru/distribution             ::drill-thru.distribution]
    [:drill-thru/pivot                    ::drill-thru.pivot]
    [:drill-thru/sort                     ::drill-thru.sort]
    [:drill-thru/summarize-column         ::drill-thru.summarize-column]
    [:drill-thru/summarize-column-by-time ::drill-thru.summarize-column-by-time]
    [:drill-thru/column-filter            ::drill-thru.column-filter]
    [:drill-thru/underlying-records       ::drill-thru.underlying-records]
    [:drill-thru/automatic-insights       ::drill-thru.automatic-insights]
    [:drill-thru/zoom-in.timeseries       ::drill-thru.zoom-in.timeseries]]])

;;; Frontend passes in something that looks like this. Why this shape? Who knows.
(comment
  {:column     {:lib/type            :metadata/column
                :remapped-from-index nil
                :base-type           :type/BigInteger
                :semantic-type       :type/Quantity
                :name                "count"
                :lib/source          :source/aggregations
                :aggregation-index   0
                :effective-type      :type/BigInteger
                :display-name        "Count"
                :remapping           nil}
   :value      457
   :row        [{:column-name "CREATED_AT", :value "2024-01-01T00:00:00Z"}
                {:column-name "count", :value 457}]
   :dimensions [{:column-name "CREATED_AT", :value "2024-01-01T00:00:00Z"}]})

(mr/def ::context.row.value
  [:map
   [:column-name string?]
   [:value       :any]])

(mr/def ::context.row
  [:sequential [:ref ::context.row.value]])

(mr/def ::context
  [:map
   [:column [:ref ::lib.schema.metadata/column]]
   [:value  [:maybe :any]]
   [:row        {:optional true} [:ref ::context.row]]
   [:dimensions {:optional true} [:maybe [:ref ::context.row]]]])
