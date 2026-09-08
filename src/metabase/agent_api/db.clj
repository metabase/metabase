(ns metabase.agent-api.db
  "Application database queries for the agent API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [malli.util :as mut]
   [metabase.collections.schema :as collections.schema]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn collection-breadcrumb-columns :- [:maybe (mut/select-keys ::collections.schema/collection [:id :name :location :personal_owner_id :namespace :archived_directly])]
  "The id, name, location, owner, namespace, and archival of the Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one [:model/Collection :id :name :location :personal_owner_id :namespace :archived_directly]
                 collection-id))

(mu/defn card :- [:maybe ::queries.schema/card]
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn dashboard :- [:maybe ::dashboards.schema/dashboard]
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id dashboard-id))

(def ^:private DashboardTabName
  "Rows returned by [[dashboard-tab-names]]."
  [:map {:closed true}
   [:id   ms/PositiveInt]
   [:name :string]])

(mu/defn dashboard-tab-names :- [:sequential DashboardTabName]
  "The id and name of the DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select [:model/DashboardTab :id :name] :dashboard_id dashboard-id {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn dashboard-tab-ids :- [:maybe [:sequential ms/PositiveInt]]
  "The ids of the DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-pks-vec :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn insert-dashboard! :- (mut/optional-keys ::dashboards.schema/dashboard)
  "Insert the Dashboard `row` and return the inserted instance."
  [row :- ::dashboards.schema/dashboard.update]
  (t2/insert-returning-instance! :model/Dashboard row))

(mu/defn insert-dashcard! :- (mut/optional-keys ::dashboards.schema/dashboard-card)
  "Insert the DashboardCard `row` and return the inserted instance."
  [row :- ::dashboards.schema/dashboard-card.update]
  (t2/insert-returning-instance! :model/DashboardCard row))

(mu/defn dashcard-ids-in-layout-order :- [:maybe [:sequential ::lib.schema.id/dashcard]]
  "The ids of the DashboardCards of the Dashboard with `dashboard-id`, in row then column order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-fn-vec :id :model/DashboardCard :dashboard_id dashboard-id {:order-by [[:row :asc] [:col :asc]]}))

(mu/defn dashcards :- [:sequential ::dashboards.schema/dashboard-card]
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn dashcard-in-dashboard :- [:maybe ::dashboards.schema/dashboard-card]
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [dashcard-id  :- ::lib.schema.id/dashcard
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

(mu/defn update-dashcard! :- :int
  "Apply `changes` to the DashboardCard with `dashcard-id`, returning the number updated."
  [dashcard-id :- ::lib.schema.id/dashcard
   changes     :- (mut/select-keys ::dashboards.schema/dashboard-card.update [:visualization_settings :row :col])]
  (t2/update! :model/DashboardCard dashcard-id changes))

(mu/defn update-dashboard! :- :int
  "Apply `changes` to the Dashboard with `dashboard-id`, returning the number updated."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- (mut/select-keys ::dashboards.schema/dashboard.update [:name :description :collection_id :archived :archived_directly])]
  (t2/update! :model/Dashboard dashboard-id changes))

(mu/defn active-user-by-email :- [:maybe ::users.schema/user]
  "The active User with `email`, compared case-insensitively, or nil."
  [email :- :string]
  (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true))
