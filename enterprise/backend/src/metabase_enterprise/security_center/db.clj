(ns metabase-enterprise.security-center.db
  "Application database queries for the security-center module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn advisory
  "The SecurityAdvisory with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/SecurityAdvisory :id id))

(mu/defn advisory-by-advisory-id
  "The SecurityAdvisory with the external `advisory-id`, or nil."
  [advisory-id :- :string]
  (t2/select-one :model/SecurityAdvisory :advisory_id advisory-id))

(mu/defn max-advisory-updated-at
  "The latest `updated_at` across every SecurityAdvisory, or nil when there are none."
  []
  (:updated_at (t2/query-one {:select [[[:max :updated_at] :updated_at]]
                              :from   [:security_advisory]})))

(mu/defn advisories-newest-first
  "Every SecurityAdvisory, newest first."
  []
  (t2/select :model/SecurityAdvisory {:order-by [[:published_at :desc]]}))

(mu/defn advisories-reducible
  "Reducible SecurityAdvisories."
  []
  (t2/reducible-select :model/SecurityAdvisory))

(mu/defn advisories-with-statuses-reducible
  "Reducible severity and acknowledgement time of the SecurityAdvisories whose match status is one of `statuses`."
  [statuses :- [:set [:or :keyword :string]]]
  (t2/reducible-select [:model/SecurityAdvisory :severity :acknowledged_at] :match_status [:in statuses]))

(mu/defn unacknowledged-advisories-with-statuses
  "The unacknowledged SecurityAdvisories whose match status is one of `statuses`."
  [statuses :- [:sequential [:or :keyword :string]]]
  (t2/select :model/SecurityAdvisory :acknowledged_at nil :match_status [:in statuses]))

(mu/defn unacknowledged-advisories-by-advisory-ids
  "The unacknowledged SecurityAdvisories with the external `advisory-ids`."
  [advisory-ids :- [:set :string]]
  (t2/select :model/SecurityAdvisory :advisory_id [:in advisory-ids] :acknowledged_at nil))

(mu/defn update-advisory!
  "Apply `changes` to the SecurityAdvisory with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::security-center.schema/security-advisory.update [:match_status :last_evaluated_at :acknowledged_by :acknowledged_at :last_notified_at])]
  (t2/update! :model/SecurityAdvisory :id id changes))

(mu/defn record-advisory-evaluation!
  "Apply `changes` to the SecurityAdvisory with `id` and stamp `last_evaluated_at` with now, returning the number
  updated."
  [id      :- ms/PositiveInt
   changes :- (mut/select-keys ::security-center.schema/security-advisory.update [:match_status :acknowledged_by :acknowledged_at])]
  (t2/update! :model/SecurityAdvisory :id id (assoc changes :last_evaluated_at :%now)))

(mu/defn record-advisory-notification!
  "Set `last_notified_at` of the SecurityAdvisory with `id` to now, returning the number updated."
  [id :- ms/PositiveInt]
  (t2/update! :model/SecurityAdvisory :id id {:last_notified_at :%now}))

(mu/defn upsert-advisory!
  "Insert or update a SecurityAdvisory by `:advisory_id`. On insert, `:match_status` starts as `:unknown` until the
  matching engine evaluates it. On update, sets `advisory`'s columns, leaving `:match_status`, `:last_evaluated_at`,
  and acknowledgement fields (which `advisory` doesn't include) untouched."
  [advisory :- ::security-center.schema/security-advisory.update]
  (mdb/update-or-insert! :model/SecurityAdvisory
                         {:advisory_id (:advisory_id advisory)}
                         (fn [existing]
                           (if existing
                             advisory
                             (assoc advisory :match_status :unknown)))))

(mu/defn user-summaries-by-id
  "A map of ID to the ID, names, and email of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-fn->fn :id identity [:model/User :id :first_name :last_name :email] :id [:in user-ids]))

(mu/defn group-queryable-databases :- [:sequential [:map [:id ms/PositiveInt] [:name :string]]]
  "The id and name, in name order, of the databases the group with `group-id` can query in any way: a create-queries
  permission other than `:no` on the database or on one of its tables."
  [group-id :- ms/PositiveInt]
  (if-let [db-ids (not-empty (t2/select-fn-set :db_id :model/DataPermissions
                                               :group_id   group-id
                                               :perm_type  :perms/create-queries
                                               :perm_value [:not= :no]))]
    (t2/select [:model/Database :id :name] :id [:in db-ids] {:order-by [:name]})
    []))

(mu/defn databases-with-details :- [:sequential [:map
                                                 [:id      ms/PositiveInt]
                                                 [:name    :string]
                                                 [:engine  :keyword]
                                                 [:details :map]
                                                 [:dbms_version [:maybe :map]]
                                                 [:is_attached_dwh [:maybe :boolean]]
                                                 [:router_database_id [:maybe ms/PositiveInt]]]]
  "The id, name, engine, connection details, synced server version, attached-DWH flag and router, in name order, of
  every database that Admin → Databases shows: every database except the audit database, routing destinations
  included."
  []
  (t2/select [:model/Database :id :name :engine :details :dbms_version :is_attached_dwh :router_database_id]
             :is_audit false
             {:order-by [:name]}))

(mu/defn impersonations-for-database :- [:sequential [:map [:group_id ms/PositiveInt] [:attribute [:maybe :string]]]]
  "The group and the user attribute of each connection impersonation policy on the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/ConnectionImpersonation :group_id :attribute] :db_id database-id))

(mu/defn active-non-admin-members :- [:sequential [:map [:id ::lib.schema.id/user]]]
  "The active Users that are not admins and are in a group with an id in `group-ids`, with the columns that their user
  attributes are built from."
  [group-ids :- [:set {:min 1} ms/PositiveInt]]
  (t2/select [:model/User :id :type :tenant_id :login_attributes :jwt_attributes]
             {:where [:and
                      [:= :is_active true]
                      [:= :is_superuser false]
                      [:in :id ^:allow-subquery {:select [:user_id]
                                                 :from   [:permissions_group_membership]
                                                 :where  [:in :group_id group-ids]}]]}))

(mu/defn group-memberships :- [:sequential [:map [:user_id ::lib.schema.id/user] [:group_id ms/PositiveInt]]]
  "The user and the group of every group membership of the Users that are in a group with an id in `group-ids`."
  [group-ids :- [:set {:min 1} ms/PositiveInt]]
  (t2/select [:model/PermissionsGroupMembership :user_id :group_id]
             {:where [:in :user_id ^:allow-subquery {:select [:user_id]
                                                     :from   [:permissions_group_membership]
                                                     :where  [:in :group_id group-ids]}]}))

(mu/defn router-user-attribute :- [:maybe :string]
  "The user attribute that the router Database with `database-id` routes on, or nil when that Database is not a
  router."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :user_attribute :model/DatabaseRouter :database_id database-id))

(mu/defn unrestricted-group-ids :- [:set ms/PositiveInt]
  "The ids of the groups whose View data permission on the whole Database with `database-id` is `:unrestricted`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-fn-set :group_id :model/DataPermissions
                    :db_id      database-id
                    :table_id   nil
                    :perm_type  :perms/view-data
                    :perm_value :unrestricted))
