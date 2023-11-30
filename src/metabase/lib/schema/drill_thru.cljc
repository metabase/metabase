(ns metabase.lib.schema.drill-thru
  "Malli schemas for possible drill-thru operations.

  Drill-thrus are not part of MBQL; they are a set of actions one can take to transform a query.
  For example, adding a filter like `created_at < 2022-01-01`, or following a foreign key."
  (:require
   [metabase.lib.schema :as-alias lib.schema]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.util.malli.registry :as mr]))

(mr/def ::pivot-types
  [:enum :category :location :time])

(mr/def ::drill-thru.type
  [:fn
   {:error/message "valid drill-thru :type keyword"}
   (fn [k]
     (and (qualified-keyword? k)
          (= (namespace k) "drill-thru")))])

(mr/def ::drill-thru.common
  [:map
   [:type     ::drill-thru.type]
   [:lib/type [:= :metabase.lib.drill-thru/drill-thru]]])

;;; A drill thru that contains a column
(mr/def ::drill-thru.common.with-column
  [:merge
   ::drill-thru.common
   [:map
    [:column [:ref ::lib.schema.metadata/column]]]])

(mr/def ::drill-thru.object-details
  [:merge
   ::drill-thru.common.with-column
   [:map
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
    [:type         [:= :drill-thru/quick-filter]]
    [:operators    [:sequential ::drill-thru.quick-filter.operator]]
    [:column       [:ref ::lib.schema.metadata/column]]
    [:value        [:maybe :any]]
    [:query        [:ref ::lib.schema/query]]
    [:stage-number number?]]])

(mr/def ::drill-thru.fk-filter
  [:merge
   ::drill-thru.common
   [:map
    [:type   [:= :drill-thru/fk-filter]]
    [:filter ::lib.schema.expression/boolean]
    [:table-name :string]
    [:column-name :string]]])

(mr/def ::drill-thru.distribution
  [:merge
   ::drill-thru.common.with-column
   [:map
    [:type [:= :drill-thru/distribution]]]])

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
   ::drill-thru.common.with-column
   [:map
    [:type         [:= :drill-thru/summarize-column]]
    [:aggregations [:sequential [:ref ::drill-thru.summarize-column.aggregation-type]]]]])

(mr/def ::drill-thru.summarize-column-by-time
  [:merge
   ::drill-thru.common.with-column
   [:map
    [:type     [:= :drill-thru/summarize-column-by-time]]
    [:breakout [:ref ::lib.schema.metadata/column]]
    [:unit     ::lib.schema.temporal-bucketing/unit]]])

(mr/def ::drill-thru.column-filter
  [:merge
   ::drill-thru.common.with-column
   [:map
    [:type         [:= :drill-thru/column-filter]]
    [:initial-op   [:maybe ::lib.schema.filter/operator]]
    [:column       [:ref ::lib.schema.metadata/column]]
    [:query        [:ref ::lib.schema/query]]
    [:stage-number number?]]])

(mr/def ::drill-thru.underlying-records
  [:merge
   ::drill-thru.common
   [:map
    [:type       [:= :drill-thru/underlying-records]]
    [:row-count  number?]
    [:table-name [:maybe string?]]]])

(mr/def ::drill-thru.automatic-insights
  [:merge
   ::drill-thru.common.with-column
   [:map
    [:type     [:= :drill-thru/automatic-insights]]
    [:lib/type [:= :metabase.lib.drill-thru/drill-thru]]]])

(mr/def ::drill-thru.zoom-in.timeseries.next-unit
  [:enum :quarter :month :week :day :hour :minute])

(mr/def ::drill-thru.zoom-in.timeseries
  [:merge
   ::drill-thru.common
   [:map
    [:type      [:= :drill-thru/zoom-in.timeseries]]
    [:dimension [:ref ::context.row.value]]
    [:next-unit [:ref ::drill-thru.zoom-in.timeseries.next-unit]]]])

