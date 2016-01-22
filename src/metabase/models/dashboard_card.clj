(ns metabase.models.dashboard-card
  (:require [clojure.set :as set]
            [korma.core :as k]
            [metabase.db :refer [sel]]
            (metabase.models [card :refer [Card]]
                             [interface :as i])
            [metabase.util :as u]))

(i/defentity DashboardCard :report_dashboardcard
             ;; This is implemented as a `transform` function instead of `post-select` because we want it to apply even
             ;; when we use low-level korma primitives like `select`. Otherwise you can't `insert` what you `select`.
             ;; TODO - The fact that we have to work around these names means we should probably just rename them
             (k/transform (u/rpartial set/rename-keys {:sizex :sizeX, :sizey :sizeY})))

(defn- pre-insert [dashcard]
  (let [defaults {:sizeX 2
                  :sizeY 2}]
    (merge defaults dashcard)))

(extend (class DashboardCard)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped? (constantly true)
          :pre-insert   pre-insert}))


(u/require-dox-in-this-namespace)
