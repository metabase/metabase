(ns metabase.agent-api.db
  "Application database queries for the agent API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [malli.util :as mut]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn insert-dashboard!
  "Insert the Dashboard `row` and return the inserted instance."
  [row :- ::dashboards.schema/dashboard.update]
  (t2/insert-returning-instance! :model/Dashboard row))

(mu/defn insert-dashcard!
  "Insert the DashboardCard `row` and return the inserted instance."
  [row :- ::dashboards.schema/dashboard-card.update]
  (t2/insert-returning-instance! :model/DashboardCard row))

(mu/defn update-dashcard!
  "Apply `changes` to the DashboardCard with `dashcard-id`, returning the number updated."
  [dashcard-id :- ::lib.schema.id/dashcard
   changes     :- (mut/select-keys ::dashboards.schema/dashboard-card.update [:visualization_settings :row :col])]
  (t2/update! :model/DashboardCard dashcard-id changes))

(mu/defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`, returning the number updated."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- (mut/select-keys ::dashboards.schema/dashboard.update [:name :description :collection_id :archived :archived_directly])]
  (t2/update! :model/Dashboard dashboard-id changes))
