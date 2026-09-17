(ns metabase.users.db
  "Application database queries for the users module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The queries below follow [[::user-opts]] and [[::user-parameter-value-opts]]; queries that do not fit them live in
  the users-only section at the bottom of this namespace."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.users.schema :as users.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- User -------------------------------------------------------

(mr/def ::user-filters
  "Which Users a query applies to. Keys mirror the columns of `:core_user`: a scalar matches that value and a set
  matches any of its values. A nullable column also takes a `<column>_set` key, matching the rows where that column
  is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:id              {:optional true} [:or ::lib.schema.id/user [:set ::lib.schema.id/user]]]
   [:entity_id       {:optional true} [:or :string [:set :string]]]
   [:email           {:optional true} [:or :string [:set :string]]]
   [:first_name      {:optional true} [:maybe :string]]
   [:last_name       {:optional true} [:maybe :string]]
   [:type            {:optional true} [:or :keyword :string [:set [:or :keyword :string]]]]
   [:is_active       {:optional true} :boolean]
   [:is_superuser    {:optional true} :boolean]
   [:is_data_analyst {:optional true} :boolean]
   [:sso_source      {:optional true} [:maybe [:or :keyword :string]]]
   [:tenant_id       {:optional true} :int]
   [:tenant_id_set   {:optional true} :boolean]
   [:last_login_set  {:optional true} :boolean]
   [:deactivated_with_tenant {:optional true} :boolean]])

