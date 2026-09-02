(ns metabase.channel.db
  "Application database queries for the channel module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn channels
  "Every Channel."
  []
  (t2/select :model/Channel))

(defn active-channels
  "The active Channels."
  []
  (t2/select :model/Channel :active true))

(defn channel-name-exists?
  "Whether a Channel named `channel-name` exists."
  [channel-name]
  (t2/exists? :model/Channel :name channel-name))

(defn insert-channel!
  "Insert the Channel `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Channel row))

(defn channel
  "The Channel with `id`, or nil."
  [id]
  (t2/select-one :model/Channel id))

(defn update-channel!
  "Apply `changes` to the Channel with `id`."
  [id changes]
  (t2/update! :model/Channel id changes))

(defn accepted-admin-emails
  "The emails of the active personal superusers who have logged in at least once, in id order."
  []
  (t2/select-fn-set :email :model/User
                    :is_superuser true
                    :is_active    true
                    :last_login   [:not= nil]
                    :type         "personal"
                    {:order-by [[:id :asc]]}))

(defn user-contact-info
  "The name, email, and locale of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/User :last_name :first_name :email :locale] :id user-id))

(defn active-user-emails
  "The emails of the active Users with `user-ids`."
  [user-ids]
  (t2/select-fn-set :email :model/User {:where [:and
                                                [:= :is_active true]
                                                [:in :id user-ids]]}))

(defn delete-pulse-channels-for-channel!
  "Delete the PulseChannels of the Channel with `channel-id`."
  [channel-id]
  (t2/delete! :model/PulseChannel :channel_id channel-id))

(defn channel-by-name
  "The Channel named `channel-name`, or nil."
  [channel-name]
  (t2/select-one :model/Channel :name channel-name))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard :id dashboard-id))

(defn dashboard-tabs
  "The DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id]
  (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]}))

(defn dashcards
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(defn hydrate-card
  "Hydrate `:card` onto `dashcards`."
  [dashcards]
  (t2/hydrate dashcards :card))

(defn any-user
  "Some User, or nil."
  []
  (t2/select-one :model/User))
