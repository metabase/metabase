(ns metabase.models.dashboard
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [dashboard-card :refer [DashboardCard]]
                             [org :refer [Org]]
                             [user :refer [User]])
            [metabase.util :as util]))

(defentity Dashboard
  (table :report_dashboard))

(defmethod pre-insert Dashboard [_ dashboard]
  (let [defaults {:created_at (util/new-sql-date)
                  :updated_at (util/new-sql-date)}]
    (merge defaults dashboard)))

(defmethod post-select Dashboard [_ {:keys [id creator_id organization_id] :as dash}]
  (assoc dash
         :creator (sel-fn :one User :id creator_id)
         :organization (sel-fn :one Org :id organization_id)
         :ordered_cards (sel-fn :many DashboardCard :dashboard_id id)))

; TODO - ordered_cards
