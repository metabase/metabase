(ns metabase.models.dashboard
  (:require [korma.core :refer :all, :exclude [defentity update]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [dashboard-card :refer [DashboardCard]]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))

(defrecord DashboardInstance []
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite DashboardInstance :read :public-perms, :write :public-perms)


(defentity Dashboard
  [(table :report_dashboard)
   timestamped]

  (post-select [_ {:keys [id creator_id description] :as dash}]
    (-> dash
        (assoc :creator       (delay (User creator_id))
               :description   (u/jdbc-clob->str description)
               :ordered_cards (delay (sel :many DashboardCard :dashboard_id id (order :created_at :asc))))
        map->DashboardInstance))

  (pre-cascade-delete [_ {:keys [id]}]
    (cascade-delete DashboardCard :dashboard_id id)))

(extend-ICanReadWrite DashboardEntity :read :public-perms, :write :public-perms)
