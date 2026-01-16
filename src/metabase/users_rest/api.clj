(ns metabase.users-rest.api
  "/api/user endpoints"
  (:require
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.appearance.core :as appearance]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.settings.core :as setting]
   [metabase.sso.core :as sso]
   [metabase.tenants.core :as tenants]
   [metabase.users.models.user :as user]
   [metabase.users.schema :as users.schema]
   [metabase.users.settings :as users.settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn check-self-or-superuser
  "Check that `user-id` is *current-user-id*` or that `*current-user*` is a superuser, or throw a 403."
  [user-id]
  {:pre [(integer? user-id)]}
  (api/check-403
   (or
    (= user-id api/*current-user-id*)
    api/*is-superuser?*)))

(defn check-not-internal-user
  "Check that `user-id` is not the id of the Internal User."
  [user-id]
  {:pre [(integer? user-id)]}
  (api/check (not= user-id config/internal-mb-user-id)
             [400 (tru "Not able to modify the internal user")]))

(defn- fetch-user [& query-criteria]
  (apply t2/select-one (vec (cons :model/User user/admin-or-self-visible-columns)) query-criteria))

(defn- maybe-set-user-permissions-groups! [user-or-id new-groups-or-ids]
  (when (and new-groups-or-ids
             (not (= (user/group-ids user-or-id)
                     (set (map u/the-id new-groups-or-ids)))))
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

(mu/defn- maybe-set-user-group-memberships!
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

(defn- updated-user-name [user-before-update changes]
  (let [[previous current] (map #(select-keys % [:first_name :last_name]) [user-before-update changes])
        updated-names (merge previous current)]
    (when (not= previous updated-names)
      updated-names)))

(defn- maybe-update-user-personal-collection-name! [user-before-update changes]
  ;; If the user name is updated, we shall also update the personal collection name (if such collection exists).
  (when-some [{:keys [first_name last_name]} (updated-user-name user-before-update changes)]
    (when-some [collection (collection/user->existing-personal-collection (u/the-id user-before-update))]
      (let [{email :email} user-before-update
            new-collection-name (collection/format-personal-collection-name first_name last_name email :site)]
        (when-not (= new-collection-name (:name collection))
          (t2/update! :model/Collection (:id collection) {:name new-collection-name}))))))

;;; ------------ Serialize User Attribute Provenance ------------------

(def ^:private SimpleAttributes
  "Basic attributes for users and tenants are a map of string keys to string values."
  [:map-of :string :string])

(def ^:private SystemAttributes
  "Attributes generated from system properties must be prefixed with @."
  [:map-of [:re #"@.*"] :string])

(def ^:private AttributeStatus
  "Describes a possible value of an attribute and where it is sourced from."
  [:map
   [:source [:enum :user :jwt :system :tenant]]
   [:frozen boolean?]
   [:value :string]])

(def ^:private CombinedAttributes
  "Map of user attributes to their current value and metadata describing where they are sourced from."
  [:map-of :string
   [:merge AttributeStatus
    [:map
     [:original {:optional true}
      AttributeStatus]]]])

(def ^:private attribute-merge-order
  "What order to merge attributes in when used with combine"
  [:jwt :tenant :user])

(mu/defn- combine :- CombinedAttributes
  "Combines user, tenant, and system attributes. User can override "
  [attributes :- [:map-of :keyword [:maybe SimpleAttributes]]
   system :- [:maybe SystemAttributes]]
  (letfn [(value-map [s f vs] (into {}
                                    (for [[k v] vs]
                                      [k {:source s :frozen f :value v}])))
          (shadow [original new] (if original (assoc new :original original) new))
          (error [original new] (if original
                                  (throw (ex-info "Cannot clobber"
                                                  {:bad-attribute original
                                                   :attribute new}))
                                  new))]
    (merge-with error
                (apply merge-with shadow
                       (map #(value-map % false (get attributes %))
                            attribute-merge-order))
                (value-map :system true system))))

(defn- add-structured-attributes
  [{:keys [login_attributes jwt_attributes] :as user}]
  (let [tenant (tenants/user->tenant user)]
    (assoc user :structured_attributes
           (combine {:jwt jwt_attributes
                     :user login_attributes
                     :tenant (:attributes tenant)}
                    (when-let [slug (:slug tenant)]
                      {"@tenant.slug" slug})))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                   Fetching Users -- GET /api/user, GET /api/user/current, GET /api/user/:id                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- user-visible-columns
  "Columns of user table visible to current caller of API."
  []
  (cond
    api/*is-superuser?*
    user/admin-or-self-visible-columns

    api/*is-group-manager?*
    user/group-manager-visible-columns

    :else
    user/non-admin-or-self-visible-columns))

(defn filter-clauses-without-paging
  "Given a where clause, return a clause that can be used to count."
  [clauses]
  (dissoc clauses :order-by :limit :offset))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch a list of `Users` for admins or group managers.
  By default returns only active users for admins and only active users within groups that the group manager is
  managing for group managers.

   - If `status` is `deactivated`, include deactivated users only.

   - If `status` is `all`, include all users (active and inactive).

   - Also supports `include_deactivated`, which if true, is equivalent to `status=all`; If is false, is equivalent to
     `status=active`. `status` and `include_deactivated` requires superuser permissions.

   - `include_deactivated` is a legacy alias for `status` and will be removed in a future release, users are advised
     to use `status` for better support and flexibility.

   If both params are passed, `status` takes precedence.
  - if a `tenant_id` is passed, only users with that tenant_id will be returned.

  For users with segmented permissions, return only themselves.

  Takes `limit`, `offset` for pagination.

  Takes `query` for filtering on first name, last name, email.

  Also takes `group_id`, which filters on group id."
  [_route-params
   {:keys [status query group_id include_deactivated tenant_id tenancy] :as params}
   :- [:map
       [:status              {:optional true} [:maybe :string]]
       [:query               {:optional true} [:maybe :string]]
       [:group_id            {:optional true} [:maybe ms/PositiveInt]]
       [:include_deactivated {:default false} [:maybe ms/BooleanValue]]
       [:tenancy             {:optional true} [:maybe
                                               [:enum :all :internal :external]]]
       [:tenant_id           {:optional true} [:maybe ms/PositiveInt]]]]
  (or api/*is-superuser?*
      (if group_id
        (perms/check-manager-of-group group_id)
        (perms/check-group-manager)))
  (api/check-400 (not (every? #(contains? params %) [:tenant_id :tenancy]))
                 (tru "You cannot specify both `tenancy` and `tenant_id`"))
  (let [include_deactivated include_deactivated
        group-id-clause     (when group_id [group_id])
        clauses             (let [clauses (user/filter-clauses status query group-id-clause include_deactivated
                                                               {:limit  (request/limit)
                                                                :offset (request/offset)})]
                              (cond
                                (not api/*is-superuser?*)     (sql.helpers/where clauses [:= :tenant_id (:tenant_id @api/*current-user*)])
                                (contains? params :tenant_id) (sql.helpers/where clauses [:= :tenant_id tenant_id])
                                (= tenancy :all)              clauses
                                (= tenancy :external)         (sql.helpers/where clauses [:not= :tenant_id nil])
                                :else                         (sql.helpers/where clauses [:= :tenant_id nil])))]
    {:data (cond-> (t2/select
                    (vec (cons :model/User (user-visible-columns)))
                    (sql.helpers/order-by clauses
                                          [:%lower.first_name :asc]
                                          [:%lower.last_name :asc]
                                          [:id :asc]))
             ;; For admins also include the IDs of Users' Personal Collections
             api/*is-superuser?*
             (t2/hydrate :personal_collection_id :tenant_collection_id)

             (or api/*is-superuser?*
                 api/*is-group-manager?*)
             (t2/hydrate :group_ids)
             ;; if there is a group_id clause, make sure the list is deduped in case the same user is in multiple groups
             group_id
             distinct)
     :total  (-> (t2/query
                  (merge {:select [[[:count [:distinct :core_user.id]] :count]]
                          :from   :core_user}
                         (filter-clauses-without-paging clauses)))
                 first
                 :count)
     :limit  (request/limit)
     :offset (request/offset)}))

(defn- same-groups-user-ids
  "Return a list of all user-ids in the same group with the user with id `user-id`.
  Ignore the All-user groups."
  [user-id]
  (map :user_id
       (t2/query {:select-distinct [:permissions_group_membership.user_id]
                  :from [:permissions_group_membership]
                  :where [:in :permissions_group_membership.group_id
                          ;; get all the groups ids that the current user is in
                          {:select-distinct [:permissions_group_membership.group_id]
                           :from  [:permissions_group_membership]
                           :where [:and [:= :permissions_group_membership.user_id user-id]
                                   [:not= :permissions_group_membership.group_id (:id (perms/all-users-group))]]}]})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/recipients"
  "Fetch a list of `Users`. Returns only active users. Meant for non-admins unlike GET /api/user.

   - If user-visibility is :all or the user is an admin, include all users.
   - If user-visibility is :group, include only users in the same group (excluding the all users group).
   - If user-visibility is :none or the user is sandboxed, include only themselves."
  []
  ;; defining these functions so the branching logic below can be as clear as possible
  (letfn [(all [] (let [clauses (cond-> (user/filter-clauses nil nil nil nil)
                                  (not api/*is-superuser?*) (sql.helpers/where
                                                             [:= :tenant_id (:tenant_id @api/*current-user*)])
                                  true                      (sql.helpers/order-by [:%lower.last_name :asc] [:%lower.first_name :asc]))]
                    {:data   (t2/select (vec (cons :model/User (user-visible-columns))) clauses)
                     :total  (t2/count :model/User (filter-clauses-without-paging clauses))
                     :limit  (request/limit)
                     :offset (request/offset)}))
          (within-group [] (let [user-ids (same-groups-user-ids api/*current-user-id*)
                                 clauses  (cond-> (user/filter-clauses nil nil nil nil)
                                            (not api/*is-superuser?*) (sql.helpers/where [:= :tenant_id (:tenant_id @api/*current-user*)])
                                            (seq user-ids) (sql.helpers/where [:in :core_user.id user-ids])
                                            true           (sql.helpers/order-by [:%lower.last_name :asc] [:%lower.first_name :asc]))]
                             {:data   (t2/select (vec (cons :model/User (user-visible-columns))) clauses)
                              :total  (t2/count :model/User (filter-clauses-without-paging clauses))
                              :limit  (request/limit)
                              :offset (request/offset)}))
          (just-me [] {:data   [(fetch-user :id api/*current-user-id*)]
                       :total  1
                       :limit  (request/limit)
                       :offset (request/offset)})]
    (cond
      ;; if they're sandboxed OR if they're a superuser, ignore the setting and just give them nothing or everything,
      ;; respectively.
      (perms/sandboxed-user?)
      (just-me)

      api/*is-superuser?*
      (all)

      ;; otherwise give them what the setting says on the tin
      :else
      (case (users.settings/user-visibility)
        :none (just-me)
        :group (within-group)
        :all (all)))))

(defn- add-query-permissions
  "Add `:can_create_queries` and `:can_create_native_queries` flags to user based on their create-queries
  permissions across non-sample databases."
  [user]
  (let [db-ids              (t2/select-pks-set :model/Database)
        _                   (perms/prime-db-cache db-ids)
        create-query-perms  (into #{}
                                  (map (fn [db-id]
                                         (perms/most-permissive-database-permission-for-user
                                          api/*current-user-id* :perms/create-queries db-id)))
                                  db-ids)
        can-create-queries? (or (some #(perms/at-least-as-permissive?
                                        :perms/create-queries % :query-builder)
                                      create-query-perms)
                                (perms/user-has-any-published-table-permission?))
        can-create-native?  (contains? create-query-perms :query-builder-and-native)]
    (update user :permissions assoc
            :can_create_queries        (boolean can-create-queries?)
            :can_create_native_queries can-create-native?)))

(defn- maybe-add-advanced-permissions
  "If `advanced-permissions` is enabled, add to `user` a permissions map."
  [user]
  (if-let [with-advanced-permissions
           (and (premium-features/enable-advanced-permissions?)
                config/ee-available?
                (requiring-resolve 'metabase-enterprise.advanced-permissions.common/with-advanced-permissions))]
    (with-advanced-permissions user)
    user))

(defn- maybe-add-sso-source
  "Adds `sso_source` key to the `User`, so FE could determine if the user is logged in via SSO."
  [{:keys [id] :as user}]
  (if (premium-features/enable-any-sso?)
    (assoc user :sso_source (t2/select-one-fn :sso_source :model/User :id id))
    user))

(defn- add-has-question-and-dashboard
  "True when the user has permissions for at least one un-archived question and one un-archived dashboard, excluding
  internal/automatically-loaded content."
  [user]
  (let [collection-filter (collection/visible-collection-filter-clause)
        entity-exists? (fn [model & additional-clauses] (t2/exists? model
                                                                    {:where (into [:and
                                                                                   [:= :archived false]
                                                                                   collection-filter
                                                                                   (mi/exclude-internal-content-hsql model)]
                                                                                  additional-clauses)}))]
    (-> user
        (assoc :has_question_and_dashboard
               (and (entity-exists? :model/Card)
                    (entity-exists? :model/Dashboard)))
        (assoc :has_model (entity-exists? :model/Card [:= :type "model"])))))

(defn- add-first-login
  "Adds `first_login` key to the `User` with the oldest timestamp from that user's login history. Otherwise give the current time, as it's the user's first login."
  [{:keys [id] :as user}]
  (let [ts (or
            (:timestamp (t2/select-one [:model/LoginHistory :timestamp] :user_id id
                                       {:order-by [[:timestamp :asc]]}))
            (t/offset-date-time))]
    (assoc user :first_login ts)))

(defn add-custom-homepage-info
  "Adds custom homepage dashboard information to the current user."
  [user]
  (let [enabled? (appearance/custom-homepage)
        id       (appearance/custom-homepage-dashboard)
        dash     (t2/select-one :model/Dashboard :id id)
        valid?   (and enabled? id (some? dash) (not (:archived dash)) (mi/can-read? dash))]
    (assoc user
           :custom_homepage (when valid? {:dashboard_id id}))))

(defn- add-can-write-any-collection
  "Adds a key to the user reflecting whether they have permission to write *any* collection in the instance so that the
  FE can appropriately hide/show elements (e.g., we shouldn't try to let them save a new question if they don't have
  anywhere to save *to*)"
  [user]
  (assoc user :can_write_any_collection
         (or (:is_superuser user)
             (t2/exists? :model/Collection {:where (collection/visible-collection-filter-clause
                                                    :id
                                                    {:include-trash-collection? false
                                                     :include-archived-items :exclude
                                                     :permission-level :write})}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/current"
  "Fetch the current `User`."
  []
  (-> (api/check-404 @api/*current-user*)
      (t2/hydrate :personal_collection_id :group_ids :is_installer :has_invited_second_user :tenant_collection_id)
      add-has-question-and-dashboard
      add-first-login
      add-query-permissions
      maybe-add-advanced-permissions
      maybe-add-sso-source
      add-custom-homepage-info
      add-can-write-any-collection))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Fetch a `User`. You must be fetching yourself *or* be a superuser *or* a Group Manager."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (try
    (check-self-or-superuser id)
    (catch clojure.lang.ExceptionInfo _e
      (perms/check-group-manager)))
  (-> (api/check-404 (fetch-user :id id))
      (t2/hydrate :user_group_memberships)
      add-structured-attributes))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Creating a new User -- POST /api/user                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn invite-user
  "Implementation for `POST /`, invites a user to Metabase."
  [{:keys [email user_group_memberships source] :as body}]
  (api/check-superuser)
  (api/checkp (not (t2/exists? :model/User :%lower.email (u/lower-case-en email)))
              "email" (tru "Email address already in use."))
  (api/checkp (not (and (:tenant_id body)
                        (not (setting/get :use-tenants))))
              "tenant_id"
              (tru "Cannot create a Tenant User as Tenants are not enabled for this instance."))
  (t2/with-transaction [_conn]
    (let [new-user-id (u/the-id
                       (notification/with-skip-sending-notification (boolean (:tenant_id body))
                         (user/create-and-invite-user!
                          (u/select-keys-when body
                                              :non-nil [:first_name :last_name :email :password :login_attributes :tenant_id])
                          @api/*current-user*
                          (= source "setup"))))]
      (maybe-set-user-group-memberships! new-user-id user_group_memberships)
      (when (= source "setup")
        (maybe-set-user-permissions-groups! new-user-id [(perms/all-users-group) (perms/admin-group)]))
      (analytics/track-event! :snowplow/invite
                              {:event           :invite-sent
                               :invited-user-id new-user-id
                               :source          (or source "admin")})
      (-> (fetch-user :id new-user-id)
          (t2/hydrate :user_group_memberships)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new `User`, return a 400 if the email address is already taken"
  [_route-params
   _query-params
   body :- [:map
            [:first_name             {:optional true} [:maybe ms/NonBlankString]]
            [:last_name              {:optional true} [:maybe ms/NonBlankString]]
            [:email                  ms/Email]
            [:user_group_memberships {:optional true} [:maybe [:sequential ::user-group-membership]]]
            [:login_attributes       {:optional true} [:maybe users.schema/LoginAttributes]]
            [:source                 {:optional true, :default "admin"} [:maybe ms/NonBlankString]]
            [:tenant_id              {:optional true} [:maybe ms/PositiveInt]]]]
  (invite-user body))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Updating a User -- PUT /api/user/:id                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- valid-email-update?
  "This predicate tests whether or not the user is allowed to update the email address associated with this account."
  [{:keys [sso_source email]} maybe-new-email]
  (or
   ;; Admin users can update
   api/*is-superuser?*
   ;; If the email address didn't change, let it through
   (= email maybe-new-email)
   ;; We should not allow a regular user to change their email address if they are a google/ldap user
   (and
    (not (= :google sso_source))
    (not (= :ldap sso_source)))))

(defn- valid-name-update?
  "This predicate tests whether or not the user is allowed to update the first/last name associated with this account.
  If the user is an SSO user, no name edits are allowed, but we accept if the new names are equal to the existing names."
  [{:keys [sso_source] :as user} name-key new-name]
  (or
   (= (get user name-key) new-name)
   (not sso_source)))

(defn- reset-magic-group-membership!
  [user-id tenant-id]
  (perms/allow-changing-all-users-group-members
    (perms/allow-changing-all-external-users-group-members
     (t2/delete! :model/PermissionsGroupMembership :user_id user-id)
     (when tenant-id
       (perms/add-user-to-group! user-id (perms/all-external-users-group)))
     (when (nil? tenant-id)
       (perms/add-user-to-group! user-id (perms/all-users-group))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update an existing, active `User`.
  Self or superusers can update user info and groups.
  Group Managers can only add/remove users from groups they are manager of."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [email first_name last_name user_group_memberships is_superuser] :as body}
   :- [:map
       [:email                  {:optional true} [:maybe ms/Email]]
       [:first_name             {:optional true} [:maybe ms/NonBlankString]]
       [:last_name              {:optional true} [:maybe ms/NonBlankString]]
       [:user_group_memberships {:optional true} [:maybe [:sequential ::user-group-membership]]]
       [:is_superuser           {:optional true} [:maybe :boolean]]
       [:is_group_manager       {:optional true} [:maybe :boolean]]
       [:login_attributes       {:optional true} [:maybe users.schema/LoginAttributes]]
       [:locale                 {:optional true} [:maybe ms/ValidLocale]]
       [:tenant_id              {:optional true} [:maybe ms/PositiveInt]]]]
  (try
    (check-self-or-superuser id)
    (catch clojure.lang.ExceptionInfo _e
      (perms/check-group-manager)))
  (check-not-internal-user id)
  ;; only allow updates if the specified account is active
  (api/let-404 [user-before-update (fetch-user :id id, :is_active true)]
    ;; Google/LDAP non-admin users can't change their email to prevent account hijacking
    (when (contains? body :email)
      (api/check-403 (valid-email-update? user-before-update email)))
    ;; SSO users (JWT, SAML, LDAP, Google) can't change their first/last names
    (when (contains? body :first_name)
      (api/checkp (valid-name-update? user-before-update :first_name first_name)
                  "first_name" (tru "Editing first name is not allowed for SSO users.")))
    (when (contains? body :last_name)
      (api/checkp (valid-name-update? user-before-update :last_name last_name)
                  "last_name" (tru "Editing last name is not allowed for SSO users.")))
    ;; can't change email if it's already taken BY ANOTHER ACCOUNT
    (when email
      (api/checkp (not (t2/exists? :model/User, :%lower.email (u/lower-case-en email), :id [:not= id]))
                  "email" (tru "Email address already associated to another user.")))
    (t2/with-transaction [_conn]
      ;; only superuser or self can update user info
      ;; implicitly prevent group manager from updating users' info
      (when (or (= id api/*current-user-id*)
                api/*is-superuser?*)
        (when-let [changes (not-empty
                            (u/select-keys-when body
                                                :present (cond-> #{:first_name :last_name :locale}
                                                           api/*is-superuser?* (conj :login_attributes :tenant_id))
                                                :non-nil (cond-> #{:email}
                                                           api/*is-superuser?* (conj :is_superuser))))]
          (t2/update! :model/User id changes)
          (when (contains? changes :tenant_id)
            (api/check-400 (not (and (:tenant_id changes) (:is_superuser changes)))
                           "Superusers cannot be tenant users")
            (reset-magic-group-membership! id (:tenant_id changes)))
          (events/publish-event! :event/user-update {:object (t2/select-one :model/User :id id)
                                                     :previous-object user-before-update
                                                     :user-id api/*current-user-id*}))
        (maybe-update-user-personal-collection-name! user-before-update body))
      (maybe-set-user-group-memberships! id user_group_memberships is_superuser)))
  (-> (fetch-user :id id)
      (t2/hydrate :user_group_memberships)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              Reactivating a User -- PUT /api/user/:id/reactivate                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- reactivate-user! [existing-user]
  (t2/update! :model/User (u/the-id existing-user)
              {:is_active     true
               :is_superuser  false
               ;; if the user originally logged in via Google Auth/LDAP and it's no longer enabled, convert them into a regular user
               ;; (see metabase#3323)
               :sso_source   (case (:sso_source existing-user)
                               :google (when (sso/google-auth-enabled) :google)
                               :ldap   (when (sso/ldap-enabled) :ldap)
                               (:sso_source existing-user))})
  ;; now return the existing user whether they were originally active or not
  (fetch-user :id (u/the-id existing-user)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id/reactivate"
  "Reactivate user at `:id`"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  (check-not-internal-user id)
  (let [user (t2/select-one [:model/User :id :email :first_name :last_name :is_active :sso_source :tenant_id]
                            :type :personal
                            :id id)]
    (api/check-404 user)
    ;; Can only reactivate inactive users
    (api/check (not (:is_active user))
               [400 {:message (tru "Not able to reactivate an active user")}])
    (api/check (tenants/tenant-is-active? (:tenant_id user))
               [400 {:message (tru "Not able to reactivate a user in a deactivated tenant")}])
    (events/publish-event! :event/user-reactivated {:object user :user-id api/*current-user-id*})
    (reactivate-user! (dissoc user [:email :first_name :last_name]))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                               Updating a Password -- PUT /api/user/:id/password                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id/password"
  "Update a user's password."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [password old_password]} :- [:map
                                       [:password ms/ValidPassword]]
   request]
  (check-self-or-superuser id)
  (api/let-404 [user (t2/select-one [:model/User :id :last_login :password_salt :password],
                                    :id id,
                                    :type :personal,
                                    :is_active true)]
    ;; admins are allowed to reset anyone's password (in the admin people list) so no need to check the value of
    ;; `old_password` for them regular users have to know their password, however
    (when-not api/*is-superuser?*
      (api/checkp (u.password/bcrypt-verify (str (:password_salt user) old_password) (:password user))
                  "old_password"
                  (tru "Invalid password")))
    (t2/update! :model/AuthIdentity :provider "password" :user_id id {:credentials {:plaintext_password password}})
    ;; after a successful password update go ahead and offer the client a new session that they can use
    (when (= id api/*current-user-id*)
      (let [{session-key :key, :as session} (auth-identity/create-session-with-auth-tracking! user (request/device-info request) :provider/password)
            response                        {:success    true
                                             :session_id (str session-key)}]
        (request/set-session-cookies request response session (t/zoned-date-time (t/zone-id "GMT")))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                             Deleting (Deactivating) a User -- DELETE /api/user/:id                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Disable a `User`.  This does not remove the `User` from the DB, but instead disables their account."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  ;; don't technically need to because the internal user is already 'deleted' (deactivated), but keeps the warnings consistent
  (check-not-internal-user id)
  (api/check-404 (t2/exists? :model/User :id id))
  (t2/update! :model/User id {:type :personal} {:is_active false})
  (events/publish-event! :event/user-deactivated {:object (t2/select-one :model/User :id id) :user-id api/*current-user-id*})
  {:success true})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Other Endpoints                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - This could be handled by PUT /api/user/:id, we don't need a separate endpoint
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id/modal/:modal"
  "Indicate that a user has been informed about the vast intricacies of 'the' Query Builder."
  [{:keys [id modal]} :- [:map
                          [:id ms/PositiveInt]
                          [:modal [:enum "qbnewb" "datasetnewb"]]]]
  (check-self-or-superuser id)
  (check-not-internal-user id)
  (let [k (or (get {"qbnewb"      :is_qbnewb
                    "datasetnewb" :is_datasetnewb}
                   modal)
              (throw (ex-info (tru "Unrecognized modal: {0}" modal)
                              {:modal modal
                               :allowable-modals #{"qbnewb" "datasetnewb"}})))]
    (api/check-500 (pos? (t2/update! :model/User id {:type :personal} {k false}))))
  {:success true})
