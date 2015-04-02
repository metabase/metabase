(ns metabase.models.dashboard-card
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [card :refer [Card]])))

(defentity DashboardCard
  (table :report_dashboardcard)
  timestamped)

;; #### fields:
;; *  `id`
;; *  `created_at`
;; *  `updated_at`
;; *  `sizeX`
;; *  `sizeY`
;; *  `row`
;; *  `col`
;; *  `card_id`
;; *  `dashboard_id`


(defmethod post-select DashboardCard [_ {:keys [card_id dashboard_id] :as dashcard}]
  (-> dashcard
      (clojure.set/rename-keys {:sizex :sizeX   ; mildly retarded: H2 columns are all uppercase, we're converting them
                                :sizey :sizeY}) ; to all downcase, and the Angular app expected mixed-case names here
      (assoc :card      (delay (sel :one Card :id card_id))
             :dashboard (delay (sel :one 'metabase.models.dashboard/Dashboard :id dashboard_id)))))

(defmethod pre-insert DashboardCard [_ dashcard]
  (let [defaults {:sizeX 2
                  :sizeY 2}]
    (merge defaults dashcard)))
