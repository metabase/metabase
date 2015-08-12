(ns metabase.models.dashboard-card
  (:require [clojure.set :as set]
            [korma.core :refer :all, :exclude [defentity update]]
            [metabase.db :refer :all]
            (metabase.models [card :refer [Card]]
                             [interface :refer :all])))

(defentity DashboardCard
  [(table :report_dashboardcard)
   timestamped]

  (pre-insert [_ dashcard]
    (let [defaults {:sizeX 2
                    :sizeY 2}]
      (merge defaults dashcard)))

  (post-select [_ {:keys [card_id dashboard_id] :as dashcard}]
    (-> dashcard
        (set/rename-keys {:sizex :sizeX ; mildly retarded: H2 columns are all uppercase, we're converting them
                          :sizey :sizeY}) ; to all downcase, and the Angular app expected mixed-case names here
        (assoc :card      (delay (Card card_id))
               :dashboard (delay (sel :one 'Dashboard :id dashboard_id))))))
