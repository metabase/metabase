(ns metabase.api.permissions
  "/api/permissions endpoints."
  (:require [compojure.core :refer [GET POST PUT DELETE]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.metabot :as metabot]
            (metabase.models [database :as database]
                             [hydrate :refer [hydrate]]
                             [permissions :refer [Permissions], :as perms]
                             [permissions-group :refer [PermissionsGroup], :as group]
                             [permissions-group-membership :refer [PermissionsGroupMembership]]
                             [table :refer [Table]])
            [metabase.util :as u]))

;;; +------------------------------------------------------------------------------------------------------------------------------------------------------+
;;; |                                                             PERMISSIONS GRAPH ENDPOINTS                                                              |
;;; +------------------------------------------------------------------------------------------------------------------------------------------------------+

;;; ---------------------------------------- DeJSONifaction ----------------------------------------

(defn- ->int [id] (Integer/parseInt (name id)))

(defn- dejsonify-tables [tables]
  (if (string? tables)
    (keyword tables)
    (into {} (for [[table-id perms] tables]
               {(->int table-id) (keyword perms)}))))

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
  "Fix the types in the graph when it comes in from the API, e.g. converting things like `\"none\"` to `:none` and parsing object keys as integers."
  [graph]
  (update graph :groups dejsonify-groups))


;;; ---------------------------------------- Endpoints ----------------------------------------

(defendpoint GET "/graph"
  "Fetch a graph of all Permissions."
  []
  (check-superuser)
  (perms/graph))


(defendpoint PUT "/graph"
  "Do a batch update of Permissions by passing in a modified graph. This should return the same graph,
   in the same format, that you got from `GET /api/permissions/graph`, with any changes made in the wherever neccesary.
   This modified graph must correspond to the `PermissionsGraph` schema.
   If successful, this endpoint returns the updated permissions graph; use this as a base for any further modifications.

   Revisions to the permissions graph are tracked. If you fetch the permissions graph and some other third-party modifies it before you can submit
   you revisions, the endpoint will instead make no changes andr eturn a 409 (Conflict) response. In this case, you should fetch the updated graph
   and make desired changes to that."
  [:as {body :body}]
  {body [Required Dict]}
  (check-superuser)
  (perms/update-graph! (dejsonify-graph body))
  (perms/graph))


;;; +------------------------------------------------------------------------------------------------------------------------------------------------------+
;;; |                                                             PERMISSIONS GROUP ENDPOINTS                                                              |
;;; +------------------------------------------------------------------------------------------------------------------------------------------------------+

(defendpoint GET "/group"
  "Fetch all `PermissionsGroups`."
  []
  (check-superuser)
  (db/query {:select    [:pg.id :pg.name [:%count.pgm.id :members]]
             :from      [[:permissions_group :pg]]
             :left-join [[:permissions_group_membership :pgm]
                         [:= :pg.id :pgm.group_id]]
             :where     (if (metabot/metabot-enabled)
                          true
                          [:not= :pg.id (:id (group/metabot))])
             :group-by  [:pg.id :pg.name]
             :order-by  [:%lower.pg.name]}))

(defendpoint GET "/group/:id"
  "Fetch the details for a certain permissions group."
  [id]
  (check-superuser)
  (-> (PermissionsGroup id)
      (hydrate :members)))

(defendpoint POST "/group"
  "Create a new `PermissionsGroup`."
  [:as {{:keys [name]} :body}]
  {name [Required NonEmptyString]}
  (check-superuser)
  (db/insert! PermissionsGroup
    :name name))

(defendpoint PUT "/group/:group-id"
  "Update the name of a `PermissionsGroup`."
  [group-id :as {{:keys [name]} :body}]
  {name [Required NonEmptyString]}
  (check-superuser)
  (check-404 (db/exists? PermissionsGroup :id group-id))
  (db/update! PermissionsGroup group-id
    :name name)
  ;; return the updated group
  (PermissionsGroup group-id))

(defendpoint DELETE "/group/:group-id"
  "Delete a specific `PermissionsGroup`."
  [group-id]
  (check-superuser)
  (db/cascade-delete! PermissionsGroup :id group-id))


;;; ---------------------------------------- Group Membership Endpoints ----------------------------------------

(defendpoint GET "/membership"
  "Fetch a map describing the group memberships of various users.
   This map's format is:

    {<user-id> [{:membership_id <id>
                 :group_id      <id>}]}"
  []
  (check-superuser)
  (group-by :user_id (db/select [PermissionsGroupMembership [:id :membership_id] :group_id :user_id])))

(defendpoint POST "/membership"
  "Add a `User` to a `PermissionsGroup`. Returns updated list of members belonging to the group."
  [:as {{:keys [group_id user_id]} :body}]
  {group_id [Required Integer]
   user_id  [Required Integer]}
  (check-superuser)
  (db/insert! PermissionsGroupMembership
    :group_id group_id
    :user_id  user_id)
  ;; TODO - it's a bit silly to return the entire list of members for the group, just return the newly created one and let the frontend add it ass appropriate
  (group/members {:id group_id}))

(defendpoint DELETE "/membership/:id"
  "Remove a User from a PermissionsGroup (delete their membership)."
  [id]
  (check-superuser)
  (check-404 (db/exists? PermissionsGroupMembership :id id))
  (db/cascade-delete! PermissionsGroupMembership
    :id id))


(define-routes)
