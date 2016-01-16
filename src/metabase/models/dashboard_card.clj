(ns metabase.models.dashboard-card
  (:require [clojure.set :as set]
            [metabase.db :refer [sel]]
            (metabase.models [card :refer [Card]]
                             [interface :as i])))

(i/defentity DashboardCard :report_dashboardcard)

(defn- pre-insert [dashcard]
  (let [defaults {:sizeX 2
                  :sizeY 2}]
    (merge defaults dashcard)))

(defn- post-select [{:keys [card_id dashboard_id] :as dashcard}]
  (-> dashcard
      (set/rename-keys {:sizex :sizeX ; mildly retarded: H2 columns are all uppercase, we're converting them
                        :sizey :sizeY}) ; to all downcase, and the Angular app expected mixed-case names here
      (assoc :card      (delay (Card card_id))
             :dashboard (delay (sel :one 'Dashboard :id dashboard_id)))))

(extend (class DashboardCard)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped? (constantly true)
          :pre-insert   pre-insert
          :post-select  post-select}))
