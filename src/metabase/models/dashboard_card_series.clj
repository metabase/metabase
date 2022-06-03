(ns metabase.models.dashboard-card-series
  (:require [metabase.models.serialization.utils :as serdes.utils]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel DashboardCardSeries :dashboardcard_series)

(defn- dashboard-card [{:keys [dashboardcard_id]}]
  (db/select-one 'DashboardCard :id dashboardcard_id))

(u/strict-extend (class DashboardCardSeries)
  serdes.utils/IdentityHashable
  {:identity-hash-fields (constantly [(comp serdes.utils/identity-hash dashboard-card)
                                      (serdes.utils/hydrated-hash :card)])})
