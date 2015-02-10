(ns metabase.models.dashboard-card
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [card :refer [Card]])))

(defentity DashboardCard
  (table :report_dashboardcard))

(defmethod post-select DashboardCard [_ {:keys [card_id dashboard_id] :as dash-card}]
  (assoc dash-card
         :card (sel-fn :one Card :id card_id)
         :dashboard (sel-fn :one "metabase.models.dashboard/Dashboard" :id dashboard_id)
         ; TODO - cardData
         ))
