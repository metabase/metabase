(ns metabase.models.dashboard-card-series
  (:require [metabase.models.serialization.hash :as serdes.hash]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel DashboardCardSeries :dashboardcard_series)

(defn- dashboard-card [{:keys [dashboardcard_id]}]
  (db/select-one 'DashboardCard :id dashboardcard_id))

(u/strict-extend (class DashboardCardSeries)
  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [(comp serdes.hash/identity-hash dashboard-card)
                                      (serdes.hash/hydrated-hash :card)])})
