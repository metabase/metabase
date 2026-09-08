(ns metabase.channel.db
  "Application database queries for the channel module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.channel.schema :as channel.schema]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(def ^:private ChannelRow
  "A whole Channel row for insert or update."
  [:map {:closed true}
   [:name        {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe [:or :string :map sequential?]]]
   [:type        {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:details     {:optional true} [:maybe [:or :string :map sequential?]]]
   [:active      {:optional true} [:maybe :boolean]]])

(mu/defn channels :- [:sequential ::channel.schema/channel]
  "Every Channel."
  []
  (t2/select :model/Channel))

(mu/defn active-channels :- [:sequential ::channel.schema/channel]
  "The active Channels."
  []
  (t2/select :model/Channel :active true))

(mu/defn channel-name-exists? :- :boolean
  "Whether a Channel named `channel-name` exists."
  [channel-name :- :string]
  (t2/exists? :model/Channel :name channel-name))

(mu/defn insert-channel! :- (mut/optional-keys ::channel.schema/channel)
  "Insert the Channel `row` and return the inserted instance."
  [row :- ChannelRow]
  (t2/insert-returning-instance! :model/Channel row))

(mu/defn channel :- [:maybe ::channel.schema/channel]
  "The Channel with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Channel id))

(mu/defn update-channel! :- :int
  "Apply `changes` to the Channel with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- ChannelRow]
  (t2/update! :model/Channel id changes))

(mu/defn accepted-admin-emails :- [:maybe [:set :string]]
  "The emails of the active personal superusers who have logged in at least once, in id order."
  []
  (t2/select-fn-set :email :model/User
                    :is_superuser true
                    :is_active    true
                    :last_login   [:not= nil]
                    :type         "personal"
                    {:order-by [[:id :asc]]}))

(def ^:private UserContactInfo
  "Rows returned by [[user-contact-info]]."
  [:map {:closed true}
   [:last_name   [:maybe :string]]
   [:first_name  [:maybe :string]]
   [:email       :string]
   [:locale      [:maybe :string]]
   [:common_name :string]])

(mu/defn user-contact-info :- [:maybe UserContactInfo]
  "The name, email, locale, and derived common name of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :last_name :first_name :email :locale] :id user-id))

(mu/defn active-user-emails :- [:maybe [:set :string]]
  "The emails of the active Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-fn-set :email :model/User {:where [:and
                                                [:= :is_active true]
                                                [:in :id user-ids]]}))

(mu/defn user-ids-with-permission :- [:sequential [:map {:closed true} [:user_id (mut/optional-keys (mut/open-schema (mr/schema ::users.schema/user)))]]]
  "The ids of the Users belonging to a PermissionsGroup that holds `permission-path`."
  [permission-path :- :string]
  (app-db/query {:select   [:pgm.user_id]
                 :from     [[:permissions_group_membership :pgm]]
                 :join     [[:permissions_group :pg] [:= :pgm.group_id :pg.id]]
                 :where    [:exists ^:allow-subquery
                            {:select [1]
                             :from   [[:permissions :p]]
                             :where  [:and
                                      [:= :p.group_id :pg.id]
                                      [:= :p.object permission-path]]}]
                 :group-by [:pgm.user_id]}))

(mu/defn delete-pulse-channels-for-channel! :- :int
  "Delete the PulseChannels of the Channel with `channel-id`, returning the number deleted."
  [channel-id :- ms/PositiveInt]
  (t2/delete! :model/PulseChannel :channel_id channel-id))

(mu/defn channel-by-name :- [:maybe ::channel.schema/channel]
  "The Channel named `channel-name`, or nil."
  [channel-name :- :string]
  (t2/select-one :model/Channel :name channel-name))

(mu/defn database :- [:maybe ::warehouses.schema/database]
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn dashboard :- [:maybe ::dashboards.schema/dashboard]
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-tabs :- [:sequential ::dashboards.schema/dashboard-tab]
  "The DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]}))

(mu/defn dashcards :- [:sequential ::dashboards.schema/dashboard-card]
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn any-user :- [:maybe ::users.schema/user]
  "Some User, or nil."
  []
  (t2/select-one :model/User))
