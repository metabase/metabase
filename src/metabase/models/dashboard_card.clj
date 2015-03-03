(ns metabase.models.dashboard-card
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [card :refer [Card]])
            [metabase.util :as util]))

(defentity DashboardCard
  (table :report_dashboardcard))

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
      (assoc :card (sel-fn :one Card :id card_id)
             :dashboard (sel-fn :one "metabase.models.dashboard/Dashboard" :id dashboard_id))))

(defmethod pre-insert DashboardCard [_ dashcard]
  (let [defaults {:created_at (util/new-sql-timestamp)
                  :updated_at (util/new-sql-timestamp)
                  :sizeX 2
                  :sizeY 2}]
    (merge defaults dashcard)))

(defmethod pre-update DashboardCard [_ dashcard]
  (assoc dashcard
         :updated_at (util/new-sql-timestamp))) ; is this useful in any way whatsoever???
