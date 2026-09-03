(ns metabase.tiles.db
  "Application database queries for the tiles module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card card-id))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard dashboard-id))

(defn dashcard
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id]
  (t2/select-one :model/DashboardCard dashcard-id))
