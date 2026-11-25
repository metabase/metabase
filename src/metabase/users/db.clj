(ns metabase.users.db
  "Application database queries for the users module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
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
                             :from   [[(t2/table-name :model/PermissionsGroupMembership) :pgm]]
                             :join   [[(t2/table-name :model/DataPermissions) :p] [:= :p.group_id :pgm.group_id]]
                             :where  [:and
                                      [:= :pgm.user_id (u/qualified-key (t2/table-name :model/User) :id)]
                                      [:= :p.perm_type "perms/manage-table-metadata"]
                                      [:= :p.perm_value "yes"]]}])

(defn- data-studio-access-clauses
  "The disjuncts, any one of which grants a user access to Data Studio."
  []
  (cond-> [(u/qualified-key (t2/table-name :model/User) :is_superuser)
           (table-metadata-perms-exist-clause)]
    ;; Data Studio entry pauses on downgrade, so membership only counts while the feature is available
    (premium-features/enable-advanced-permissions?) (conj (u/qualified-key (t2/table-name :model/User) :is_data_analyst))))

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

(mu/defn filter-clauses
  "Honeysql clauses for filtering on users. See [[metabase.users.schema/user-filters]] for the accepted options."
  [{:keys [status query group-ids user-ids include-deactivated is-data-analyst? can-access-data-studio? sort
           limit offset]
    :as   options} :- ::users.schema/user-filters]
  (cond-> {}
    true                                    (sql.helpers/where [:= (u/qualified-key (t2/table-name :model/User) :type) "personal"])
    true                                    (sql.helpers/where (status-clause status include-deactivated))
    ;; don't send the internal user
    (perms/sandboxed-or-impersonated-user?) (sql.helpers/where [:= (u/qualified-key (t2/table-name :model/User) :id) api/*current-user-id*])
    (contains? options :tenant-filter)      (sql.helpers/where (tenant-clause (:tenant-filter options)))
    (some? query)                           (sql.helpers/where (query-clause query))
    (some? is-data-analyst?)                (sql.helpers/where (if is-data-analyst?
                                                                 (u/qualified-key (t2/table-name :model/User) :is_data_analyst)
                                                                 [:not (u/qualified-key (t2/table-name :model/User) :is_data_analyst)]))
    (some? can-access-data-studio?)         (sql.helpers/where (let [clauses (data-studio-access-clauses)]
                                                                 (if can-access-data-studio?
                                                                   (into [:or] clauses)
                                                                   (into [:and] (map #(vector :not %)) clauses))))
    (some? group-ids)                       (sql.helpers/right-join
                                             [(t2/table-name :model/PermissionsGroupMembership) :gm]
                                             [:= (u/qualified-key (t2/table-name :model/User) :id) :gm.user_id])
    (some? group-ids)                       (sql.helpers/where
                                             [:in :gm.group_id group-ids])
    (seq user-ids)                          (sql.helpers/where [:in (u/qualified-key (t2/table-name :model/User) :id) user-ids])
    (some? sort)                            (add-sort sort)
    (some? limit)                           (sql.helpers/limit limit)
    (some? offset)                          (sql.helpers/offset offset)))

(mu/defn set-user-last-login-now!
  "Set `last_login` of the User with `user-id` to now."
  [user-id :- ::lib.schema.id/user]
  (t2/update! :model/User :id user-id {:last_login :%now}))

(mu/defn update-user-settings!
  "Store `settings-json` as the user-local settings of the User with `user-id`, returning the number updated."
  [user-id       :- ::lib.schema.id/user
   settings-json :- :string]
  (t2/update! :model/User :id user-id {:settings settings-json}))

(mu/defn user-settings
  "The `:settings` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :settings [:model/User :settings] :id user-id))

(defn- by-id-partitions
  "The concatenated results of `f` called on each partition of `ids`, so that no statement binds more ids than the
  app DBs allow."
  [f ids]
  (into [] (mapcat f) (partition-all app-db/update-partition-size ids)))

(mu/defn group-member-ids :- [:set ::lib.schema.id/user]
  "The ids of those of the Users with `user-ids` who are members of the PermissionsGroup with `group-id`."
  [group-id :- ms/PositiveInt
   user-ids :- [:set {:min 1} ::lib.schema.id/user]]
  (set (by-id-partitions #(t2/select-fn-set :user_id :model/PermissionsGroupMembership
                                            :group_id group-id :user_id [:in (vec %)])
                         user-ids)))

(mu/defn user-group-ids
  "The ids of the PermissionsGroups the User with `user-id` belongs to."
  [user-id :- ::lib.schema.id/user]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))

(mu/defn group-memberships-for-users
  "The user id, group id (as `:id`), and group manager flag of the PermissionsGroupMemberships of the Users with
  `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (app-db/select-batched #(t2/select [:model/PermissionsGroupMembership :user_id [:group_id :id] :is_group_manager]
                                     :user_id [:in %])
                         user-ids))

(mu/defn user-group-ids-for-users
  "The user id and group id of the PermissionsGroupMemberships of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (app-db/select-batched #(t2/select [:model/PermissionsGroupMembership :user_id :group_id] :user_id [:in %]) user-ids))

(mu/defn user-count
  "The number of Users."
  []
  (t2/count :model/User))

(mu/defn active-personal-user-count :- :int
  "The number of active personal Users, counted on the table so that no after-select of the model runs."
  []
  (t2/count (t2/table-name :model/User) :is_active true :type "personal"))

(mu/defn tenant-collection-ids
  "A map of Tenant id to tenant Collection id for the Tenants with `tenant-ids`."
  [tenant-ids :- [:set ms/PositiveInt]]
  (app-db/select-batched-map #(t2/select-pk->fn :tenant_collection_id :model/Tenant :id [:in %]) tenant-ids))

(mu/defn users-with-all-columns :- [:sequential :map]
  "The Users with `user-ids`, with every column of `:core_user` that an event may carry."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (mapv #(dissoc % :password :password_salt :reset_token :reset_triggered :settings)
        (app-db/select-batched #(t2/select [:model/User :*] :id [:in %]) user-ids)))

(mu/defn users-by-ids :- [:map-of ::lib.schema.id/user :map]
  "A map from id to the User, as [[users-with-all-columns]] reads it, for each of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (into {} (map (juxt :id identity)) (by-id-partitions users-with-all-columns user-ids)))

(mu/defn user-ids-by-emails :- [:map-of :string ::lib.schema.id/user]
  "A map from the lower-cased email to the id of each User whose lower-cased email is one of `lower-case-emails`."
  [lower-case-emails :- [:sequential :string]]
  (into {}
        (map (juxt (comp u/lower-case-en :email) :id))
        (by-id-partitions #(t2/select [:model/User :id :email] :%lower.email [:in (vec %)]) lower-case-emails)))

(defn deactivated-at-clause
  "The `deactivated_at` a User gets when its `is_active` becomes `active?`: NULL on activation, else the stored stamp or
  now, an expression that reads no column the same statement assigns."
  [active?]
  (when-not active?
    [:coalesce :deactivated_at :%now]))

(mu/defn update-users! :- :nil
  "Apply `updates`, each the id of a User and its columns to set, with one update for each distinct change."
  [updates :- [:sequential :map]]
  (app-db/update-grouped! :model/User updates)
  nil)

(mu/defn user-ids-of-type
  "The ids among `user-ids` of the Users of `user-type`."
  [user-ids  :- [:sequential ::lib.schema.id/user]
   user-type :- :keyword]
  (if (seq user-ids)
    (app-db/select-batched #(t2/select-pks-vec :model/User :id [:in %] :type user-type) user-ids)
    []))

(mu/defn deactivated-with-tenant-user-ids
  "The ids of the inactive Users of the Tenants with `tenant-ids` that were deactivated with them."
  [tenant-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (app-db/select-batched #(t2/select-pks-vec :model/User
                                             :is_active false
                                             :tenant_id [:in %]
                                             :deactivated_with_tenant true)
                         tenant-ids))

(mu/defn active-user-ids-of-tenant
  "The ids of the active Users of the Tenants with `tenant-ids`."
  [tenant-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (app-db/select-batched #(t2/select-pks-vec :model/User :is_active true :tenant_id [:in %]) tenant-ids))

(mu/defn active-tenant-user-ids
  "The ids of the active Users of every Tenant."
  []
  (vec (t2/select-pks-vec :model/User :is_active true :tenant_id [:not= nil])))

(mu/defn same-groups-user-ids
  "The `:user_id`s of the Users sharing a PermissionsGroup other than the one with `all-users-group-id` with the User
  with `user-id`."
  [user-id            :- ::lib.schema.id/user
   all-users-group-id :- ms/PositiveInt]
  (t2/query {:select-distinct [(u/qualified-key (t2/table-name :model/PermissionsGroupMembership) :user_id)]
             :from [(t2/table-name :model/PermissionsGroupMembership)]
             :where [:in (u/qualified-key (t2/table-name :model/PermissionsGroupMembership) :group_id)
                     ^:allow-subquery
                     {:select-distinct [(u/qualified-key (t2/table-name :model/PermissionsGroupMembership) :group_id)]
                      :from  [(t2/table-name :model/PermissionsGroupMembership)]
                      :where [:and [:= (u/qualified-key (t2/table-name :model/PermissionsGroupMembership) :user_id) user-id]
                              [:not= (u/qualified-key (t2/table-name :model/PermissionsGroupMembership) :group_id) all-users-group-id]]}]}))

(mu/defn delete-user-parameter-values!
  "Delete the UserParameterValues identified by the `:user_id`, `:dashboard_id`, and `:parameter_id` of `parameters`."
  [parameters :- [:sequential [:map {:closed true}
                               [:user_id      ::lib.schema.id/user]
                               [:dashboard_id ::lib.schema.id/dashboard]
                               [:parameter_id :string]]]]
  (app-db/sum-batched app-db/delete-partition-size (fn [batch]
                                                     (t2/delete! :model/UserParameterValue
                                                                 {:where (into [:or] (for [p batch]
                                                                                       [:and
                                                                                        [:= :user_id (:user_id p)]
                                                                                        [:= :dashboard_id (:dashboard_id p)]
                                                                                        [:= :parameter_id (:parameter_id p)]]))})) parameters))

(mu/defn insert-user-parameter-values!
  "Insert the UserParameterValue `rows`."
  [rows :- [:sequential
            (mut/select-keys ::users.schema/user-parameter-value.update [:user_id :dashboard_id :parameter_id :value])]]
  (t2/insert! :model/UserParameterValue rows))

(mu/defn user-parameter-values-for-dashboards
  "The UserParameterValues of the User with `user-id` for the Dashboards with `dashboard-ids`."
  [user-id       :- ::lib.schema.id/user
   dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (app-db/select-batched #(t2/select :model/UserParameterValue :dashboard_id [:in %] :user_id user-id) dashboard-ids))

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
  (apply t2/select-one (into [:model/User] columns)
         :id id
         (concat (when type [:type type])
                 (when (some? is-active?) [:is_active is-active?]))))

(mu/defn user-email-exists?
  "Whether a User whose lower-cased email is `lower-case-email` exists."
  [lower-case-email :- :string]
  (t2/exists? :model/User :%lower.email lower-case-email))
