(ns metabase.channel.db
  "Application database queries for the channel module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private ChannelRow
  "A whole Channel row for insert or update."
  [:map {:closed true}
   [:name        {:optional true} :any]
   [:description {:optional true} :any]
   [:type        {:optional true} :any]
   [:details     {:optional true} :any]
   [:active      {:optional true} :any]])

(mu/defn channels :- [:sequential (ms/InstanceOf :model/Channel)]
  "Every Channel."
  []
  (t2/select :model/Channel))

(mu/defn active-channels :- [:sequential (ms/InstanceOf :model/Channel)]
  "The active Channels."
  []
  (t2/select :model/Channel :active true))

(mu/defn channel-name-exists? :- :boolean
  "Whether a Channel named `channel-name` exists."
  [channel-name :- :string]
  (t2/exists? :model/Channel :name channel-name))

(mu/defn insert-channel! :- (ms/InstanceOf :model/Channel)
  "Insert the Channel `row` and return the inserted instance."
  [row :- ChannelRow]
  (t2/insert-returning-instance! :model/Channel row))

(mu/defn channel :- [:maybe (ms/InstanceOf :model/Channel)]
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

(mu/defn user-contact-info :- [:maybe [:map {:closed true}
                                       [:last_name   [:maybe :string]]
                                       [:first_name  [:maybe :string]]
                                       [:email       :string]
                                       [:locale      [:maybe :string]]
                                       [:common_name :string]]]
  "The name, email, locale, and derived common name of the User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one [:model/User :last_name :first_name :email :locale] :id user-id))

(mu/defn active-user-emails :- [:maybe [:set :string]]
  "The emails of the active Users with `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn-set :email :model/User {:where [:and
                                                [:= :is_active true]
                                                [:in :id user-ids]]}))

(mu/defn user-ids-with-permission :- [:sequential [:map {:closed true} [:user_id ms/PositiveInt]]]
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

(mu/defn channel-by-name :- [:maybe (ms/InstanceOf :model/Channel)]
  "The Channel named `channel-name`, or nil."
  [channel-name :- :string]
  (t2/select-one :model/Channel :name channel-name))

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database :id database-id))

(mu/defn dashboard :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-tabs :- [:sequential (ms/InstanceOf :model/DashboardTab)]
  "The DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ms/PositiveInt]
  (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]}))

(mu/defn dashcards :- [:sequential (ms/InstanceOf :model/DashboardCard)]
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn any-user :- [:maybe (ms/InstanceOf :model/User)]
  "Some User, or nil."
  []
  (t2/select-one :model/User))
