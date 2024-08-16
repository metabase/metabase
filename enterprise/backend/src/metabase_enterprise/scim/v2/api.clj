(ns metabase-enterprise.scim.v2.api
  "/api/ee/scim/v2/ endpoints. These are the endpoints which implement the SCIM protocol, as opposed to SCIM
  configuration endpoints which are in `metabase-enterprise.scim.api`.

  `v2` in the API path represents the fact that we implement SCIM 2.0."
  (:require
   [compojure.core :refer [GET POST]]
   [metabase-enterprise.scim.api :as scim]
   [metabase.api.common :as api :refer [defendpoint]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.user :as user]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private user-schema-uri "urn:ietf:params:scim:schemas:core:2.0:User")
(def ^:private group-schema-uri "urn:ietf:params:scim:schemas:core:2.0:Group")
(def ^:private list-schema-uri "urn:ietf:params:scim:api:messages:2.0:ListResponse")
(def ^:private error-schema-uri "urn:ietf:params:scim:api:messages:2.0:Error")

(def ^:private default-pagination-limit 100)
(def ^:private default-pagination-offset 0)

(def SCIMUser
  "Malli schema for a SCIM user. This represents both users returned by the service provider (Metabase)
  as well as users sent by the client (i.e. Okta), with fields marked as optional if they may not be present
  in the latter."
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:id {:optional true} ms/NonBlankString]
   [:userName ms/NonBlankString]
   [:name [:map
           [:givenName string?]
           [:familyName string?]]]
   [:emails [:sequential
             [:map
              [:value ms/NonBlankString]
              [:type {:optional true} ms/NonBlankString]
              [:primary {:optional true} boolean?]]]]
   [:groups
    {:optional true}
    [:sequential [:map
                  [:value ms/NonBlankString]
                  [:$ref {:optional true} ms/NonBlankString]
                  [:display ms/NonBlankString]]]]
   [:locale {:optional true} [:maybe ms/NonBlankString]]
   [:active {:optional true} boolean?]])

(def SCIMUserList
  "Malli schema for a list of SCIM users"
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:totalResults ms/IntGreaterThanOrEqualToZero]
   [:startIndex ms/IntGreaterThanOrEqualToZero]
   [:itemsPerPage ms/IntGreaterThanOrEqualToZero]
   [:Resources [:sequential SCIMUser]]])

(def UserPatch
  "Malli schema for a user patch operation"
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:Operations
    [:sequential [:map
                  [:op ms/NonBlankString]
                  [:value [:or ms/NonBlankString ms/BooleanValue]]]]]])

(def SCIMGroup
  "Malli schema for a SCIM group."
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:id {:optional true} ms/NonBlankString]
   [:displayName ms/NonBlankString]
   [:members
    {:optional true}
    [:sequential [:map
                  [:value ms/NonBlankString]
                  [:$ref {:optional true} ms/NonBlankString]]]]])

(def SCIMGroupList
  "Malli schema for a list of SCIM groups"
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:totalResults ms/IntGreaterThanOrEqualToZero]
   [:startIndex ms/IntGreaterThanOrEqualToZero]
   [:itemsPerPage ms/IntGreaterThanOrEqualToZero]
   [:Resources [:sequential SCIMGroup]]])

(defn- throw-scim-error
  [status message]
  (throw (ex-info message
                  {:schemas     [error-schema-uri]
                   :detail      message
                   :status      status
                   :status-code status})))

(defn- scim-response
  "Wraps an object in a response with the correct SCIM content-type. Status defaults to 200 unless otherwise specified."
  [object & [status]]
  {:status  (or status 200)
   :body    object
   :headers {"Content-Type" "application/scim+json"}})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               User operations                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private user-cols
  "Required columns when fetching users for SCIM."
  [:id :first_name :last_name :email :locale :is_active :entity_id])

