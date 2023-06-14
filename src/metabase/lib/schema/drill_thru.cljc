(ns metabase.lib.schema.drill-thru
  "Malli schemas for possible drill-thru operations.

  Drill-thrus are not part of MBQL; they are a set of actions one can take to transform a query.
  For example, adding a filter like `created_at < 2022-01-01`, or following a foreign key."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.util.malli.registry :as mr]))

(mr/def ::drill-thru-types
  [:enum :drill-thru/quick-filter])

(mr/def ::drill-thru
  [:multi {:dispatch :type}
   [:drill-thru/quick-filter
    [:map
     [:type      keyword?]
     [:lib/type  [:= :metabase.lib.drill-thru/drill-thru]]
     [:operators [:sequential [:map
                               [:name   string?]
                               [:filter ::mbql-clause/clause]]]]]]])
