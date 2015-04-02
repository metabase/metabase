(ns metabase.models.dashboard
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [dashboard-card :refer [DashboardCard]]
                             [org :refer [Org]]
                             [user :refer [User]])
            [metabase.util :as util]))

(defentity Dashboard
  (table :report_dashboard)
  timestamped)

(defmethod post-select Dashboard [_ {:keys [id creator_id organization_id description] :as dash}]
  (-> dash
      (assoc :creator       (delay (sel :one User :id creator_id))
             :description   (util/jdbc-clob->str description)
             :organization  (delay (sel :one Org :id organization_id))
             :ordered_cards (delay (sel :many DashboardCard :dashboard_id id (order :created_at :asc))))
      assoc-permissions-sets))
