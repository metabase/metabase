(ns metabase.models.dashboard-card-series
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def DashboardCardSeries
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
   We'll keep this till we replace all the DashboardCardSeries symbol in our codebase."
  :model/DashboardCardSeries)

(methodical/defmethod t2/table-name :model/DashboardCardSeries [_model] :dashboardcard_series)

(doto :model/DashboardCardSeries
  (derive :metabase/model))
