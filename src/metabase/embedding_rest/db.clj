(ns metabase.embedding-rest.db
  "Application database queries for the embedding REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card card-id))

(mu/defn card-embedding-params
  "The embedding parameters of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :embedding_params :model/Card :id card-id))

(mu/defn card-embedding-flags
  "The embedding-enabled and archived flags of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :enable_embedding :archived] :id card-id))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard dashboard-id))

(mu/defn dashboard-embedding-params
  "The embedding parameters of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :embedding_params :model/Dashboard, :id dashboard-id))

(mu/defn dashboard-embedding-flags
  "The embedding-enabled and archived flags of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one [:model/Dashboard :enable_embedding :archived] :id dashboard-id))

(mu/defn dashcard
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one :model/DashboardCard dashcard-id))
