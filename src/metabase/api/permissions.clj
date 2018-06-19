(ns metabase.api.permissions
  "/api/permissions endpoints."
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase
             [metabot :as metabot]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]]
            [metabase.util.schema :as su]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          PERMISSIONS GRAPH ENDPOINTS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------- DeJSONifaction -------------------------------------------------

(defn- ->int [id] (Integer/parseInt (name id)))

(defn- dejsonify-table-perms [table-perms]
  (if-not (map? table-perms)
    (keyword table-perms)
    (into {} (for [[k v] table-perms]
               [(keyword k) (keyword v)]))))

(defn- dejsonify-tables [tables]
  (if (string? tables)
    (keyword tables)
    (into {} (for [[table-id perms] tables]
               {(->int table-id) (dejsonify-table-perms perms)}))))

(defn- dejsonify-schemas [schemas]
  (if (string? schemas)
    (keyword schemas)
    (into {} (for [[schema tables] schemas]
               {(name schema) (dejsonify-tables tables)}))))

(defn- dejsonify-dbs [dbs]
  (into {} (for [[db-id {:keys [native schemas]}] dbs]
             {(->int db-id) {:native  (keyword native)
                             :schemas (dejsonify-schemas schemas)}})))

(defn- dejsonify-groups [groups]
  (into {} (for [[group-id dbs] groups]
             {(->int group-id) (dejsonify-dbs dbs)})))

(defn- dejsonify-graph
  "Fix the types in the graph when it comes in from the API, e.g. converting things like `\"none\"` to `:none` and
  parsing object keys as integers."
  [graph]
  (update graph :groups dejsonify-groups))


;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(api/defendpoint GET "/graph"
  "Fetch a graph of all Permissions."
  []
  (api/check-superuser)
  (perms/graph))


(api/defendpoint PUT "/graph"
  "Do a batch update of Permissions by passing in a modified graph. This should return the same graph, in the same
  format, that you got from `GET /api/permissions/graph`, with any changes made in the wherever neccesary. This
  modified graph must correspond to the `PermissionsGraph` schema. If successful, this endpoint returns the updated
  permissions graph; use this as a base for any further modifications.

  Revisions to the permissions graph are tracked. If you fetch the permissions graph and some other third-party
  modifies it before you can submit you revisions, the endpoint will instead make no changes and return a
  409 (Conflict) response. In this case, you should fetch the updated graph and make desired changes to that."
  [:as {body :body}]
  {body su/Map}
  (api/check-superuser)
  (perms/update-graph! (dejsonify-graph body))
  (perms/graph))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          PERMISSIONS GROUP ENDPOINTS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- group-id->num-members
  "Return a map of `PermissionsGroup` ID -> number of members in the group. (This doesn't include entries for empty
  groups.)"
  []
  (into {} (for [{:keys [group_id members]} (db/query
                                             {:select    [[:pgm.group_id :group_id] [:%count.pgm.id :members]]
                                              :from      [[:permissions_group_membership :pgm]]
                                              :left-join [[:core_user :user] [:= :pgm.user_id :user.id]]
                                              :where     [:= :user.is_active true]
                                              :group-by  [:pgm.group_id]})]
             {group_id members})))

(defn- ordered-groups
  "Return a sequence of ordered `PermissionsGroups`, including the `MetaBot` group only if MetaBot is enabled."
  []
  (db/select PermissionsGroup
    {:where    (if (metabot/metabot-enabled)
                 true
                 [:not= :id (u/get-id (group/metabot))])
     :order-by [:%lower.name]}))

(api/defendpoint GET "/group"
  "Fetch all `PermissionsGroups`, including a count of the number of `:members` in that group."
  []
  (api/check-superuser)
  (let [group-id->members (group-id->num-members)]
    (for [group (ordered-groups)]
      (assoc group :members (or (group-id->members (u/get-id group))
                                0)))))

(api/defendpoint GET "/group/:id"
  "Fetch the details for a certain permissions group."
  [id]
  (api/check-superuser)
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
  (api/check-superuser)
  (api/check-404 (db/exists? PermissionsGroup :id group-id))
  (db/update! PermissionsGroup group-id
    :name name)
  ;; return the updated group
  (PermissionsGroup group-id))

(api/defendpoint DELETE "/group/:group-id"
  "Delete a specific `PermissionsGroup`."
  [group-id]
  (api/check-superuser)
  (db/delete! PermissionsGroup :id group-id)
  api/generic-204-no-content)


;;; ------------------------------------------- Group Membership Endpoints -------------------------------------------

(api/defendpoint GET "/membership"
  "Fetch a map describing the group memberships of various users.
   This map's format is:

    {<user-id> [{:membership_id <id>
                 :group_id      <id>}]}"
  []
  (api/check-superuser)
  (group-by :user_id (db/select [PermissionsGroupMembership [:id :membership_id] :group_id :user_id])))

(api/defendpoint POST "/membership"
  "Add a `User` to a `PermissionsGroup`. Returns updated list of members belonging to the group."
  [:as {{:keys [group_id user_id]} :body}]
  {group_id su/IntGreaterThanZero
   user_id  su/IntGreaterThanZero}
  (api/check-superuser)
  (db/insert! PermissionsGroupMembership
    :group_id group_id
    :user_id  user_id)
  ;; TODO - it's a bit silly to return the entire list of members for the group, just return the newly created one and
  ;; let the frontend add it ass appropriate
  (group/members {:id group_id}))

(api/defendpoint DELETE "/membership/:id"
  "Remove a User from a PermissionsGroup (delete their membership)."
  [id]
  (api/check-superuser)
  (api/check-404 (db/exists? PermissionsGroupMembership :id id))
  (db/delete! PermissionsGroupMembership :id id)
  api/generic-204-no-content)


(api/define-routes)
