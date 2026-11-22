(ns metabase.channel.db
  "Application database queries for the channel module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.channel.schema :as channel.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private ChannelRow
  "A whole Channel row for insert or update."
  ::channel.schema/channel.update)

(def ^:private ChannelTemplateRow
  "A whole ChannelTemplate row for insert."
  ::channel.schema/channel-template.update)

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

(mu/defn insert-channels!
  "Insert the Channel `rows` with one statement per distinct set of columns and return the inserted instances in their
  order."
  [rows :- [:sequential {:min 1} ChannelRow]]
  (app-db/insert-returning-instances! :model/Channel rows))

(mu/defn channels-by-ids
  "The Channels with `ids`."
  [ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/select :model/Channel :id [:in [:auto/param ids]]))

(mu/defn channel
  "The Channel with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Channel :id [:auto/param id]))

(mu/defn update-channels!
  "Apply `changes` to the Channels with `ids`."
  [ids     :- [:sequential {:min 1} ms/PositiveInt]
   changes :- ChannelRow]
  (t2/update! :model/Channel :id [:in [:auto/param ids]] changes)
  nil)

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

(mu/defn insert-channel-template!
  "Insert `template` and return the inserted instance."
  [template :- ChannelTemplateRow]
  (t2/insert-returning-instance! :model/ChannelTemplate template))

(mu/defn channel-templates-by-ids
  "The ChannelTemplates with `template-ids`."
  [template-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/select :model/ChannelTemplate :id [:in template-ids]))

(mu/defn delete-channel-templates!
  "Delete the ChannelTemplates with `template-ids`, returning the number deleted."
  [template-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/ChannelTemplate :id [:in template-ids]))

(mu/defn delete-channels!
  "Delete the Channels with `channel-ids`, returning the number deleted."
  [channel-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/delete! :model/Channel :id [:in channel-ids]))
