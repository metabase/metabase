(ns metabase.api.permissions
  "/api/permissions endpoints."
  (:require [clojure.spec.alpha :as s]
            [compojure.core :refer [DELETE GET POST PUT]]
            [honeysql.helpers :as hh]
            [metabase.api.common :as api]
            [metabase.api.common.validation :as validation]
            [metabase.api.permission-graph :as api.permission-graph]
            [metabase.models :refer [PermissionsGroupMembership User]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group :refer [PermissionsGroup]]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.server.middleware.offset-paging :as mw.offset-paging]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            schema.core
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          PERMISSIONS GRAPH ENDPOINTS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(api/defendpoint GET "/graph"
  "Fetch a graph of all Permissions."
  []
  (api/check-superuser)
  (perms/data-perms-graph))

(api/defendpoint PUT "/graph"
  "Do a batch update of Permissions by passing in a modified graph. This should return the same graph, in the same
  format, that you got from `GET /api/permissions/graph`, with any changes made in the wherever necessary. This
  modified graph must correspond to the `PermissionsGraph` schema. If successful, this endpoint returns the updated
  permissions graph; use this as a base for any further modifications.

  Revisions to the permissions graph are tracked. If you fetch the permissions graph and some other third-party
  modifies it before you can submit you revisions, the endpoint will instead make no changes and return a
  409 (Conflict) response. In this case, you should fetch the updated graph and make desired changes to that."
  [:as {body :body}]
  {body su/Map}
  (api/check-superuser)
  (let [graph (api.permission-graph/converted-json->graph ::api.permission-graph/data-permissions-graph body)]
    (when (= graph :clojure.spec.alpha/invalid)
      (throw (ex-info (tru "Cannot parse permissions graph because it is invalid: {0}"
                           (s/explain-str ::api.permission-graph/data-permissions-graph body))
                      {:status-code 400
                       :error       (s/explain-data ::api.permission-graph/data-permissions-graph body)})))
    (perms/update-data-perms-graph! graph))
  (perms/data-perms-graph))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          PERMISSIONS GROUP ENDPOINTS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- group-id->num-members
  "Return a map of `PermissionsGroup` ID -> number of members in the group. (This doesn't include entries for empty
  groups.)"
  []
  (let [results (db/query
                  {:select    [[:pgm.group_id :group_id] [:%count.pgm.id :members]]
                   :from      [[:permissions_group_membership :pgm]]
                   :left-join [[:core_user :user] [:= :pgm.user_id :user.id]]
                   :where     [:= :user.is_active true]
                   :group-by  [:pgm.group_id]})]
    (zipmap
      (map :group_id results)
      (map :members results))))

(defn- ordered-groups
  "Return a sequence of ordered `PermissionsGroups`."
  [limit offset query]
  (db/select PermissionsGroup
             (cond-> {:order-by [:%lower.name]}
               (some? limit)  (hh/limit  limit)
               (some? offset) (hh/offset offset)
               (some? query)  (hh/where query))))

(defn add-member-counts
  "Efficiently add `:member_count` to PermissionGroups."
  {:batched-hydrate :member_count}
  [groups]
  (let [group-id->num-members (group-id->num-members)]
    (for [group groups]
      (assoc group :member_count (get group-id->num-members (u/the-id group) 0)))))

