(ns metabase.channel.db
  "Application database queries for the channel module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn channels
  "Every Channel."
  []
  (t2/select :model/Channel))

(mu/defn active-channels
  "The active Channels."
  []
  (t2/select :model/Channel :active true))

(mu/defn channel-name-exists?
  "Whether a Channel named `channel-name` exists."
  [channel-name :- :string]
  (t2/exists? :model/Channel :name channel-name))

(mu/defn channel
  "The Channel with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Channel :id [:auto/param id]))

(defn- text-type
  "The SQL type to cast a text parameter to, for the app DB."
  []
  (case (app-db/db-type)
    :postgres :text
    :h2       :varchar
    :char))

(mu/defn deactivated-name-clause
  "The HoneySQL expression for the name of a Channel once it is deactivated, which frees its unique name for a new
  Channel: `DEACTIVATED_<id> <name>` cut to 254 characters, where the name is `new-name`, the one the update gives, or
  the stored one when it is nil. It is the same for every row, and reads the stored `name` only when the update does
  not assign it."
  [new-name :- [:maybe :string]]
  [:substring
   [:concat "DEACTIVATED_" :id " " (if new-name
                                     [:cast [:auto/param new-name] (text-type)]
                                     :name)]
   1 254])

(mu/defn accepted-admin-emails
  "The emails of the active personal superusers who have logged in at least once, in id order."
  []
  (t2/select-fn-set :email :model/User
                    :is_superuser true
                    :is_active    true
                    :last_login   [:not= nil]
                    :type         "personal"
                    {:order-by [[:id :asc]]}))

(mu/defn user-contact-info
  "The name, email, locale, and derived common name of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :last_name :first_name :email :locale] :id user-id))

(mu/defn active-user-emails
  "The emails of the active Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select-fn-set :email :model/User {:where [:and
                                                [:= :is_active true]
                                                [:in :id user-ids]]}))

(mu/defn user-ids-with-permission
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

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-tabs
  "The DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]}))

(mu/defn dashcards
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn any-user
  "Some User, or nil."
  []
  (t2/select-one :model/User))
