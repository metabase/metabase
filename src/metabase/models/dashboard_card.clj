(ns metabase.models.dashboard-card
  (:require [clojure.set :as set]
            [metabase.db :refer [sel]]
            (metabase.models [card :refer [Card]]
                             [interface :as i])
            [metabase.util :as u]))

(i/defentity DashboardCard :report_dashboardcard)

(defn- pre-insert [dashcard]
  (let [defaults {:sizeX 2
                  :sizeY 2}]
    (merge defaults dashcard)))

(extend (class DashboardCard)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped? (constantly true)
          :pre-insert   pre-insert
          :post-select  (u/rpartial set/rename-keys {:sizex :sizeX, :sizey :sizeY})})) ; TODO - frontend expects mixed-case names here, should change that


(u/require-dox-in-this-namespace)
