(ns metabase.users.db
  "Application database queries for the users module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn user :- [:maybe ::users.schema/user]
  "The ::users.schema/user with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/User :id [:auto/param user-id]))

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

(defn- data-studio-access-clauses
  "The disjuncts, any one of which grants a user access to Data Studio."
  []
  (cond-> [:core_user.is_superuser
           (table-metadata-perms-exist-clause)]
    ;; Data Studio entry pauses on downgrade, so membership only counts while the feature is available
    (premium-features/enable-advanced-permissions?) (conj :core_user.is_data_analyst)))

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
    true                                    (sql.helpers/where [:= :core_user.type "personal"])
    true                                    (sql.helpers/where (status-clause status include-deactivated))
    ;; don't send the internal user
    (perms/sandboxed-or-impersonated-user?) (sql.helpers/where [:= :core_user.id api/*current-user-id*])
    (contains? options :tenant-filter)      (sql.helpers/where (tenant-clause (:tenant-filter options)))
    (some? query)                           (sql.helpers/where (query-clause query))
    (some? is-data-analyst?)                (sql.helpers/where (if is-data-analyst?
                                                                 :core_user.is_data_analyst
                                                                 [:not :core_user.is_data_analyst]))
    (some? can-access-data-studio?)         (sql.helpers/where (let [clauses (data-studio-access-clauses)]
                                                                 (if can-access-data-studio?
                                                                   (into [:or] clauses)
                                                                   (into [:and] (map #(vector :not %)) clauses))))
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

(mu/defn user-count
  "The number of Users."
  []
  (t2/count :model/User))

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
            (mut/select-keys ::users.schema/user-parameter-value.update [:user_id :dashboard_id :parameter_id :value])]]
  (t2/insert! :model/UserParameterValue rows))

(mu/defn user-parameter-values-for-dashboards
  "The UserParameterValues of the User with `user-id` for the Dashboards with `dashboard-ids`."
  [user-id       :- ::lib.schema.id/user
   dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (t2/select :model/UserParameterValue :dashboard_id [:in dashboard-ids] :user_id user-id))

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

(def ^:private UserIds
  [:or
   [:set [:maybe ::lib.schema.id/user]]
   [:sequential [:maybe ::lib.schema.id/user]]])

(mu/defn user-summaries-by-id
  "A map of User ID to the ID, email, and names of the Users with `user-ids`."
  [{:keys [user-ids]} :- [:map {:closed true}
                          [:user-ids UserIds]]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn users-by-id
  "A map of User ID to User for the Users with `user-ids`."
  [{:keys [user-ids]} :- [:map {:closed true}
                          [:user-ids UserIds]]]
  (t2/select-pk->fn identity :model/User :id [:in user-ids]))

(mu/defn active-users
  "The active Users with `user-ids`."
  [{:keys [user-ids]} :- [:map {:closed true}
                          [:user-ids UserIds]]]
  (t2/select :model/User :id [:in user-ids] :is_active true))

(mu/defn active-user-ids
  "The ids among `user-ids` of active Users."
  [{:keys [user-ids]} :- [:map {:closed true}
                          [:user-ids UserIds]]]
  (t2/select-pks-set :model/User :id [:in user-ids] :is_active true))

(mu/defn active-user-emails
  "The emails of the active Users with `user-ids`."
  [{:keys [user-ids]} :- [:map {:closed true}
                          [:user-ids UserIds]]]
  (t2/select-fn-set :email :model/User {:where [:and
                                                [:= :is_active true]
                                                [:in :id user-ids]]}))

(mu/defn non-api-key-user-ids
  "The ids among `user-ids` of Users that are not API key Users."
  [{:keys [user-ids]} :- [:map {:closed true}
                          [:user-ids UserIds]]]
  (t2/select-pks-set :model/User :id [:in user-ids] :type [:not= :api-key]))

(mu/defn user-tenant-ids
  "A map of User ID to `:tenant_id` for `user-ids`."
  [{:keys [user-ids]} :- [:map {:closed true}
                          [:user-ids UserIds]]]
  (t2/select-pk->fn :tenant_id [:model/User :id :tenant_id] :id [:in user-ids]))

(mu/defn user-ids-by-entity-ids
  "The ids of the Users with `entity-ids`."
  [{:keys [entity-ids]} :- [:map {:closed true}
                            [:entity-ids [:sequential :string]]]]
  (t2/select-fn-set :id :model/User {:where [:in :entity_id entity-ids]}))

(mu/defn user-by-email
  "The User with exactly `email`, with just the `columns` when given, or nil."
  [{:keys [email columns]} :- [:map {:closed true}
                               [:email   :string]
                               [:columns {:optional true} [:maybe [:sequential :keyword]]]]]
  (t2/select-one (if columns (into [:model/User] columns) :model/User) :email [:auto/param email]))

(mu/defn user-by-lower-email
  "The User whose email matches `email` case-insensitively, with just the `columns` when given and only when active
  or inactive as `active?` says when given, or nil."
  [{:keys [email columns active?]} :- [:map {:closed true}
                                       [:email   :string]
                                       [:columns {:optional true} [:maybe [:sequential :keyword]]]
                                       [:active? {:optional true} [:maybe :boolean]]]]
  (apply t2/select-one
         (if columns (into [:model/User] columns) :model/User)
         :%lower.email [:auto/param (u/lower-case-en email)]
         (when (some? active?) [:is_active [:auto/param active?]])))

(mu/defn user-columns
  "The `columns` of the User with `user-id`, or nil."
  [{:keys [user-id columns]} :- [:map {:closed true}
                                 [:user-id ::lib.schema.id/user]
                                 [:columns [:sequential :keyword]]]]
  (t2/select-one (into [:model/User] columns) :id [:auto/param user-id]))

(mu/defn user-type
  "The `:type` of the User with `user-id`, or nil."
  [{:keys [user-id]} :- [:map {:closed true}
                         [:user-id ::lib.schema.id/user]]]
  (t2/select-one-fn :type :model/User :id [:auto/param user-id]))

(mu/defn user-active?
  "Whether the User with `user-id` is active."
  [{:keys [user-id]} :- [:map {:closed true}
                         [:user-id ::lib.schema.id/user]]]
  (t2/select-one-fn :is_active :model/User :id [:auto/param user-id]))

(mu/defn personal-user
  "The personal User with `user-id`, or nil."
  [{:keys [user-id]} :- [:map {:closed true}
                         [:user-id ::lib.schema.id/user]]]
  (t2/select-one :model/User :id [:auto/param user-id] :type :personal))

(mu/defn locked-user-id
  "The `:id` row of the User with `user-id`, locked for update."
  [{:keys [user-id]} :- [:map {:closed true}
                         [:user-id ::lib.schema.id/user]]]
  (t2/select-one [:model/User :id] :id [:auto/param user-id] {:for :update}))

(mu/defn current-user-for-id
  "The User with `user-id` as `{:metabase-user-id :is-superuser? :is-data-analyst? :user-locale :settings}`, or nil."
  [{:keys [user-id]} :- [:map {:closed true}
                         [:user-id ::lib.schema.id/user]]]
  (t2/select-one [:model/User
                  [:id :metabase-user-id]
                  [:is_superuser :is-superuser?]
                  [:is_data_analyst :is-data-analyst?]
                  [:locale :user-locale]
                  :settings]
                 :id [:auto/param user-id]))

(mu/defn user-exists?
  "Whether a User with `user-id` exists, narrowed to the given `active?`, `superuser?`, and `type`."
  [{:keys [user-id active? superuser? type]} :- [:map {:closed true}
                                                 [:user-id    ::lib.schema.id/user]
                                                 [:active?    {:optional true} [:maybe :boolean]]
                                                 [:superuser? {:optional true} [:maybe :boolean]]
                                                 [:type       {:optional true} [:maybe [:or :keyword :string]]]]]
  (apply t2/exists? :model/User
         :id [:auto/param user-id]
         (concat (when (some? active?) [:is_active [:auto/param active?]])
                 (when (some? superuser?) [:is_superuser [:auto/param superuser?]])
                 (when type [:type [:auto/param type]]))))

(mu/defn all-users
  "Every User."
  []
  (t2/select :model/User))

(mu/defn any-user
  "Some User, or nil."
  []
  (t2/select-one :model/User))

(mu/defn users-except
  "Every User other than the one with `user-id`."
  [{:keys [user-id]} :- [:map {:closed true}
                         [:user-id ::lib.schema.id/user]]]
  (t2/select :model/User {:where [:not= :id [:auto/param user-id]]}))

(mu/defn superusers
  "The superusers, only the active ones when `active?` is true."
  [{:keys [active?]} :- [:map {:closed true}
                         [:active? {:optional true} [:maybe :boolean]]]]
  (apply t2/select :model/User :is_superuser true (when active? [:is_active true])))

(mu/defn accepted-admin-emails
  "The emails of the active personal superusers who have logged in at least once, in id order."
  []
  (t2/select-fn-set :email :model/User
                    :is_superuser true
                    :is_active    true
                    :last_login   [:not= nil]
                    :type         "personal"
                    {:order-by [[:id :asc]]}))

(mu/defn oldest-active-superuser
  "The earliest-joined active superuser, or nil."
  []
  (t2/select-one :model/User :is_superuser true, :is_active true, {:order-by [:date_joined]}))

(mu/defn first-superuser
  "The `:id` and `:email` of the oldest superuser, or nil."
  []
  (t2/select-one [:model/User :id :email] :is_superuser true {:order-by [[:id :asc]]}))

(mu/defn earliest-user-join-date
  "The earliest `date_joined` of any User, or nil."
  []
  (:min (t2/select-one [:model/User [:%min.date_joined :min]])))

(mu/defn active-personal-user-count
  "The number of active personal Users."
  []
  (t2/count :model/User :is_active true, :type "personal"))

(mu/defn personal-user-count
  "The number of personal Users, narrowed to the optional `email` (case-insensitive)."
  [{:keys [email]} :- [:map {:closed true}
                       [:email {:optional true} [:maybe :string]]]]
  (t2/count :model/User {:where [:and
                                 [:= :type "personal"]
                                 (when email [:= :%lower.email (u/lower-case-en email)])]}))

(mu/defn active-recipients-for-channels
  "The id, email, name, and PulseChannel id of the active User recipients of the PulseChannels with `channel-ids`, in
  User id order."
  [{:keys [channel-ids]} :- [:map {:closed true}
                             [:channel-ids [:sequential ms/PositiveInt]]]]
  (t2/select [:model/User :id :email :first_name :last_name :pcr.pulse_channel_id]
             {:left-join [[:pulse_channel_recipient :pcr] [:= :core_user.id :pcr.user_id]]
              :where     [:and
                          [:in :pcr.pulse_channel_id channel-ids]
                          [:= :core_user.is_active true]]
              :order-by  [[:core_user.id :asc]]}))

(mu/defn comment-recipient-emails
  "The emails of the Users to notify about a comment: the authors of the Comment with `parent-comment-id` and of its
  replies, or the User with `creator-id` for a top-level comment, plus the Users with `mention-ids`."
  [{:keys [creator-id parent-comment-id mention-ids]} :- [:map {:closed true}
                                                          [:creator-id        ::lib.schema.id/user]
                                                          [:parent-comment-id [:maybe ms/PositiveInt]]
                                                          [:mention-ids       [:maybe [:sequential ms/PositiveInt]]]]]
  (t2/select-fn-set :email [:model/User :email]
                    {:where [:or
                             (if parent-comment-id
                               [:in :id ^:allow-subquery {:from   [:comment]
                                                          :select [:creator_id]
                                                          :where  [:or
                                                                   [:= :id [:auto/param parent-comment-id]]
                                                                   [:= :parent_comment_id [:auto/param parent-comment-id]]]}]
                               [:= :id [:auto/param creator-id]])
                             (when (seq mention-ids)
                               [:in :id mention-ids])]}))

(def ^:private VisibilityOptions
  [[:superuser?      :boolean]
   [:tenant-id       [:maybe ms/PositiveInt]]
   [:current-user-id ::lib.schema.id/user]
   [:visibility      [:enum :all :group :none]]])

(defn- visibility-conditions
  "The extra where conditions limiting Users to the ones the current user should see: superusers see everyone;
  everyone else is limited to their own tenant and further narrowed by `visibility`."
  [{:keys [superuser? tenant-id current-user-id visibility]}]
  (when-not superuser?
    (into [[:= :tenant_id tenant-id]]
          (case visibility
            :all   nil
            :group [[:in :core_user.id (-> (map :user_id (same-groups-user-ids current-user-id (:id (perms/all-users-group))))
                                           set
                                           (conj current-user-id))]]
            :none  [[:= :core_user.id [:auto/param current-user-id]]]))))

(mu/defn mentionable-users
  "The id, first name, last name, and email of the active Users the current user may @mention, ordered by name then
  id, limited to `limit` starting at `offset`."
  [{:keys [limit offset] :as options} :- (into [:map {:closed true}
                                                [:limit  [:maybe ms/PositiveInt]]
                                                [:offset [:maybe ms/IntGreaterThanOrEqualToZero]]]
                                               VisibilityOptions)]
  (t2/select [:model/User :id :first_name :last_name :email]
             (-> (filter-clauses {:limit limit :offset offset})
                 (as-> clauses (reduce sql.helpers/where clauses (visibility-conditions options)))
                 (sql.helpers/order-by [:%lower.first_name :asc]
                                       [:%lower.last_name :asc]
                                       [:id :asc]))))

(mu/defn visible-users-among
  "The Users among `user-ids` that are active personal Users the current user may see."
  [{:keys [user-ids] :as options} :- (into [:map {:closed true}
                                            [:user-ids UserIds]]
                                           VisibilityOptions)]
  (t2/select :model/User {:where (into [:and [:in :id user-ids] [:= :type "personal"] [:= :is_active true]]
                                       (visibility-conditions options))}))

(def ^:private totp-provider "totp")

(def ^:private confirmed-totp-exists
  [:exists ^:allow-subquery {:select [1]
                             :from   [:auth_identity]
                             :where  [:and
                                      [:= :auth_identity.user_id :core_user.id]
                                      [:= :auth_identity.provider totp-provider]
                                      [:not= :auth_identity.confirmed_at nil]]}])

(def ^:private unenrolled-user-where
  [:and
   [:= :core_user.is_active true]
   [:= :core_user.type "personal"]
   [:not confirmed-totp-exists]])

(def ^:private enrollment-list-columns
  [:id :email :first_name :last_name :sso_source :is_active :is_superuser])

(def ^:private enrolled-at-select
  [[^:allow-subquery {:select [:auth_identity.confirmed_at]
                      :from   [:auth_identity]
                      :where  [:and
                               [:= :auth_identity.user_id :core_user.id]
                               [:= :auth_identity.provider totp-provider]]}
    :enrolled_at]])

(defn- enrollment-list-where
  "The where clause of the admin enrollment lists: enrolled Users, or unenrolled active personal Users, narrowed by
  the name or email `search`."
  [enrolled? search]
  (cond-> [:and (if enrolled? confirmed-totp-exists unenrolled-user-where)]
    (not (str/blank? search))
    (conj (let [pattern (h2x/like-substring search)]
            [:or
             [:like :%lower.first_name pattern]
             [:like :%lower.last_name  pattern]
             [:like :%lower.email      pattern]]))))

(mu/defn unenrolled-user-count
  "The number of active personal Users without a confirmed TOTP enrollment."
  []
  (t2/count :model/User {:where unenrolled-user-where}))

(mu/defn enrollment-list
  "The name-ordered admin list of enrolled (with their enrollment time) or unenrolled Users matching `search`, paged
  by the optional `limit` and `offset`."
  [{:keys [enrolled? search limit offset]} :- [:map {:closed true}
                                               [:enrolled? :boolean]
                                               [:search    [:maybe :string]]
                                               [:limit     [:maybe ms/PositiveInt]]
                                               [:offset    [:maybe ms/IntGreaterThanOrEqualToZero]]]]
  (t2/select :model/User
             (cond-> {:select   (cond-> enrollment-list-columns enrolled? (into enrolled-at-select))
                      :where    (enrollment-list-where enrolled? search)
                      :order-by [[:%lower.first_name :asc]
                                 [:%lower.last_name  :asc]
                                 [:id :asc]]}
               limit (assoc :limit limit :offset offset))))

(mu/defn enrollment-list-count
  "The number of enrolled or unenrolled Users matching `search`."
  [{:keys [enrolled? search]} :- [:map {:closed true}
                                  [:enrolled? :boolean]
                                  [:search    [:maybe :string]]]]
  (t2/count :model/User {:where (enrollment-list-where enrolled? search)}))

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
