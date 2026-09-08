(ns metabase.users.db
  "Application database queries for the users module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.users.schema :as users.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- status-clause
  "Figure out what `where` clause to add to the user query when we get a fiddly status and include_deactivated
  query.

  This is to keep backwards compatibility with `include_deactivated` while adding `status."
  [status include-deactivated]
  (if include-deactivated
    nil
    (case status
      "all"         nil
      "deactivated" [:= :is_active false]
      "active"      [:= :is_active true]
      [:= :is_active true])))

(defn- wildcard-query [query] (h2x/like-substring query))

(defn- query-clause
  "Honeysql clause to shove into user query if there's a query"
  [query]
  [:or
   [:like :%lower.first_name (wildcard-query query)]
   [:like :%lower.last_name  (wildcard-query query)]
   [:like :%lower.email      (wildcard-query query)]])

(defn- table-metadata-perms-exist-clause
  "EXISTS clause, correlated to :core_user.id, testing whether the user is in a group that grants
  manage-table-metadata."
  []
  [:exists ^:allow-subquery {:select [1]
                             :from   [[:permissions_group_membership :pgm]]
                             :join   [[:data_permissions :p] [:= :p.group_id :pgm.group_id]]
                             :where  [:and
                                      [:= :pgm.user_id :core_user.id]
                                      [:= :p.perm_type "perms/manage-table-metadata"]
                                      [:= :p.perm_value "yes"]]}])

(defn- tenant-clause
  "Honeysql clause restricting `:tenant_id`: `tenant-filter` is a tenant id to restrict to, `:all` for no
  restriction, `:external` for any non-nil tenant, or nil for no tenant (internal users)."
  [tenant-filter]
  (case tenant-filter
    :all      nil
    :external [:not= :tenant_id nil]
    [:= :tenant_id tenant-filter]))

(def ^:private sort-order-by
  "Fixed ORDER BYs for [[filter-clauses]]'s `:sort` option."
  {:first-name [[:%lower.first_name :asc] [:%lower.last_name :asc] [:id :asc]]
   :last-name  [[:%lower.last_name :asc] [:%lower.first_name :asc]]})

(defn- add-sort
  [honeysql-map sort]
  (apply sql.helpers/order-by honeysql-map (sort-order-by sort)))

(mu/defn filter-clauses :- :map
  "Honeysql clauses for filtering on users.

  Options:
    :status                  - filter by status (\"active\", \"deactivated\", \"all\")
    :query                   - text search on first_name, last_name, email
    :group-ids               - filter by permissions group membership
    :user-ids                - filter to just these user ids
    :include-deactivated     - legacy alias for status=all
    :is-data-analyst?        - filter by data analyst status (true/false)
    :can-access-data-studio? - filter by Data Studio access (analysts, superusers, or users with table metadata perms)
    :tenant-filter           - restrict `:tenant_id`: a tenant id, `:all` (no restriction), `:external` (any
                               non-nil tenant), or nil (no tenant); omit the key entirely for no restriction
    :sort                    - `:first-name` or `:last-name`, adds an ORDER BY; omit for none
    :limit                   - pagination limit
    :offset                  - pagination offset"
  [{:keys [status query group-ids user-ids include-deactivated is-data-analyst? can-access-data-studio? sort
           limit offset]
    :as   options} :- [:map {:closed true}
                       [:status                  {:optional true} [:maybe [:or :keyword :string]]]
                       [:query                   {:optional true} [:maybe [:or :string :map sequential?]]]
                       [:group-ids               {:optional true} [:maybe [:or [:set ms/PositiveInt] [:sequential ms/PositiveInt]]]]
                       [:user-ids                {:optional true} [:maybe [:or [:set ::lib.schema.id/user] [:sequential ::lib.schema.id/user]]]]
                       [:include-deactivated     {:optional true} [:maybe :boolean]]
                       [:is-data-analyst?        {:optional true} [:maybe :boolean]]
                       [:can-access-data-studio? {:optional true} [:maybe :boolean]]
                       [:tenant-filter           {:optional true} [:maybe [:or ms/PositiveInt [:enum :all :external]]]]
                       [:sort                    {:optional true} [:maybe [:enum :first-name :last-name]]]
                       [:limit                   {:optional true} [:maybe ms/PositiveInt]]
                       [:offset                  {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]]]
  (cond-> {}
    true                                    (sql.helpers/where [:= :core_user.type "personal"])
    true                                    (sql.helpers/where (status-clause status include-deactivated))
    ;; don't send the internal user
    (perms/sandboxed-or-impersonated-user?) (sql.helpers/where [:= :core_user.id api/*current-user-id*])
    (contains? options :tenant-filter)      (sql.helpers/where (tenant-clause (:tenant-filter options)))
    (some? query)                           (sql.helpers/where (query-clause query))
    (some? is-data-analyst?)                (sql.helpers/where (if is-data-analyst?
                                                                 :core_user.is_data_analyst
                                                                 [:not :core_user.is_data_analyst]))
    (some? can-access-data-studio?)         (sql.helpers/where (if can-access-data-studio?
                                                                 [:or
                                                                  :core_user.is_data_analyst
                                                                  :core_user.is_superuser
                                                                  (table-metadata-perms-exist-clause)]
                                                                 [:and
                                                                  [:not :core_user.is_data_analyst]
                                                                  [:not :core_user.is_superuser]
                                                                  [:not (table-metadata-perms-exist-clause)]]))
    (some? group-ids)                       (sql.helpers/right-join
                                             :permissions_group_membership
                                             [:= :core_user.id :permissions_group_membership.user_id])
    (some? group-ids)                       (sql.helpers/where
                                             [:in :permissions_group_membership.group_id group-ids])
    (seq user-ids)                          (sql.helpers/where [:in :core_user.id user-ids])
    (some? sort)                            (add-sort sort)
    (some? limit)                           (sql.helpers/limit limit)
    (some? offset)                          (sql.helpers/offset offset)))

(mu/defn set-user-last-login-now! :- :int
  "Set `last_login` of the User with `user-id` to now."
  [user-id :- ::lib.schema.id/user]
  (t2/update! :model/User user-id {:last_login :%now}))

(mu/defn user-settings :- [:maybe :map]
  "The `:settings` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :settings [:model/User :settings] :id user-id))

(mu/defn delete-pulse-channel-recipients-for-user! :- :int
  "Delete every PulseChannelRecipient of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/PulseChannelRecipient :user_id user-id))

(mu/defn group-membership-exists? :- :boolean
  "Whether the User with `user-id` is a member of the PermissionsGroup with `group-id`."
  [group-id :- ms/PositiveInt
   user-id  :- ::lib.schema.id/user]
  (t2/exists? :model/PermissionsGroupMembership :group_id group-id :user_id user-id))

(mu/defn user-group-ids :- [:maybe [:set ms/PositiveInt]]
  "The ids of the PermissionsGroups the User with `user-id` belongs to."
  [user-id :- ::lib.schema.id/user]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))

(mu/defn group-memberships-for-users :- [:sequential (mut/optional-keys (mut/open-schema (mr/schema ::permissions.schema/permissions-group-membership)))]
  "The user id, group id (as `:id`), and group manager flag of the PermissionsGroupMemberships of the Users with
  `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select [:model/PermissionsGroupMembership :user_id [:group_id :id] :is_group_manager] :user_id [:in user-ids]))