(api/defendpoint GET "/group"
  "Fetch all `PermissionsGroups`, including a count of the number of `:members` in that group.
  This API requires superuser or group manager of more than one group.
  Group manager is only available if `advanced-permissions` is enabled and returns only groups that user
  is manager of."
  []
  (try
   (validation/check-group-manager)
   (catch clojure.lang.ExceptionInfo _e
     (validation/check-has-application-permission :setting)))
  (let [query (when (and (not api/*is-superuser?*)
                         (premium-features/enable-advanced-permissions?)
                         api/*is-group-manager?*)
                [:in :id {:select [:group_id]
                          :from   [:permissions_group_membership]
                          :where  [:and
                                   [:= :user_id api/*current-user-id*]
                                   [:= :is_group_manager true]]}])]
    (-> (ordered-groups mw.offset-paging/*limit* mw.offset-paging/*offset* query)
        (hydrate :member_count))))

(api/defendpoint GET "/group/:id"
  "Fetch the details for a certain permissions group."
  [id]
  (validation/check-group-manager id)
  (-> (PermissionsGroup id)
      (hydrate :members)))

(api/defendpoint POST "/group"
  "Create a new `PermissionsGroup`."
  [:as {{:keys [name]} :body}]
  {name su/NonBlankString}
  (api/check-superuser)
  (db/insert! PermissionsGroup
    :name name))

(api/defendpoint PUT "/group/:group-id"
  "Update the name of a `PermissionsGroup`."
  [group-id :as {{:keys [name]} :body}]
  {name su/NonBlankString}
  (validation/check-manager-of-group group-id)
  (api/check-404 (db/exists? PermissionsGroup :id group-id))
  (db/update! PermissionsGroup group-id
    :name name)
  ;; return the updated group
  (PermissionsGroup group-id))

(api/defendpoint DELETE "/group/:group-id"
  "Delete a specific `PermissionsGroup`."
  [group-id]
  (validation/check-manager-of-group group-id)
  (db/delete! PermissionsGroup :id group-id)
  api/generic-204-no-content)


;;; ------------------------------------------- Group Membership Endpoints -------------------------------------------

(api/defendpoint GET "/membership"
  "Fetch a map describing the group memberships of various users.
   This map's format is:

    {<user-id> [{:membership_id    <id>
                 :group_id         <id>
                 :is_group_manager boolean}]}"
  []
  (validation/check-group-manager)
  (group-by :user_id (db/select [PermissionsGroupMembership [:id :membership_id :is_group_manager]
                                 :group_id :user_id :is_group_manager]
                                (cond-> {}
                                  (and (not api/*is-superuser?*)
                                       api/*is-group-manager?*)
                                  (hh/merge-where
                                   [:in :group_id {:select [:group_id]
                                                   :from   [:permissions_group_membership]
                                                   :where  [:and
                                                            [:= :user_id api/*current-user-id*]
                                                            [:= :is_group_manager true]]}])))))

(api/defendpoint POST "/membership"
  "Add a `User` to a `PermissionsGroup`. Returns updated list of members belonging to the group."
  [:as {{:keys [group_id user_id is_group_manager]} :body}]
  {group_id         su/IntGreaterThanZero
   user_id          su/IntGreaterThanZero
   is_group_manager (schema.core/maybe schema.core/Bool)}
  (let [is_group_manager (boolean is_group_manager)]
    (validation/check-manager-of-group group_id)
    (when is_group_manager
      ;; enable `is_group_manager` require advanced-permissions enabled
      (validation/check-advanced-permissions-enabled :group-manager)
      (api/check
       (db/exists? User :id user_id :is_superuser false)
       [400 (tru "Admin cant be a group manager.")]))
    (db/insert! PermissionsGroupMembership
                :group_id         group_id
                :user_id          user_id
                :is_group_manager is_group_manager)
    ;; TODO - it's a bit silly to return the entire list of members for the group, just return the newly created one and
    ;; let the frontend add it as appropriate
    (perms-group/members {:id group_id})))

(api/defendpoint PUT "/membership/:id"
  "Update a Permission Group membership. Returns the updated record."
  [id :as {{:keys [is_group_manager]} :body}]
  {is_group_manager schema.core/Bool}
  ;; currently this API is only used to update the `is_group_manager` flag and it requires advanced-permissions
  (validation/check-advanced-permissions-enabled :group-manager)
  ;; Make sure only Super user or Group Managers can call this
  (validation/check-group-manager)
  (let [old (db/select-one PermissionsGroupMembership :id id)]
    (api/check-404 old)
    (validation/check-manager-of-group (:group_id old))
    (api/check
       (db/exists? User :id (:user_id old) :is_superuser false)
       [400 (tru "Admin cant be a group manager.")])
    (db/update! PermissionsGroupMembership (:id old)
                :is_group_manager is_group_manager)
    (db/select-one PermissionsGroupMembership :id (:id old))))

(api/defendpoint DELETE "/membership/:id"
  "Remove a User from a PermissionsGroup (delete their membership)."
  [id]
  (let [membership (db/select-one PermissionsGroupMembership :id id)]
    (api/check-404 membership)
    (validation/check-manager-of-group (:group_id membership))
    (db/delete! PermissionsGroupMembership :id id)
    api/generic-204-no-content))

(api/define-routes)