(mr/def ::user-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::user-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::users.schema/user.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::users.schema/user.column
                                              [:tuple ::users.schema/user.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(def ^:private user-set-columns
  "Maps each `<column>_set` filter key of [[::user-filters]] to the column whose nullness it tests."
  {:tenant_id_set  :tenant_id
   :last_login_set :last_login})

(defn- ->user-model
  [columns]
  (u.query/model-with-columns :model/User columns))

(defn- ->user-args
  [opts]
  (u.query/opts->args opts {:set-columns user-set-columns}))

(defn- ->user-kv-args
  [opts]
  (u.query/opts->kv-args opts {:set-columns user-set-columns}))

;;; ---------------------------------------------- UserParameterValue -----------------------------------------------

(mr/def ::user-parameter-value-filters
  "Which UserParameterValues a query applies to. Keys mirror the columns of `user_parameter_value`: a scalar matches
  that value and a set matches any of its values."
  [:map {:closed true}
   [:user_id      {:optional true} [:or ::lib.schema.id/user [:set ::lib.schema.id/user]]]
   [:dashboard_id {:optional true} [:or ::lib.schema.id/dashboard [:set ::lib.schema.id/dashboard]]]
   [:parameter_id {:optional true} [:or :string [:set :string]]]])

(mr/def ::user-parameter-value-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::user-parameter-value-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::users.schema/user-parameter-value.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::users.schema/user-parameter-value.column
                                              [:tuple ::users.schema/user-parameter-value.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->user-parameter-value-model
  [columns]
  (u.query/model-with-columns :model/UserParameterValue columns))

(defn- ->user-parameter-value-args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads --------------------------------------------------------

(mu/defn select-users :- [:sequential ::users.schema/user.partial]
  "The Users matching `opts`."
  ([]
   (select-users nil))
  ([{:keys [columns] :as opts} :- [:maybe ::user-opts]]
   (apply t2/select (->user-model columns) (->user-args opts))))

(mu/defn select-one-user :- [:maybe ::users.schema/user.partial]
  "The first User matching `opts`, or nil."
  ([]
   (select-one-user nil))
  ([{:keys [columns] :as opts} :- [:maybe ::user-opts]]
   (apply t2/select-one (->user-model columns) (->user-args opts))))

(mu/defn select-user-pks :- [:set ::lib.schema.id/user]
  "The ids of the Users matching `opts`."
  ([]
   (select-user-pks nil))
  ([opts :- [:maybe ::user-opts]]
   (or (apply t2/select-pks-set :model/User (->user-args opts)) #{})))

(mu/defn select-user-pk->instance :- [:map-of ::lib.schema.id/user ::users.schema/user.partial]
  "A map of id to the User matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::user-opts]]
  (apply t2/select-pk->fn identity (->user-model columns) (->user-args opts)))

(mu/defn count-users :- :int
  "The number of Users matching `opts`."
  ([]
   (count-users nil))
  ([opts :- [:maybe ::user-opts]]
   (apply t2/count :model/User (->user-args opts))))

(mu/defn user-exists? :- :boolean
  "Whether a User matching `opts` exists."
  [opts :- [:maybe ::user-opts]]
  (apply t2/exists? :model/User (->user-args opts)))

(mu/defn select-user-parameter-values :- [:sequential ::users.schema/user-parameter-value.partial]
  "The UserParameterValues matching `opts`."
  ([]
   (select-user-parameter-values nil))
  ([{:keys [columns] :as opts} :- [:maybe ::user-parameter-value-opts]]
   (apply t2/select (->user-parameter-value-model columns) (->user-parameter-value-args opts))))

;;; ------------------------------------------------- Writes --------------------------------------------------------

(mu/defn update-users! :- :int
  "Apply `changes` to every User matching `opts`, returning the number updated."
  [opts    :- [:maybe ::user-opts]
   changes :- ::users.schema/user.update]
  (apply t2/update! :model/User (conj (->user-kv-args opts) changes)))

(mu/defn delete-users! :- :int
  "Delete every User matching `opts`, returning the number deleted."
  [opts :- [:maybe ::user-opts]]
  (apply t2/delete! :model/User (->user-args opts)))

;;; ------------------------------- Queries used only by the users module ---------------------------------

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

(mu/defn filter-clauses
  "Honeysql clauses for filtering on users. See [[metabase.users.schema/user-list-filters]] for the accepted options."
  [{:keys [status query group-ids user-ids include-deactivated is-data-analyst? can-access-data-studio? sort
           limit offset]
    :as   options} :- ::users.schema/user-list-filters]
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

(mu/defn set-user-last-login-now!
  "Set `last_login` of the User with `user-id` to now."
  [user-id :- ::lib.schema.id/user]
  (t2/update! :model/User user-id {:last_login :%now}))

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

(mu/defn tenant-collection-ids
  "A map of Tenant id to tenant Collection id for the Tenants with `tenant-ids`."
  [tenant-ids :- [:set ms/PositiveInt]]
  (t2/select-pk->fn :tenant_collection_id :model/Tenant :id [:in tenant-ids]))

(mu/defn insert-user!
  "Insert the User `row` and return the inserted instance."
  [row :- ::users.schema/user.create]
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

(mu/defn delete-user-parameter-values!
  "Delete the UserParameterValues identified by the `:user_id`, `:dashboard_id`, and `:parameter_id` of `parameters`."
  [parameters :- [:sequential [:map {:closed true}
                               [:user_id      ::lib.schema.id/user]
                               [:dashboard_id ::lib.schema.id/dashboard]
                               [:parameter_id :string]]]]
  (t2/delete! :model/UserParameterValue
              {:where (into [:or] (for [p parameters]
                                    [:and
                                     [:= :user_id (:user_id p)]
                                     [:= :dashboard_id (:dashboard_id p)]
                                     [:= :parameter_id (:parameter_id p)]]))}))

(mu/defn insert-user-parameter-values!
  "Insert the UserParameterValue `rows`."
  [rows :- [:sequential
            (mut/select-keys ::users.schema/user-parameter-value.create [:user_id :dashboard_id :parameter_id :value])]]
  (t2/insert! :model/UserParameterValue rows))

(mu/defn admin-or-self-visible-user :- [:maybe ::users.schema/user.partial]
  "The User with `id`, with the given `columns`, or nil. When `type` and/or `is-active?` are given (non-nil), also
  requires `:type` and/or `:is_active` to match."
  [columns :- [:sequential :keyword]
   id      :- ::lib.schema.id/user
   & {:keys [type is-active?]} :- [:maybe [:map {:closed true}
                                           [:type        {:optional true} [:maybe [:or :keyword :string]]]
                                           [:is-active?  {:optional true} [:maybe :boolean]]]]]
  (select-one-user (cond-> {:id id :columns columns}
                     type               (assoc :type type)
                     (some? is-active?) (assoc :is_active is-active?))))

(mu/defn user-email-exists?
  "Whether a User whose lower-cased email is `lower-case-email` exists."
  [lower-case-email :- :string]
  (t2/exists? :model/User :%lower.email lower-case-email))
