(ns metabase.lib.schema.drill-thru
  "Malli schemas for possible drill-thru operations.

  Drill-thrus are not part of MBQL; they are a set of actions one can take to transform a query.
  For example, adding a filter like `created_at < 2022-01-01`, or following a foreign key."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.util.malli.registry :as mr]))

(mr/def ::drill-thru-types
  [:enum :drill-thru/quick-filter])

(mr/def ::drill-thru-keyed
  [:map
   [:type      keyword?]
   [:lib/type  [:= :metabase.lib.drill-thru/drill-thru]]
   [:object-id :any]
   [:many-pks? :boolean]])

(mr/def ::drill-thru
  [:multi {:dispatch :type}
   [:drill-thru/quick-filter
    [:map
     [:type      keyword?]
     [:lib/type  [:= :metabase.lib.drill-thru/drill-thru]]
     [:operators [:sequential [:map
                               [:name   string?]
                               [:filter ::lib.schema.expression/boolean]]]]]]
   [:drill-thru/pk         ::drill-thru-keyed]
   [:drill-thru/fk-details ::drill-thru-keyed]
   [:drill-thru/zoom       ::drill-thru-keyed]
   [:drill-thru/fk-filter
    [:map
     [:type      keyword?]
     [:lib/type  [:= :metabase.lib.drill-thru/drill-thru]]
     [:filter    ::lib.schema.expression/boolean]]]
   [:drill-thru/distribution
    [:map
     [:type      keyword?]
     [:lib/type  [:= :metabase.lib.drill-thru/drill-thru]]
     [:column    lib.metadata/ColumnMetadata]]]])
