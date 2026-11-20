(ns metabase-enterprise.permission-debug.db
  "Application database queries for the permission-debug module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.session.core :as session]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn user-superuser?
  "Whether the User with `user-id` is a superuser."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :is_superuser :model/User :id user-id))

(mu/defn active-user-exists?
  "Whether an active User with `user-id` exists."
  [user-id :- ::lib.schema.id/user]
  (t2/exists? :model/User :id user-id :is_active true))

(mu/defn previewable-user-info
  "The non-admin User with `user-id` as request current-user info (`{:metabase-user-id :is-superuser?
  :is-data-analyst? :user-locale}`), or nil. It must be active, or a hidden preview user, which is never active."
  [user-id :- ::lib.schema.id/user]
  (some->> (t2/select-one [:model/User
                           [:id :metabase-user-id]
                           [:is_superuser :is-superuser?]
                           [:is_data_analyst :is-data-analyst?]
                           [:locale :user-locale]]
                          {:where [:and
                                   [:= :id user-id]
                                   [:= :is_superuser false]
                                   [:or [:= :is_active true] [:= :type "permission-preview"]]]})
           (into {})))

(mu/defn preview-target
  "The User with `user-id` with what a preview needs to decide whether it can run as them: `:is_superuser`,
  `:is_active`, `:type`, `:is_data_analyst`, `:locale`, `:tenant_id`, `:tenant_active` (nil without a tenant) and
  `:group_manager` (whether they manage any group), or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/query-one {:select    [:user.id :user.is_superuser :user.is_active :user.type :user.is_data_analyst :user.locale
                             :user.tenant_id [:tenant.is_active :tenant_active] [:pgm.is_group_manager :group_manager]]
                 :from      [[:core_user :user]]
                 :left-join [[:tenant :tenant] [:= :tenant.id :user.tenant_id]
                             ;; as the session lookup joins it: one row per managed group, any of them will do
                             [:permissions_group_membership :pgm] [:and
                                                                   [:= :pgm.user_id :user.id]
                                                                   [:is :pgm.is_group_manager true]]]
                 :where     [:= :user.id [:auto/param user-id]]
                 :limit     [:inline 1]}))

(mu/defn user-summary
  "The `:id`, names and `:email` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :first_name :last_name :email] :id user-id))

(mu/defn group-name
  "The name of the permissions group with `group-id`, or nil."
  [group-id :- ms/PositiveInt]
  (t2/select-one-fn :name :model/PermissionsGroup :id group-id))

(mu/defn tenant
  "The `:id`, `:name` and `:attributes` of the tenant with `tenant-id`, or nil."
  [tenant-id :- ms/PositiveInt]
  (t2/select-one [:model/Tenant :id :name :slug :attributes] :id tenant-id))

;;; ------------------------------------------------ Explain access ------------------------------------------------

(mu/defn user-for-explain
  "The `:id`, names, `:email`, `:is_superuser` and `:tenant_id` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :first_name :last_name :email :is_superuser :tenant_id] :id user-id))

(mu/defn user-group-ids
  "The IDs of the groups of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))

(mu/defn tenant-group?
  "Whether the permissions group with `group-id` is a tenant group."
  [group-id :- ms/PositiveInt]
  (boolean (t2/select-one-fn :is_tenant_group :model/PermissionsGroup :id group-id)))

(mu/defn group-names
  "A map of group ID to name for the groups with `group-ids`."
  [group-ids :- [:set ms/PositiveInt]]
  (if (seq group-ids)
    (t2/select-pk->fn :name :model/PermissionsGroup :id [:in group-ids])
    {}))

(mu/defn database
  "The `:id` and `:name` of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one [:model/Database :id :name] :id database-id))

(mu/defn active-tables-of-database
  "The `:id`, `:schema`, `:name` and `:display_name` of the active Tables of the Database with `database-id`, by schema
  and name."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/Table :id :db_id :schema :name :display_name]
             :db_id database-id
             :active true
             {:order-by [[:schema :asc] [:name :asc]]}))

(mu/defn sandboxes-for-groups-in-database
  "The `:group_id`, `:table_id`, `:card_id` and `:attribute_remappings` of the Sandboxes of the groups with
  `group-ids` on Tables of the Database with `database-id`."
  [group-ids   :- [:set ms/PositiveInt]
   database-id :- ::lib.schema.id/database]
  (if (seq group-ids)
    (t2/select [:model/Sandbox :group_id :table_id :card_id :attribute_remappings]
               {:where [:and
                        [:in :group_id group-ids]
                        [:in :table_id ^:allow-subquery {:select [:id]
                                                         :from   [(t2/table-name :model/Table)]
                                                         :where  [:= :db_id database-id]}]]})
    []))

(mu/defn impersonations-for-groups-in-database
  "The `:group_id` and `:attribute` of the ConnectionImpersonations of the groups with `group-ids` on the Database with
  `database-id`."
  [group-ids   :- [:set ms/PositiveInt]
   database-id :- ::lib.schema.id/database]
  (if (seq group-ids)
    (t2/select [:model/ConnectionImpersonation :group_id :attribute] :group_id [:in group-ids] :db_id database-id)
    []))

(mu/defn router-user-attribute
  "The user attribute the Database with `database-id` routes on, or nil when it isn't a router."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :user_attribute :model/DatabaseRouter :database_id database-id))

(mu/defn destination-database-name-exists?
  "Whether the router Database with `router-database-id` has a destination named `database-name`."
  [router-database-id :- ::lib.schema.id/database
   database-name      :- :string]
  (t2/exists? :model/Database :router_database_id router-database-id :name database-name))

;;; ----------------------------------------------- Preview access -------------------------------------------------

(mu/defn groups
  "The `:id`, `:name`, `:magic_group_type` and `:is_tenant_group` of the groups with `group-ids`, by name."
  [group-ids :- [:set ms/PositiveInt]]
  (if (seq group-ids)
    (t2/select [:model/PermissionsGroup :id :name :magic_group_type :is_tenant_group]
               :id [:in group-ids] {:order-by [[:name :asc]]})
    []))

(mu/defn group-member-count
  "How many active users are members of the group with `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/count :model/User {:where [:and
                                 [:= :is_active true]
                                 [:in :id ^:allow-subquery {:select [:user_id]
                                                            :from   [:permissions_group_membership]
                                                            :where  [:= :group_id group-id]}]]}))