(mr/def ::drill-thru.zoom-in.geographic.column.latitude
  [:merge
   [:ref ::lib.schema.metadata/column]
   [:map
    [:semantic-type [:fn
                     {:error/message "Latitude semantic type"}
                     #(isa? % :type/Latitude)]]]])

(mr/def ::drill-thru.zoom-in.geographic.column.longitude
  [:merge
   [:ref ::lib.schema.metadata/column]
   [:map
    [:semantic-type [:fn
                     {:error/message "Longitude semantic type"}
                     #(isa? % :type/Longitude)]]]])

(mr/def ::drill-thru.zoom-in.geographic.column.county-state-city
  [:merge
   [:ref ::lib.schema.metadata/column]
   [:map
    [:semantic-type [:fn
                     {:error/message "Country/State/City semantic type"}
                     #(some (fn [semantic-type]
                              (isa? % semantic-type))
                            [:type/Country :type/State :type/City])]]]])

(mr/def ::drill-thru.zoom-in.geographic.country-state-city->binned-lat-lon
  [:merge
   ::drill-thru.common
   [:map
    [:type      [:= :drill-thru/zoom-in.geographic]]
    [:subtype   [:= :drill-thru.zoom-in.geographic/country-state-city->binned-lat-lon]]
    [:column    ::drill-thru.zoom-in.geographic.column.county-state-city]
    [:value     some?]
    [:latitude  [:map
                 [:column    [:ref ::drill-thru.zoom-in.geographic.column.latitude]]
                 [:bin-width [:ref ::lib.schema.binning/bin-width]]]]
    [:longitude [:map
                 [:column    [:ref ::drill-thru.zoom-in.geographic.column.longitude]]
                 [:bin-width [:ref ::lib.schema.binning/bin-width]]]]]])

(mr/def ::drill-thru.zoom-in.geographic.binned-lat-lon->binned-lat-lon
  [:merge
   ::drill-thru.common
   [:map
    [:type      [:= :drill-thru/zoom-in.geographic]]
    [:subtype   [:= :drill-thru.zoom-in.geographic/binned-lat-lon->binned-lat-lon]]
    [:latitude  [:map
                 [:column    [:ref ::drill-thru.zoom-in.geographic.column.latitude]]
                 [:bin-width [:ref ::lib.schema.binning/bin-width]]
                 [:min       number?]
                 [:max       number?]]]
    [:longitude [:map
                 [:column    [:ref ::drill-thru.zoom-in.geographic.column.longitude]]
                 [:bin-width [:ref ::lib.schema.binning/bin-width]]
                 [:min       number?]
                 [:max       number?]]]]])

(mr/def ::drill-thru.zoom-in.geographic
  [:and
   [:merge
    ::drill-thru.common
    [:map
     [:type    [:= :drill-thru/zoom-in.geographic]]
     [:subtype keyword?]]]
   [:multi {:dispatch :subtype
            :error/fn (fn [{:keys [value]} _]
                        (str "Invalid zoom-in.geographic drill thru subtype" (pr-str value)))}
    [:drill-thru.zoom-in.geographic/country-state-city->binned-lat-lon
     ::drill-thru.zoom-in.geographic.country-state-city->binned-lat-lon]
    [:drill-thru.zoom-in.geographic/binned-lat-lon->binned-lat-lon
     ::drill-thru.zoom-in.geographic.binned-lat-lon->binned-lat-lon]]])

(mr/def ::drill-thru.zoom-in.binning
  [:merge
   ::drill-thru.common.with-column
   [:map
    [:type        [:= :drill-thru/zoom-in.binning]]
    [:min-value   number?]
    [:max-value   number?]
    [:new-binning ::lib.schema.binning/binning]]])

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
    [:drill-thru/zoom-in.timeseries       ::drill-thru.zoom-in.timeseries]
    [:drill-thru/zoom-in.geographic       ::drill-thru.zoom-in.geographic]
    [:drill-thru/zoom-in.binning          ::drill-thru.zoom-in.binning]]])

(mr/def ::context.row.value
  [:map
   [:column     [:ref ::lib.schema.metadata/column]]
   [:column-ref [:ref ::lib.schema.ref/ref]]
   [:value      :any]])

;;; Sequence of maps with keys `:column`, `:column-ref`, and `:value`
;;;
;;; These are presumably in the same order as the returned columns for the query stage
(mr/def ::context.row
  [:sequential [:ref ::context.row.value]])

(mr/def ::context
  [:map
   [:column     [:ref ::lib.schema.metadata/column]]
   [:column-ref [:ref ::lib.schema.ref/ref]]
   [:value      [:maybe :any]]
   [:row        {:optional true} [:ref ::context.row]]
   [:dimensions {:optional true} [:maybe [:ref ::context.row]]]])
