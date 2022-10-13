(ns metabase.models.dashboard-card-series
  (:require
   [metabase.models.serialization.hash :as serdes.hash]
   [toucan.db :as db]
   [toucan.models :as models]))

(models/defmodel DashboardCardSeries :dashboardcard_series)

(defn- dashboard-card [{:keys [dashboardcard_id]}]
  (db/select-one 'DashboardCard :id dashboardcard_id))

(defmethod serdes.hash/identity-hash-fields DashboardCardSeries
  [_dashboard-card-series]
  [(comp serdes.hash/identity-hash dashboard-card)
   (serdes.hash/hydrated-hash :card)])