(mu/defn tenant-names
  "A map of tenant ID to name, for every tenant."
  []
  (t2/select-pk->fn :name :model/Tenant))

(mu/defn previewable-users
  "The `:id`, names, `:email`, `:is_superuser` and `:tenant_id` of every active, non-internal user, by name."
  []
  (t2/select [:model/User :id :first_name :last_name :email :is_superuser :tenant_id]
             :is_active true
             :type [:not= "internal"]
             {:order-by [[:first_name :asc] [:last_name :asc] [:id :asc]]}))

(mu/defn group-ids-by-user
  "A map of user ID to the IDs of their groups, for every user."
  []
  (update-vals (group-by :user_id (t2/select [:model/PermissionsGroupMembership :user_id :group_id]))
               #(into (sorted-set) (map :group_id) %)))

(mu/defn previewable-groups
  "The `:id`, `:name`, `:magic_group_type` and `:is_tenant_group` of every group, by name."
  []
  (t2/select [:model/PermissionsGroup :id :name :magic_group_type :is_tenant_group] {:order-by [[:name :asc]]}))

(mu/defn previewable-databases
  "The `:id` and `:name` of every Database an admin grants permissions on: not the audit database, not a routing
  destination."
  []
  (t2/select [:model/Database :id :name] :is_audit false :router_database_id nil {:order-by [[:name :asc]]}))

(mu/defn table
  "The `:id`, `:db_id`, `:schema`, `:name` and `:display_name` of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :id :db_id :schema :name :display_name] :id table-id))

(mu/defn database-permission-values-for-groups
  "A map of group ID to the database-level value (a keyword) of `perm-type` on the Database with `database-id`, for the
  groups with `group-ids` that have one."
  [group-ids   :- [:set ms/PositiveInt]
   perm-type   :- :keyword
   database-id :- ::lib.schema.id/database]
  (if (seq group-ids)
    ;; through the permissions module's source, so a preview of unsaved edits reads them too
    (into {}
          (map (juxt :group_id (comp keyword :perm_value)))
          (t2/query {:select [:p.group_id :p.perm_value]
                     :from   [[(perms/data-permissions-source) :p]]
                     :where  [:and
                              [:in :p.group_id group-ids]
                              [:= :p.perm_type (u/qualified-name perm-type)]
                              [:= :p.db_id database-id]
                              [:= :p.table_id nil]]}))
    {}))

(mu/defn group-ids-with-permission-objects
  "The `[group-id object]` pairs among the groups with `group-ids` that hold one of the permission `objects`."
  [group-ids :- [:set ms/PositiveInt]
   objects   :- [:set :string]]
  (if (seq group-ids)
    (t2/select-fn-set (juxt :group_id :object) :model/Permissions :group_id [:in group-ids] :object [:in objects])
    #{}))

(mu/defn collections-in-namespace
  "The `:id`, `:name`, `:location`, `:type` and `:personal_owner_id` of the unarchived Collections in
  `collection-namespace` (nil for the main one), trash excluded, by location and name."
  [collection-namespace :- [:maybe :string]]
  (t2/select [:model/Collection :id :name :location :type :personal_owner_id]
             {:where    [:and
                         [:= :archived false]
                         [:or [:= :type nil] [:not= :type "trash"]]
                         (if collection-namespace
                           [:= :namespace collection-namespace]
                           [:= :namespace nil])]
              :order-by [[:location :asc] [:name :asc]]}))

(mu/defn personal-collection-id
  "The ID of the personal Collection of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-pk :model/Collection :personal_owner_id user-id))

(mu/defn tenant-collection-id
  "The ID of the tenant Collection of the tenant with `tenant-id`, or nil."
  [tenant-id :- ms/PositiveInt]
  (t2/select-one-fn :tenant_collection_id :model/Tenant :id tenant-id))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(defn- blocked-tables-select
  [user-id tables-expr permissions-blocking permissions-granting]
  {:select [[:db.name :db_name] :blocked.schema [:blocked.name :table_name] [:pg.name :group_name]]
   :from   [[(t2/table-name :model/Table) :blocked]]
   :join   [[(perms/select-tables-and-groups-granting-perm
              {:user-id user-id :is-superuser? false}
              permissions-blocking) :perm_grant] [:= :blocked.id :perm_grant.id]
            [:metabase_database :db] [:= :blocked.db_id :db.id]
            [:permissions_group :pg] [:= :perm_grant.group_id :pg.id]]
   :where  [:and tables-expr
            [:not
             [:in :blocked.id (perms/visible-table-filter-select
                               :id
                               {:user-id user-id :is-superuser? false}
                               permissions-granting)]]]})

(mu/defn blocked-tables-in-database
  "The `[db-name schema table-name group-name]` rows of every Table in the Database with `database-id` blocked (per
  `permissions-blocking`) for the User with `user-id`, excluding those granted (per `permissions-granting`).

  `permissions-blocking`/`permissions-granting` are plain permission-type -> permission-value (or
  `[value :most|:least]`) mappings, per `perms/PermissionMapping`; db.clj builds the Honey SQL from them."
  [user-id              :- ::lib.schema.id/user
   database-id          :- ::lib.schema.id/database
   permissions-blocking :- perms/PermissionMapping
   permissions-granting :- perms/PermissionMapping]
  (t2/query (blocked-tables-select user-id [:= :blocked.db_id database-id] permissions-blocking permissions-granting)))

(mu/defn blocked-tables-among
  "The `[db-name schema table-name group-name]` rows of the Tables with `table-ids` blocked (per
  `permissions-blocking`) for the User with `user-id`, excluding those granted (per `permissions-granting`).

  `permissions-blocking`/`permissions-granting` are plain permission-type -> permission-value (or
  `[value :most|:least]`) mappings, per `perms/PermissionMapping`; db.clj builds the Honey SQL from them."
  [user-id              :- ::lib.schema.id/user
   table-ids            :- [:set ::lib.schema.id/table]
   permissions-blocking :- perms/PermissionMapping
   permissions-granting :- perms/PermissionMapping]
  (t2/query (blocked-tables-select user-id [:in :blocked.id table-ids] permissions-blocking permissions-granting)))

;;; --------------------------------------------- Hidden preview users ---------------------------------------------

(mu/defn preview-user-id
  "The ID of the hidden preview User with `email`, or nil."
  [email :- :string]
  (t2/select-one-pk :model/User :email email :type "permission-preview"))

(mu/defn insert-preview-user!
  "Insert an inactive hidden preview User and return its ID. Being inactive keeps it out of user lists, group and
  tenant member counts and the billed user count, which all count active users only."
  [user :- [:map {:closed true}
            [:email :string]
            [:first_name :string]
            [:tenant_id {:optional true} [:maybe ms/PositiveInt]]]]
  (t2/insert-returning-pk! :model/User (merge user {:last_name ""
                                                    :type      :permission-preview
                                                    :is_active false})))

(mu/defn set-user-login-attributes!
  "Replace the `login_attributes` of the User with `user-id`."
  [user-id    :- ::lib.schema.id/user
   attributes :- [:map-of :string :string]]
  (t2/update! :model/User user-id {:login_attributes attributes}))

(mu/defn add-user-to-groups!
  "Add the User with `user-id` to the groups with `group-ids`."
  [user-id   :- ::lib.schema.id/user
   group-ids :- [:sequential ms/PositiveInt]]
  (perms/add-user-to-groups! user-id group-ids))

(mu/defn group-members-attributes
  "The `:login_attributes`, `:jwt_attributes` and `:tenant_id` of the active, non-admin personal Users in the group with
  `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/select [:model/User :login_attributes :jwt_attributes :tenant_id]
             {:where [:and
                      [:= :is_active true]
                      [:= :is_superuser false]
                      [:= :type "personal"]
                      [:in :id ^:allow-subquery {:select [:user_id]
                                                 :from   [:permissions_group_membership]
                                                 :where  [:= :group_id group-id]}]]}))

(mu/defn tenant-attributes-by-id
  "A map of tenant ID to its `:attributes` for the tenants with `tenant-ids`."
  [tenant-ids :- [:set ms/PositiveInt]]
  (if (seq tenant-ids)
    (t2/select-pk->fn :attributes :model/Tenant :id [:in tenant-ids])
    {}))

(mu/defn group-sandboxes
  "The `:table_id` and `:attribute_remappings` of the Sandboxes of the group with `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/select [:model/Sandbox :table_id :attribute_remappings] :group_id group-id))

(mu/defn group-impersonations
  "The `:db_id` and `:attribute` of the ConnectionImpersonations of the group with `group-id`."
  [group-id :- ms/PositiveInt]
  (t2/select [:model/ConnectionImpersonation :db_id :attribute] :group_id group-id))

(mu/defn database-routers
  "The `:database_id` and `:user_attribute` of every DatabaseRouter."
  []
  (t2/select [:model/DatabaseRouter :database_id :user_attribute]))

(mu/defn destination-database-names
  "The names of the destination Databases of the router Database with `router-database-id`."
  [router-database-id :- ::lib.schema.id/database]
  (t2/select-fn-vec :name :model/Database :router_database_id router-database-id {:order-by [[:name :asc]]}))

(mu/defn table-display-name
  "The display name of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :display_name :model/Table :id table-id))

(mu/defn field-display-name
  "The display name of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :display_name :model/Field :id field-id))

(mu/defn field-table-id
  "The ID of the Table the Field with `field-id` belongs to, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :table_id :model/Field :id field-id))

(mu/defn field-column-values
  "The listed values of the Field with `field-id` (the ones filter widgets offer), or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :values :model/FieldValues :field_id field-id :type "full"))

;;; ------------------------------------------- Attributes that affect a person -------------------------------------------

(mu/defn user-attribute-sources
  "The `:login_attributes`, `:jwt_attributes` and `:tenant_id` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :login_attributes :jwt_attributes :tenant_id] :id user-id))

(mu/defn sandboxes-of-groups
  "The `:group_id`, `:table_id`, `:db_id` (the Table's Database) and `:attribute_remappings` of the Sandboxes of the
  groups with `group-ids`."
  [group-ids :- [:set ms/PositiveInt]]
  (if (seq group-ids)
    (t2/select [:model/Sandbox :group_id :table_id :attribute_remappings [:table.db_id :db_id]]
               {:join  [[(t2/table-name :model/Table) :table] [:= :table.id :sandboxes.table_id]]
                :where [:in :group_id group-ids]})
    []))

(mu/defn impersonations-of-groups
  "The `:group_id`, `:db_id` and `:attribute` of the ConnectionImpersonations of the groups with `group-ids`."
  [group-ids :- [:set ms/PositiveInt]]
  (if (seq group-ids)
    (t2/select [:model/ConnectionImpersonation :group_id :db_id :attribute] :group_id [:in group-ids])
    []))

(mu/defn dashboard-card-ids
  "The IDs of the Cards on the dashcards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-fn-set :card_id :model/DashboardCard
                    {:where [:and [:= :dashboard_id [:auto/param dashboard-id]] [:not= :card_id nil]]}))

(mu/defn dashboard-exists?
  "Whether the Dashboard with `dashboard-id` exists."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/exists? :model/Dashboard :id dashboard-id))

(mu/defn dashboard
  "The name and collection of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one [:model/Dashboard :name :collection_id] :id dashboard-id))

;;; ------------------------------------------------ Preview sessions ------------------------------------------------
;; Written straight to the table, past the Session model's hooks: its insert hook records a login for the user, and
;; its update hook allows only the ending columns.

(mu/defn insert-preview-session!
  "Insert a `core_session` row for the User with `user-id`: `key-hashed` (a preview-only derivation of its key, so no
  ordinary session lookup matches it), and `expires-at`."
  [session-id :- :string
   user-id    :- ::lib.schema.id/user
   key-hashed :- :string
   expires-at :- (ms/InstanceOfClass java.time.OffsetDateTime)]
  (t2/query-one {:insert-into (t2/table-name :model/Session)
                 :values      [{:id              session-id
                                :user_id         user-id
                                :key_hashed      key-hashed
                                :created_at      :%now
                                :expires_at      expires-at}]}))

(mu/defn preview-session
  "The `:id`, `:user_id`, `:expires_at` and `:ended_at` of the Session whose `key_hashed` is
  `key-hashed`, or nil."
  [key-hashed :- :string]
  (t2/select-one [:model/Session :id :user_id :expires_at :ended_at]
                 {:where [:= :key_hashed [:auto/param key-hashed]]}))

(mu/defn renew-preview-session!
  "Set the `expires_at` of the Session with `session-id` to `expires-at`."
  [session-id :- :string
   expires-at :- (ms/InstanceOfClass java.time.OffsetDateTime)]
  (t2/query-one {:update (t2/table-name :model/Session)
                 :set    {:expires_at expires-at}
                 :where  [:= :id [:auto/param session-id]]}))

(mu/defn delete-preview-sessions!
  "Delete the Sessions with `session-ids`."
  [session-ids :- [:sequential :string]]
  (when (seq session-ids)
    (t2/delete! :model/Session :id [:in session-ids])))

(mu/defn live-superuser-session?
  "Whether the Session whose `key_hashed` is `key-hashed` is live, an ordinary browser session (no anti-CSRF token),
  and belongs to the superuser with `user-id`."
  [key-hashed :- :string
   user-id    :- ::lib.schema.id/user]
  (some? (t2/query-one (merge session/session-from-and-joins
                              {:select [:session.id]
                               :where  (into [:and
                                              [:= :session.key_hashed [:auto/param key-hashed]]
                                              [:= :session.anti_csrf_token nil]
                                              [:= :session.user_id [:auto/param user-id]]
                                              [:= :user.is_superuser true]]
                                             (session/live-session-conditions (session/liveness-params)))
                               :limit  [:inline 1]}))))
