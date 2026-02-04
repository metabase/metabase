(ns metabase.users.util
  (:require
   [clojure.set :as set]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.notification.core :as notification]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn check-self-or-superuser
  "Check that `user-id` is *current-user-id*` or that `*current-user*` is a superuser, or throw a 403."
  [user-id]
  {:pre [(integer? user-id)]}
  (api/check-403
   (or
    (= user-id api/*current-user-id*)
    api/*is-superuser?*)))

(defn- maybe-set-user-permissions-groups!
  [user-or-id new-groups-or-ids]
  (when (and new-groups-or-ids
             (not= (user/group-ids user-or-id)
                   (set (map u/the-id new-groups-or-ids))))
    (api/check-superuser)
    (user/set-permissions-groups! user-or-id new-groups-or-ids)))

(mr/def ::user-group-membership
  "Group Membership info of a User.
  In which :is_group_manager is only included if `advanced-permissions` is enabled."
  [:map
   [:id ms/PositiveInt]
   [:is_group_manager
    {:optional true, :description "Only relevant if `advanced-permissions` is enabled. If it is, you should always include this key."}
    :boolean]])

(mu/defn maybe-set-user-group-memberships!
  "Implementation for `POST /api/user` and friends; set the PermissionsGroupMemberships for a `user-or-id`."
  [user-or-id
   new-user-group-memberships :- [:maybe [:sequential ::user-group-membership]]
   & [is-superuser?]]
  (when new-user-group-memberships
    ;; if someone passed in both `:is_superuser` and `:group_ids`, make sure the whether the admin group is in group_ids
    ;; agrees with is_superuser -- don't want to have ambiguous behavior
    (when (some? is-superuser?)
      (api/checkp (= is-superuser? (contains? (set (map :id new-user-group-memberships)) (u/the-id (perms/admin-group))))
                  "is_superuser" (tru "Value of is_superuser must correspond to presence of Admin group ID in group_ids.")))
    (if-let [f (and (premium-features/enable-advanced-permissions?)
                    config/ee-available?
                    (requiring-resolve 'metabase-enterprise.advanced-permissions.models.permissions.group-manager/set-user-group-memberships!))]
      (f user-or-id new-user-group-memberships)
      (maybe-set-user-permissions-groups! user-or-id (map :id new-user-group-memberships)))))

(defn fetch-user
  "Implementation for `/api/user` endpoints; fetch a User from the app DB."
  [& query-criteria]
  (apply t2/select-one (vec (cons :model/User user/admin-or-self-visible-columns)) query-criteria))

(mu/defn invite-user!
  "Implementation for `POST /api/user`, invites a user to Metabase."
  [{:keys [email
           user-group-memberships
           source
           tenant-id]
    :as   attributes} :- [:map
                          [:source {:optional true, :default :admin} [:enum :setup :admin]]]]
  (api/check-superuser)
  (api/checkp (not (t2/exists? :model/User :%lower.email (u/lower-case-en email)))
              "email" (tru "Email address already in use."))
  (api/checkp (not (and tenant-id
                        (not (setting/get :use-tenants))))
              "tenant_id"
              (tru "Cannot create a Tenant User as Tenants are not enabled for this instance."))
  (t2/with-transaction [_conn]
    (let [new-user-id (u/the-id
                       (notification/with-skip-sending-notification (boolean tenant-id)
                         (user/create-and-invite-user!
                          (-> attributes
                              (u/select-non-nil-keys [:first-name :last-name :email :password :login-attributes :tenant-id])
                              (set/rename-keys {:first-name             :first_name
                                                :last-name              :last_name
                                                :user-group-memberships :user_group_memberships
                                                :login-attributes       :login_attributes
                                                :tenant-id              :tenant_id}))
                          @api/*current-user*
                          (= source :setup))))]
      (maybe-set-user-group-memberships! new-user-id user-group-memberships)
      (when (= source :setup)
        (maybe-set-user-permissions-groups! new-user-id [(perms/all-users-group) (perms/admin-group)]))
      (analytics/track-event! :snowplow/invite
                              {:event           :invite-sent
                               :invited-user-id new-user-id
                               :source          (or source :admin)})
      (-> (fetch-user :id new-user-id)
          (t2/hydrate :user_group_memberships)))))

(defn filter-clauses-without-paging
  "Given a where clause, return a clause that can be used to count."
  [clauses]
  (dissoc clauses :order-by :limit :offset))
