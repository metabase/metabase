(ns metabase.models.dashboard
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [dashboard-card :refer [DashboardCard]]
                             [org :refer [Org]]
                             [user :refer [User]])
            [metabase.util :as util]))

(defentity Dashboard
  (table :report_dashboard))

(defmethod pre-insert Dashboard [_ dashboard]
  (let [defaults {:created_at (util/new-sql-timestamp)
                  :updated_at (util/new-sql-timestamp)}]
    (merge defaults dashboard)))

(defmethod pre-update Dashboard [_ dashboard]
  (assoc dashboard
         :updated_at (util/new-sql-timestamp)))

(defmethod post-select Dashboard [_ {:keys [id creator_id organization_id description] :as dash}]
  (-> dash
      (assoc :creator       (delay (sel :one User :id creator_id))
             :description   (util/jdbc-clob->str description)
             :organization  (delay (sel :one Org :id organization_id))
             :ordered_cards (delay (sel :many DashboardCard :dashboard_id id)))
      assoc-permissions-sets))

; TODO - ordered_cards
