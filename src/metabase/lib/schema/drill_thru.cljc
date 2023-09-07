(ns metabase.lib.schema.drill-thru
  "Malli schemas for possible drill-thru operations.

  Drill-thrus are not part of MBQL; they are a set of actions one can take to transform a query.
  For example, adding a filter like `created_at < 2022-01-01`, or following a foreign key."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.util.malli.registry :as mr]))

(mr/def ::pivot-types
  [:enum :category :location :time])

(mr/def ::drill-thru.common
  [:map
   [:type     keyword?]
   [:lib/type [:= :metabase.lib.drill-thru/drill-thru]]])

(mr/def ::drill-thru.keyed
  [:merge
   ::drill-thru.common
   [:map
    [:object-id :any]
    [:many-pks? :boolean]]])

(mr/def ::drill-thru.pk
  [:merge
   ::drill-thru.keyed
   [:map
    [:type [:= :drill-thru/pk]]]])

(mr/def ::drill-thru.fk-details
  [:merge
   ::drill-thru.keyed
   [:map
    [:type [:= :drill-thru/fk-details]]]])

(mr/def ::drill-thru.zoom
  [:merge
   ::drill-thru.keyed
   [:map
    [:type [:= :drill-thru/zoom]]]])

(mr/def ::drill-thru.quick-filter
  [:merge
   ::drill-thru.common
   [:map
    [:type      [:= :drill-thru/quick-filter]]
    [:operators [:sequential [:map
                              [:name   string?]
                              [:filter ::lib.schema.expression/boolean]]]]]])

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
    [:column lib.metadata/ColumnMetadata]]])

(mr/def ::drill-thru.pivot
  [:merge
   ::drill-thru.common
   [:map
    [:type   [:= :drill-thru/pivot]]
    [:pivots [:map-of ::pivot-types [:sequential lib.metadata/ColumnMetadata]]]]])

(mr/def ::drill-thru.sort
  [:merge
   ::drill-thru.common
   [:map
    [:type            [:= :drill-thru/sort]]
    [:sort-directions [:sequential ::lib.schema.order-by/direction]]]])

(mr/def ::drill-thru.summarize-column
  [:merge
   ::drill-thru.common
   [:map
    [:type         [:= :drill-thru/summarize-column]]
    [:column       lib.metadata/ColumnMetadata]
    [:aggregations [:sequential [:enum :avg :distinct :sum]]]]])

(mr/def ::drill-thru.summarize-column-by-time
  [:merge
   ::drill-thru.common
   [:map
    [:type     [:= :drill-thru/summarize-column-by-time]]
    [:column   lib.metadata/ColumnMetadata]
    [:breakout lib.metadata/ColumnMetadata]]])

(mr/def ::drill-thru.column-filter
  [:merge
   ::drill-thru.common
   [:map
    [:type       [:= :drill-thru/column-filter]]
    [:column     lib.metadata/ColumnMetadata]
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
    [:column   lib.metadata/ColumnMetadata]]])

(mr/def ::drill-thru.zoom-in.timeseries.next-unit
  [:enum :quarter :month :week :day :hour :minute])

(mr/def ::drill-thru.zoom-in.timeseries
  [:merge
   ::drill-thru.common
   [:map
    [:type      [:= :drill-thru/zoom-in.timeseries]]
    [:column    lib.metadata/ColumnMetadata]
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

(mr/def ::context
  [:map
   [:column lib.metadata/ColumnMetadata]
   [:value  [:maybe :any]]
   [:row    {:optional true} [:sequential [:map
                                           [:column-name string?]
                                           [:value       :any]]]]])
