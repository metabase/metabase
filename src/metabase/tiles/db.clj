(ns metabase.tiles.db
  "Application database queries for the tiles module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card card-id))

(mu/defn dashboard :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one :model/Dashboard dashboard-id))

(mu/defn dashcard :- [:maybe (ms/InstanceOf :model/DashboardCard)]
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ms/PositiveInt]
  (t2/select-one :model/DashboardCard dashcard-id))