(mi/define-batched-hydration-method add-scim-user-group-memberships
  :scim_user_group_memberships
  "Add to each `user` a list of :user_group_memberships where each item is a map with 2 keys [:name :entity_id]."
  [users]
  (when (seq users)
    (let [user-id->memberships (group-by :user_id (t2/select [:model/PermissionsGroupMembership :pgm.user_id :pg.name :pg.entity_id]
                                                             {:from [[:permissions_group_membership :pgm]]
                                                              :join [[:permissions_group :pg] [:= :pg.id :group_id]]
                                                              :where [:and
                                                                      [:in :user_id (map u/the-id users)]
                                                                      [:not= :pg.id (:id (perms-group/all-users))]
                                                                      [:not= :pg.id (:id (perms-group/admin))]]}))
          membership->group    (fn [membership] (select-keys membership [:name :entity_id]))]
      (for [user users]
        (assoc user :user_group_memberships (->> (user-id->memberships (u/the-id user))
                                                 (map membership->group)
                                                 (sort-by :entity_id)))))))

(mu/defn ^:private mb-user->scim :- SCIMUser
  "Given a Metabase user, returns a SCIM user."
  [user]
  {:schemas  [user-schema-uri]
   :id       (:entity_id user)
   :userName (:email user)
   :name     {:givenName  (:first_name user)
              :familyName (:last_name user)}
   :emails   [{:value (:email user)
               :type    "work"
               :primary true}]
   :groups   (map
              (fn [membership]
                {:value   (:entity_id membership)
                 :$ref    (str (scim/scim-base-url) "/Groups/" (:entity_id membership))
                 :display (:name membership)})
              (:user_group_memberships user))
   :locale   (:locale user)
   :active   (:is_active user)
   :meta     {:resourceType "User"}})

(mu/defn ^:private scim-user->mb :- user/NewUser
  "Given a SCIM user, returns a Metabase user."
  [user]
  (let [{email :userName name-obj :name locale :locale is-active? :active} user
        {:keys [givenName familyName]} name-obj]
    (merge
     {:first_name givenName
      :last_name  familyName
      :email      email
      :is_active  is-active?
      :type       :personal}
     (when (and locale (i18n/available-locale? locale))
       {:locale locale}))))

(mu/defn ^:private get-user-by-entity-id
  "Fetches a user by entity ID, or throws a 404"
  [entity-id]
  (or (t2/select-one (cons :model/User user-cols)
                     :entity_id entity-id
                     {:where [:= :type "personal"]})
      (throw-scim-error 404 "User not found")))

