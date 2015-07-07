(ns metabase.models.dashboard
  (:require [korma.core :refer :all, :exclude [defentity]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [dashboard-card :refer [DashboardCard]]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))

(defentity Dashboard
  [(table :report_dashboard)
   timestamped]

  (post-select [_ {:keys [id creator_id description] :as dash}]
    (-> dash
        (assoc :creator       (delay (sel :one User :id creator_id))
               :description   (u/jdbc-clob->str description)
               :ordered_cards (delay (sel :many DashboardCard :dashboard_id id (order :created_at :asc))))
        assoc-permissions-sets))

  (pre-cascade-delete [_ {:keys [id]}]
    (cascade-delete DashboardCard :dashboard_id id)))
