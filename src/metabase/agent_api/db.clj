(ns metabase.agent-api.db
  "Application database queries for the agent API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.agent-api.schema :as agent-api.schema]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn collection-breadcrumb-columns
  "The id, name, location, owner, namespace, and archival of the Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one [:model/Collection :id :name :location :personal_owner_id :namespace :archived_directly]
                 :id [:auto/param collection-id]))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn cards-with-ids
  "The Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (if (seq card-ids)
    (t2/select :model/Card :id [:in card-ids])
    []))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-tab-names
  "The id and name of the DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select [:model/DashboardTab :id :name] :dashboard_id dashboard-id {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn dashboard-tab-ids
  "The ids of the DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-pks-vec :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn dashcard-ids-in-layout-order
  "The ids of the DashboardCards of the Dashboard with `dashboard-id`, in row then column order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-fn-vec :id :model/DashboardCard :dashboard_id dashboard-id {:order-by [[:row :asc] [:col :asc]]}))

(mu/defn dashcards
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn dashcard-in-dashboard
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [dashcard-id  :- ::lib.schema.id/dashcard
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

(mu/defn active-user-by-email
  "The active User with `email`, compared case-insensitively, or nil."
  [email :- :string]
  (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true))

(mu/defn insert-call-logs!
  "Insert the AgentApiCallLog `rows` with one statement for each set of columns they have, and return the new instances
  in the order of `rows`."
  [rows :- [:sequential ::agent-api.schema/agent-api-call-log.create]]
  (app-db/insert-returning-instances! :model/AgentApiCallLog rows))

(mu/defn delete-call-logs-created-before!
  "Delete the AgentApiCallLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/AgentApiCallLog {:where [:< :created_at [:auto/param cutoff]]}))
