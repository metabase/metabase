(ns metabase.agent-api.db
  "Application database queries for the agent API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn collection-breadcrumb-columns :- [:maybe [:map {:closed true}
                                                   [:id                ms/PositiveInt]
                                                   [:name              :string]
                                                   [:location          [:maybe :string]]
                                                   [:personal_owner_id [:maybe ms/PositiveInt]]
                                                   [:namespace         [:maybe :keyword]]
                                                   [:archived_directly [:maybe :boolean]]]]
  "The id, name, location, owner, namespace, and archival of the Collection with `collection-id`, or nil."
  [collection-id :- ms/PositiveInt]
  (t2/select-one [:model/Collection :id :name :location :personal_owner_id :namespace :archived_directly]
                 collection-id))

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id))

(mu/defn dashboard :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-tab-names :- [:sequential [:map {:closed true}
                                              [:id   ms/PositiveInt]
                                              [:name :string]]]
  "The id and name of the DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ms/PositiveInt]
  (t2/select [:model/DashboardTab :id :name] :dashboard_id dashboard-id {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn dashboard-tab-ids :- [:maybe [:sequential ms/PositiveInt]]
  "The ids of the DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-pks-vec :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn insert-dashboard! :- (ms/InstanceOf :model/Dashboard)
  "Insert the Dashboard `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:name                    {:optional true} :any]
           [:description             {:optional true} :any]
           [:creator_id              {:optional true} :any]
           [:parameters              {:optional true} :any]
           [:points_of_interest      {:optional true} :any]
           [:caveats                 {:optional true} :any]
           [:show_in_getting_started {:optional true} :any]
           [:public_uuid             {:optional true} :any]
           [:made_public_by_id       {:optional true} :any]
           [:enable_embedding        {:optional true} :any]
           [:embedding_params        {:optional true} :any]
           [:archived                {:optional true} :any]
           [:position                {:optional true} :any]
           [:collection_id           {:optional true} :any]
           [:collection_position     {:optional true} :any]
           [:cache_ttl               {:optional true} :any]
           [:auto_apply_filters      {:optional true} :any]
           [:width                   {:optional true} :any]
           [:initially_published_at  {:optional true} :any]
           [:view_count              {:optional true} :any]
           [:archived_directly       {:optional true} :any]
           [:last_viewed_at          {:optional true} :any]
           [:embedding_type          {:optional true} :any]
           [:public_uuid_prefix      {:optional true} :any]]]
  (t2/insert-returning-instance! :model/Dashboard row))

(mu/defn insert-dashcard! :- (ms/InstanceOf :model/DashboardCard)
  "Insert the DashboardCard `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:size_x                 {:optional true} :any]
           [:size_y                 {:optional true} :any]
           [:row                    {:optional true} :any]
           [:col                    {:optional true} :any]
           [:card_id                {:optional true} :any]
           [:dashboard_id           {:optional true} :any]
           [:parameter_mappings     {:optional true} :any]
           [:visualization_settings {:optional true} :any]
           [:action_id              {:optional true} :any]
           [:dashboard_tab_id       {:optional true} :any]
           [:inline_parameters      {:optional true} :any]]]
  (t2/insert-returning-instance! :model/DashboardCard row))

(mu/defn dashcard-ids-in-layout-order :- [:maybe [:sequential ms/PositiveInt]]
  "The ids of the DashboardCards of the Dashboard with `dashboard-id`, in row then column order."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-fn-vec :id :model/DashboardCard :dashboard_id dashboard-id {:order-by [[:row :asc] [:col :asc]]}))

(mu/defn dashcards :- [:sequential (ms/InstanceOf :model/DashboardCard)]
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn dashcard-in-dashboard :- [:maybe (ms/InstanceOf :model/DashboardCard)]
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [dashcard-id  :- ms/PositiveInt
   dashboard-id :- ms/PositiveInt]
  (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

(mu/defn update-dashcard! :- :int
  "Apply `changes` to the DashboardCard with `dashcard-id`, returning the number updated."
  [dashcard-id :- ms/PositiveInt
   changes     :- [:map {:closed true}
                   [:visualization_settings {:optional true} :any]
                   [:row                    {:optional true} :int]
                   [:col                    {:optional true} :int]]]
  (t2/update! :model/DashboardCard dashcard-id changes))

(mu/defn update-dashboard! :- :int
  "Apply `changes` to the Dashboard with `dashboard-id`, returning the number updated."
  [dashboard-id :- ms/PositiveInt
   changes      :- [:map {:closed true}
                    [:name              {:optional true} [:maybe :string]]
                    [:description       {:optional true} [:maybe :string]]
                    [:collection_id     {:optional true} [:maybe ms/PositiveInt]]
                    [:archived          {:optional true} :boolean]
                    [:archived_directly {:optional true} :boolean]]]
  (t2/update! :model/Dashboard dashboard-id changes))

(mu/defn active-user-by-email :- [:maybe (ms/InstanceOf :model/User)]
  "The active User with `email`, compared case-insensitively, or nil."
  [email :- :string]
  (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true))
