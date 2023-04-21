(ns metabase.models.dashboard-card-series
  (:require
   [metabase.models.serialization :as serdes]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(models/defmodel DashboardCardSeries :dashboardcard_series)

(defn- dashboard-card [{:keys [dashboardcard_id]}]
  (t2/select-one 'DashboardCard :id dashboardcard_id))

(defmethod serdes/hash-fields DashboardCardSeries
  [_dashboard-card-series]
  [(comp serdes/identity-hash dashboard-card)
   (serdes/hydrated-hash :card)
   :position])