(defn- ^:private user-filter-clause
  [filter-parameter]
  (let [[_ match] (re-matches #"^userName eq \"(.*)\"$" filter-parameter)]
    (if match
      [:= :%lower.email (u/lower-case-en match)]
      (throw-scim-error 400 (format "Unsupported filter parameter: %s" filter-parameter)))))

(defendpoint GET "/Users"
  "Fetch a list of users."
  [:as {{start-index :startIndex c :count filter-param :filter} :params}]
  {start-index  [:maybe ms/PositiveInt]
   c            [:maybe ms/PositiveInt]
   filter-param [:maybe ms/NonBlankString]}
  (let [limit          (or c default-pagination-limit)
        ;; SCIM start-index is 1-indexed, so we need to decrement it here
        offset         (if start-index (dec start-index) default-pagination-offset)
        filter-param   (when filter-param (codec/url-decode filter-param))
        where-clause   [:and [:= :type "personal"]
                             (when filter-param (user-filter-clause filter-param))]
        users          (t2/select (cons :model/User user-cols)
                                  {:where    where-clause
                                   :limit    limit
                                   :offset   offset
                                   :order-by [[:id :asc]]})
        hydrated-users (t2/hydrate users :scim_user_group_memberships)
        results-count  (count hydrated-users)
        items-per-page (if (< results-count limit) results-count limit)
        result         {:schemas      [list-schema-uri]
                        :totalResults (t2/count :model/User {:where where-clause})
                        :startIndex   (inc offset)
                        :itemsPerPage items-per-page
                        :Resources    (map mb-user->scim hydrated-users)}]
    (scim-response result)))

(defendpoint GET "/Users/:id"
  "Fetch a single user."
  [id]
  {id ms/NonBlankString}
  (-> (get-user-by-entity-id id)
      (t2/hydrate :scim_user_group_memberships)
      mb-user->scim))

(defendpoint POST "/Users"
  "Create a single user."
  [:as {scim-user :body}]
  {scim-user SCIMUser}
  (let [mb-user (scim-user->mb scim-user)
        email   (:email mb-user)]
    (when (t2/exists? :model/User :%lower.email (u/lower-case-en email))
      (throw-scim-error 409 "Email address is already in use"))
    (let [new-user (t2/with-transaction [_]
                     (user/insert-new-user! mb-user)
                     (-> (t2/select-one (cons :model/User user-cols)
                                        :email (u/lower-case-en email))
                         mb-user->scim))]
      (scim-response new-user 201))))

(defendpoint PUT "/Users/:id"
  "Update a user."
  [:as {scim-user :body {id :id} :params}]
  {scim-user SCIMUser}
  (let [updates      (scim-user->mb scim-user)
        email        (-> scim-user :emails first :value)
        current-user (get-user-by-entity-id id)]
    (if (not= email (:email current-user))
      (throw-scim-error 400 "You may not update the email of an existing user.")
      (try
       (t2/with-transaction [_conn]
         (t2/update! :model/User (u/the-id current-user) updates)
         (let [user (-> (t2/select-one (cons :model/User user-cols)
                                       :entity_id id)
                        mb-user->scim)]
          (scim-response user)))
       (catch Exception e
         (let [message (format "Error updating user: %s" (ex-message e))]
           (throw (ex-info message
                           {:schemas     [error-schema-uri]
                            :detail      message
                            :status      400
                            :status-code 400}))))))))

(defendpoint PATCH "/Users/:id"
  "Activate or deactivate a user. Supports specific replace operations, but not arbitrary patches."
  [:as {patch-ops :body {id :id} :params}]
  {patch-ops UserPatch}
  {id ms/NonBlankString}
  (t2/with-transaction [_conn]
    (let [user    (get-user-by-entity-id id)
          updates (reduce
                    (fn [acc operation]
                      (let [{:keys [op path value]} operation]
                        (if (= (u/lower-case-en op) "replace")
                          (case path
                            "active"          (assoc acc :is_active (Boolean/valueOf (u/lower-case-en value)))
                            "userName"        (assoc acc :email value)
                            "name.givenName"  (assoc acc :first_name value)
                            "name.familyName" (assoc acc :last_name value)
                            (throw-scim-error 400 (format "Unsupported path: %s" path)))
                          acc)))
                    {}
                    (:Operations patch-ops))]
      (t2/update! :model/User (u/the-id user) updates)
      (-> (get-user-by-entity-id id)
          mb-user->scim
          scim-response))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Group operations                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private group-cols
  "Required columns when fetching groups for SCIM."
  [:name :id :entity_id])

(mi/define-batched-hydration-method add-scim-group-members
  :scim_group_members
  "Add to each `group` a list of :members where each item is a map with 2 keys [:email :entity_id]."
  [groups]
  (when (seq groups)
    (let [group-id->members (group-by :group_id (t2/select [:model/PermissionsGroupMembership :pgm.group_id :u.email :u.entity_id]
                                                           {:from [[:permissions_group_membership :pgm]]
                                                            :join [[:core_user :u] [:= :u.id :pgm.user_id]]
                                                            :where [:in :pgm.group_id (map u/the-id groups)]}))
          group->member     (fn [member] (select-keys member [:email :entity_id]))]
      (for [group groups]
        (assoc group :members (->> (group-id->members (u/the-id group))
                                   (map group->member)
                                   (sort-by :entity_id)))))))

(mu/defn ^:private get-group-by-entity-id
  "Fetches a group by entity ID, or throws a 404. Cannot fetch the Administrators or All Users groups, as these are
  static and cannot be managed via SCIM."
  [entity-id]
  (or (t2/select-one (cons :model/PermissionsGroup group-cols)
                     :entity_id entity-id
                     {:where
                      [:and
                       [:not= :id (:id (perms-group/all-users))]
                       [:not= :id (:id (perms-group/admin))]]})
      (throw-scim-error 404 "Group not found")))

(mu/defn ^:private mb-group->scim :- SCIMGroup
  "Given a Metabase permissions group, returns a SCIM group."
  [group]
  {:schemas     [group-schema-uri]
   :id          (:entity_id group)
   :members     (map
                 (fn [member]
                   {:value   (:entity_id member)
                    :$ref    (str (scim/scim-base-url) "/Users/" (:entity_id member))
                    :display (:email member)})
                 (:members group))
   :displayName (:name group)
   :meta        {:resourceType "Group"}})

(defn- group-filter-clause
  [filter-parameter]
  (let [[_ match] (re-matches #"^displayName eq \"(.*)\"$" filter-parameter)]
    (if match
      [:= :name match]
      (throw (ex-info "Unsupported filter parameter" {:filter      filter-parameter
                                                      :status-code 400})))))

(defendpoint GET "/Groups"
  "Fetch a list of groups."
  [:as {{start-index :startIndex c :count filter-param :filter} :params}]
  {start-index  [:maybe ms/PositiveInt]
   c            [:maybe ms/PositiveInt]
   filter-param [:maybe ms/NonBlankString]}
  (let [limit          (or c default-pagination-limit)
        ;; SCIM start-index is 1-indexed, so we need to decrement it here
        offset         (if start-index (dec start-index) default-pagination-offset)
        filter-param   (when filter-param (codec/url-decode filter-param))
        where-clause   [:and
                        [:not= :id (:id perms-group/all-users)]
                        [:not= :id (:id perms-group/admin)]
                        (when filter-param (group-filter-clause filter-param))]
        groups         (t2/select (cons :model/PermissionsGroup group-cols)
                                  {:where    where-clause
                                   :limit    limit
                                   :offset   offset
                                   :order-by [[:id :asc]]})
        results-count  (count groups)
        items-per-page (if (< results-count limit) results-count limit)
        result         {:schemas      [list-schema-uri]
                        :totalResults (t2/count :model/PermissionsGroup {:where where-clause})
                        :startIndex   (inc offset)
                        :itemsPerPage items-per-page
                        :Resources    (map mb-group->scim groups)}]
    (scim-response result)))

(defendpoint GET "/Groups/:id"
  "Fetch a single group."
  [id]
  {id ms/NonBlankString}
  (-> (get-group-by-entity-id id)
      (t2/hydrate :scim_group_members)
      mb-group->scim))

(defn- update-group-membership
  "Updates the membership of `group-id` to be the set of users in the collection `user-entity-ids`. Clears
  any existing members."
  [group-id user-entity-ids]
  (let [user-ids (t2/select-fn-set :id :model/User {:where [:in :entity_id user-entity-ids]})]
    (when-let [memberships (map
                            (fn [user-id] {:group_id group-id :user_id user-id})
                            user-ids)]
      (t2/delete! :model/PermissionsGroupMembership :group_id group-id)
      (t2/insert! :model/PermissionsGroupMembership memberships))))

(defendpoint POST "/Groups"
  "Create a single group, and populates it if necessary."
  [:as {scim-group :body}]
  {scim-group SCIMGroup}
  (let [group-name (:displayName scim-group)
        entity-ids (map :value (:members scim-group))]
    (when (t2/exists? :model/PermissionsGroup :%lower.name (u/lower-case-en group-name))
      (throw-scim-error 409 "A group with that name already exists"))
    (t2/with-transaction [_conn]
      (let [new-group (first (t2/insert-returning-instances! :model/PermissionsGroup {:name group-name}))]
        (when (seq entity-ids)
          (update-group-membership (:id new-group) entity-ids))
        (-> new-group
          (t2/hydrate :scim_group_members)
          mb-group->scim
          (scim-response 201))))))

(defendpoint PUT "/Groups/:id"
  "Update a group."
  [:as {scim-group :body {id :id} :params}]
  {scim-group SCIMGroup}
  (let [group-name (:displayName scim-group)
        entity-ids (map :value (:members scim-group))]
    (t2/with-transaction [_conn]
      (let [group (get-group-by-entity-id id)]
        (t2/update! :model/PermissionsGroup (u/the-id group) {:name group-name})
        (when (seq entity-ids)
         (update-group-membership (u/the-id group) entity-ids))
        (-> (get-group-by-entity-id id)
            (t2/hydrate :scim_group_members)
            mb-group->scim
            scim-response)))))

(api/define-routes)