(mu/defn user-group-ids-for-users :- [:sequential (mut/select-keys ::permissions.schema/permissions-group-membership [:user_id :group_id])]
  "The user id and group id of the PermissionsGroupMemberships of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select [:model/PermissionsGroupMembership :user_id :group_id] :user_id [:in user-ids]))

(mu/defn user-count :- ms/IntGreaterThanOrEqualToZero
  "The number of Users."
  []
  (t2/count :model/User))

(mu/defn tenant-collection-ids :- [:map-of ms/PositiveInt [:maybe ms/PositiveInt]]
  "A map of Tenant id to tenant Collection id for the Tenants with `tenant-ids`."
  [tenant-ids :- [:set ms/PositiveInt]]
  (t2/select-pk->fn :tenant_collection_id :model/Tenant :id [:in tenant-ids]))

(mu/defn insert-user! :- (mut/optional-keys ::users.schema/user)
  "Insert the User `row` and return the inserted instance."
  [row :- ::users.schema/user.update]
  (t2/insert-returning-instance! :model/User row))

(def ^:private SameGroupsUserId
  "Rows returned by [[same-groups-user-ids]]."
  [:map {:closed true}
   [:user_id [:maybe ::lib.schema.id/user]]])

(mu/defn same-groups-user-ids :- [:sequential SameGroupsUserId]
  "The `:user_id`s of the Users sharing a PermissionsGroup other than the one with `all-users-group-id` with the User
  with `user-id`."
  [user-id            :- ::lib.schema.id/user
   all-users-group-id :- ms/PositiveInt]
  (t2/query {:select-distinct [:permissions_group_membership.user_id]
             :from [:permissions_group_membership]
             :where [:in :permissions_group_membership.group_id
                     ^:allow-subquery
                     {:select-distinct [:permissions_group_membership.group_id]
                      :from  [:permissions_group_membership]
                      :where [:and [:= :permissions_group_membership.user_id user-id]
                              [:not= :permissions_group_membership.group_id all-users-group-id]]}]}))

(mu/defn delete-user-parameter-values! :- :int
  "Delete the UserParameterValues identified by the `:user_id`, `:dashboard_id`, and `:parameter_id` of `parameters`."
  [parameters :- [:sequential [:map
                               [:user_id      ::lib.schema.id/user]
                               [:dashboard_id ::lib.schema.id/dashboard]
                               [:parameter_id :string]]]]
  (t2/delete! :model/UserParameterValue
              {:where (into [:or] (for [p parameters]
                                    [:and
                                     [:= :user_id (:user_id p)]
                                     [:= :dashboard_id (:dashboard_id p)]
                                     [:= :parameter_id (:parameter_id p)]]))}))

(mu/defn insert-user-parameter-values! :- :int
  "Insert the UserParameterValue `rows`."
  [rows :- [:sequential
            (mut/select-keys ::users.schema/user-parameter-value.update [:user_id :dashboard_id :parameter_id :value])]]
  (t2/insert! :model/UserParameterValue rows))

(mu/defn user-parameter-values-for-dashboards :- [:sequential ::users.schema/user-parameter-value]
  "The UserParameterValues of the User with `user-id` for the Dashboards with `dashboard-ids`."
  [user-id       :- ::lib.schema.id/user
   dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (t2/select :model/UserParameterValue :dashboard_id [:in dashboard-ids] :user_id user-id))

(mu/defn database-exists? :- :boolean
  "Whether a Database with `database-id` exists."
  [database-id :- :int]
  (t2/exists? :model/Database :id database-id))

(mu/defn admin-or-self-visible-user :- [:maybe ::lib.schema.id/user]
  "The User with `id`, with the given `columns`, or nil. When `type` and/or `is-active?` are given (non-nil), also
  requires `:type` and/or `:is_active` to match."
  [columns :- [:sequential :keyword]
   id      :- ::lib.schema.id/user
   & {:keys [type is-active?]} :- [:maybe [:map {:closed true}
                                           [:type        {:optional true} [:maybe [:or :keyword :string]]]
                                           [:is-active?  {:optional true} [:maybe :boolean]]]]]
  (apply t2/select-one (into [:model/User] columns)
         :id id
         (concat (when type [:type type])
                 (when (some? is-active?) [:is_active is-active?]))))

(mu/defn user-email-exists? :- :boolean
  "Whether a User whose lower-cased email is `lower-case-email` exists."
  [lower-case-email :- :string]
  (t2/exists? :model/User :%lower.email lower-case-email))
