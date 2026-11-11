(ns metabase.users.db
  "Application database queries for the users module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.toucan.core :as t2]
   [metabase.users.schema :as users.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(defn- status-clause
  "Figure out what `where` clause to add to the user query when we get a fiddly status and include_deactivated
  query.

  This is to keep backwards compatibility with `include_deactivated` while adding `status."
  [status include-deactivated]
  (if include-deactivated
    nil
    (case status
      "all"         nil
      "deactivated" (t2/fragment [:= :is_active false])
      "active"      (t2/fragment [:= :is_active true])
      (t2/fragment [:= :is_active true]))))

(defn- wildcard-query [query] (second (h2x/like-substring query)))

(defn- query-clause
  "Honeysql clause to shove into user query if there's a query"
  [query]
  (t2/fragment
   [:or
    [:like :%lower.first_name [:escape (wildcard-query query) [::h2x/literal "!"]]]
    [:like :%lower.last_name  [:escape (wildcard-query query) [::h2x/literal "!"]]]
    [:like :%lower.email      [:escape (wildcard-query query) [::h2x/literal "!"]]]]))

(defn- table-metadata-perms-exist-clause
  "EXISTS clause, correlated to :core_user.id, testing whether the user is in a group that grants
  manage-table-metadata."
  []
  (t2/fragment
   [:exists ^:allow-subquery {:select [1]
                              :from   [[:permissions_group_membership :pgm]]
                              :join   [[:data_permissions :p] [:= :p.group_id :pgm.group_id]]
                              :where  [:and
                                       [:= :pgm.user_id :core_user.id]
                                       [:= :p.perm_type "perms/manage-table-metadata"]
                                       [:= :p.perm_value "yes"]]}]))

(defn- data-studio-access-clause
  "The clause granting a user access to Data Studio when `can-access?`, or denying it otherwise."
  [can-access?]
  (let [exists-clause (table-metadata-perms-exist-clause)
        analyst?      (premium-features/enable-advanced-permissions?)]
    (cond
      (and can-access? analyst?) (t2/fragment [:or :core_user.is_superuser exists-clause :core_user.is_data_analyst])
      can-access?                (t2/fragment [:or :core_user.is_superuser exists-clause])
      analyst?                   (t2/fragment [:and [:not :core_user.is_superuser] [:not exists-clause] [:not :core_user.is_data_analyst]])
      :else                      (t2/fragment [:and [:not :core_user.is_superuser] [:not exists-clause]]))))

(defn- tenant-clause
  "Honeysql clause restricting `:tenant_id`: `tenant-filter` is a tenant id to restrict to, `:all` for no
  restriction, `:external` for any non-nil tenant, or nil for no tenant (internal users)."
  [tenant-filter]
  (case tenant-filter
    :all      nil
    :external (t2/fragment [:not= :tenant_id nil])
    (t2/fragment [:= :tenant_id tenant-filter])))

(defn- order-by-clause
  "The fixed ORDER BY for [[filter-clauses]]'s `:sort` option."
  [sort]
  (case sort
    :first-name (t2/fragment [[:%lower.first_name :asc] [:%lower.last_name :asc] [:id :asc]])
    :last-name  (t2/fragment [[:%lower.last_name :asc] [:%lower.first_name :asc]])
    nil))

(mu/defn filter-clauses
  "The `:where`, `:right-join`, `:order-by`, `:limit`, and `:offset` clauses for filtering on users, to be spelled out in
  a query map: `:right-join` is empty and `:order-by` nil when not needed, and `:limit` and `:offset` fall back to
  unbounded. See [[metabase.users.schema/user-filters]] for the accepted options."
  [{:keys [status query group-ids user-ids include-deactivated is-data-analyst? can-access-data-studio? sort
           limit offset]
    :as   options} :- ::users.schema/user-filters]
  {:where      (t2/fragment
                [:and
                 [:= :core_user.type "personal"]
                 (status-clause status include-deactivated)
                 (when (perms/sandboxed-or-impersonated-user?)
                   (t2/fragment [:= :core_user.id api/*current-user-id*]))
                 (when (contains? options :tenant-filter)
                   (tenant-clause (:tenant-filter options)))
                 (when (some? query)
                   (query-clause query))
                 (when (some? is-data-analyst?)
                   (if is-data-analyst?
                     (t2/fragment [:and :core_user.is_data_analyst])
                     (t2/fragment [:not :core_user.is_data_analyst])))
                 (when (some? can-access-data-studio?)
                   (data-studio-access-clause can-access-data-studio?))
                 (when (some? group-ids)
                   (t2/fragment [:in :permissions_group_membership.group_id group-ids]))
                 (when (seq user-ids)
                   (t2/fragment [:in :core_user.id user-ids]))])
   :right-join (if (some? group-ids)
                 (t2/fragment [:permissions_group_membership [:= :core_user.id :permissions_group_membership.user_id]])
                 (t2/fragment []))
   :order-by   (order-by-clause sort)
   :limit      (or limit Integer/MAX_VALUE)
   :offset     (or offset 0)})

(mu/defn set-user-last-login-now!
  "Set `last_login` of the User with `user-id` to now."
  [user-id :- ::lib.schema.id/user]
  (t2/update! :model/User :id user-id {:last_login :%now}))

(mu/defn user-settings
  "The `:settings` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :settings [:model/User :settings] :id user-id))

(mu/defn delete-pulse-channel-recipients-for-user!
  "Delete every PulseChannelRecipient of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/PulseChannelRecipient :user_id user-id))

(mu/defn group-membership-exists?
  "Whether the User with `user-id` is a member of the PermissionsGroup with `group-id`."
  [group-id :- ms/PositiveInt
   user-id  :- ::lib.schema.id/user]
  (t2/exists? :model/PermissionsGroupMembership :group_id group-id :user_id user-id))

(mu/defn user-group-ids
  "The ids of the PermissionsGroups the User with `user-id` belongs to."
  [user-id :- ::lib.schema.id/user]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))

(mu/defn group-memberships-for-users
  "The user id, group id (as `:id`), and group manager flag of the PermissionsGroupMemberships of the Users with
  `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select [:model/PermissionsGroupMembership :user_id [:group_id :id] :is_group_manager] :user_id [:in user-ids]))

(mu/defn user-group-ids-for-users
  "The user id and group id of the PermissionsGroupMemberships of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select [:model/PermissionsGroupMembership :user_id :group_id] :user_id [:in user-ids]))

(mu/defn user-count
  "The number of Users."
  []
  (t2/count :model/User))

(mu/defn tenant-collection-ids
  "A map of Tenant id to tenant Collection id for the Tenants with `tenant-ids`."
  [tenant-ids :- [:set ms/PositiveInt]]
  (t2/select-pk->fn :tenant_collection_id :model/Tenant :id [:in tenant-ids]))

(mu/defn insert-user!
  "Insert the User `row` and return the inserted instance."
  [row :- ::users.schema/user.update]
  (t2/insert-returning-instance! :model/User row))

(mu/defn same-groups-user-ids
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

(defn- parameters-where
  "The clause matching any of the UserParameterValue identifiers in `parameters`, as a balanced tree."
  [parameters]
  (let [n (count parameters)]
    (case n
      0 (t2/fragment [:or])
      1 (let [p (first parameters)]
          (t2/fragment [:and
                        [:= :user_id (:user_id p)]
                        [:= :dashboard_id (:dashboard_id p)]
                        [:= :parameter_id (:parameter_id p)]]))
      (let [[l r] (split-at (quot n 2) parameters)]
        (t2/fragment [:or (parameters-where l) (parameters-where r)])))))

(mu/defn delete-user-parameter-values!
  "Delete the UserParameterValues identified by the `:user_id`, `:dashboard_id`, and `:parameter_id` of `parameters`."
  [parameters :- [:sequential [:map {:closed true}
                               [:user_id      ::lib.schema.id/user]
                               [:dashboard_id ::lib.schema.id/dashboard]
                               [:parameter_id :string]]]]
  (t2/delete! :model/UserParameterValue {:where (parameters-where parameters)}))

(mu/defn insert-user-parameter-values!
  "Insert the UserParameterValue `rows`."
  [rows :- [:sequential
            (mut/select-keys ::users.schema/user-parameter-value.update [:user_id :dashboard_id :parameter_id :value])]]
  (t2/insert! :model/UserParameterValue rows))

(mu/defn user-parameter-values-for-dashboards
  "The UserParameterValues of the User with `user-id` for the Dashboards with `dashboard-ids`."
  [user-id       :- ::lib.schema.id/user
   dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (t2/select :model/UserParameterValue :dashboard_id [:in dashboard-ids] :user_id user-id))

(mu/defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id :- :int]
  (t2/exists? :model/Database :id database-id))

(mu/defn admin-or-self-visible-user
  "The User with `id`, with the given `columns`, or nil. When `type` and/or `is-active?` are given (non-nil), also
  requires `:type` and/or `:is_active` to match."
  [columns :- [:sequential :keyword]
   id      :- ::lib.schema.id/user
   & {:keys [type is-active?]} :- [:maybe [:map {:closed true}
                                           [:type        {:optional true} [:maybe [:or :keyword :string]]]
                                           [:is-active?  {:optional true} [:maybe :boolean]]]]]
  (let [model (into [:model/User] columns)]
    (cond
      (and type (some? is-active?)) (t2/select-one model :id id :type type :is_active is-active?)
      type                          (t2/select-one model :id id :type type)
      (some? is-active?)            (t2/select-one model :id id :is_active is-active?)
      :else                         (t2/select-one model :id id))))

(mu/defn user-email-exists?
  "Whether a User whose lower-cased email is `lower-case-email` exists."
  [lower-case-email :- :string]
  (t2/exists? :model/User :%lower.email lower-case-email))
