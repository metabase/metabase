(ns metabase.api.permissions
  "/api/permissions endpoints."
  (:require [clojure.string :as s]
            [compojure.core :refer [GET POST PUT DELETE]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [database :as database]
                             [hydrate :refer [hydrate]]
                             [permissions :refer [Permissions], :as permissions]
                             [permissions-group :refer [PermissionsGroup], :as group]
                             [permissions-group-membership :refer [PermissionsGroupMembership]]
                             [table :refer [Table]])
            [metabase.util :as u]))


;;; ---------------------------------------- Etc. ----------------------------------------

(defn- object-path
  (^String [database-id]                      (str "/db/" database-id "/"))
  (^String [database-id schema-name]          (str (object-path database-id) "schema/" schema-name "/"))
  (^String [database-id schema-name table-id] (str (object-path database-id schema-name) "table/" table-id "/" )))

(defn- group-access-type-for-db [group-id database-id]
  (let [db      (object-path database-id)
        schemas (str db "schema/")]
    (cond
      (permissions/group-has-full-access?    group-id db)      :unrestricted
      (permissions/group-has-full-access?    group-id schemas) :all_schemas
      (permissions/group-has-partial-access? group-id schemas) :some_schemas
      :else                                                    :no_access)))

(defn- group-access-type-for-schema [group-id database-id schema-name]
  (let [object (object-path database-id schema-name)]
    (cond
      (permissions/group-has-full-access?    group-id object) :all_tables
      (permissions/group-has-partial-access? group-id object) :some_tables)))


(defn- group-permissions-for-db [group-id database-id]
  {:group_id    group-id
   :database_id database-id
   :name        (db/select-one-field :name 'Database :id database-id)
   :access_type (group-access-type-for-db group-id database-id)
   :schemas     (for [schema-name (database/schema-names {:id database-id})]
                  {:name        schema-name
                   :access_type (group-access-type-for-schema group-id database-id schema-name)})})

(defn- group-permissions-for-all-dbs [group-id]
  (for [db-id (map :id (db/select ['Database :id] {:order-by [:%lower.name]}))]
    (group-permissions-for-db group-id db-id)))

(defn- group-permissions-for-schema [group-id database-id schema-name]
  {:group_id    group-id
   :database_id database-id
   :schema      schema-name
   :access_type (case (permissions/group-has-partial-access? group-id (object-path database-id schema-name))
                  :full    :unrestricted
                  :partial :some_tables
                  :no_access)
   :tables      (for [table (db/select ['Table :name [:id :table_id]]
                              :db_id database-id
                              :schema schema-name
                              {:order-by [:%lower.name]})]
                  (assoc table
                    :access_type (case (permissions/group-has-partial-access? group-id (object-path database-id schema-name (:table_id table)))
                                   :full    :unrestricted
                                   :partial :some_fields
                                   :no_access)))})


;;; ---------------------------------------- PermissionsGroup (/api/permissions/group) endpoints ----------------------------------------

(defendpoint GET "/group"
  "Fetch all `PermissionsGroups`."
  []
  (check-superuser)
  ;; TODO - this is complicated, should we just do normal queries and hydration here?
  (db/query {:select    [:pg.id :pg.name [:%count.pgm.id :members]]
             :from      [[:permissions_group :pg]]
             :left-join [[:permissions_group_membership :pgm]
                         [:= :pg.id :pgm.group_id]]
             :group-by  [:pg.id :pg.name]
             :order-by  [:%lower.pg.name]}))

(defendpoint POST "/group"
  "Create a new `PermissionsGroup`."
  [:as {{:keys [name]} :body}]
  {name [Required NonEmptyString]}
  (check-superuser)
  (db/insert! PermissionsGroup
    :name name))

(defendpoint GET "/group/:group-id"
  "Fetch details for a specific `PermissionsGroup`."
  [group-id]
  (check-superuser)
  (assoc (PermissionsGroup group-id)
    :members   (group/members {:id group-id})
    :databases (group-permissions-for-all-dbs group-id)))

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


;;; ---------------------------------------- PermissionsGroupMembership (api/permissions/membership?) endpoints ----------------------------------------

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


;;; ---------------------------------------- Database (/api/permissions/database) endpoints ----------------------------------------

(defendpoint GET "/database/:database-id"
  "Fetch details about Permissions for a specific `Database`."
  [database-id]
  (check-superuser)
  (let [schema-names (database/schema-names {:id database-id})
        groups       (db/select PermissionsGroup
                       {:order-by [:%lower.name]})]
    {:id      database-id
     :schemas (for [schema-name schema-names]
                {:name   schema-name
                 :groups (for [group groups
                               :let  [access-type (group-access-type-for-schema (:id group) database-id schema-name)]
                               :when access-type]
                           (assoc group
                             :access (when (= access-type :all_tables)
                                       "All tables")))})}))


;;; ---------------------------------------- DatabasePermissions (/api/permissions/group/:id/database/:id) endpoints ----------------------------------------

(defendpoint GET "/group/:group-id/database/:database-id"
  "Get details about the permissions for a specific Group for a specific Database."
  [database-id group-id]
  (check-superuser)
  (group-permissions-for-db group-id database-id))

(defendpoint POST "/group/:group-id/database/:database-id"
  "Change permissions settings for a specific Group and specific Database."
  [database-id group-id :as {{:keys [access_type]} :body}]
  {access_type [Required NonEmptyString]}
  (check (contains? #{"unrestricted" "all_schemas" "some_schemas" "no_access"} access_type)
    400 "Invalid access type.")
  ;; remove any existing permissions
  (db/cascade-delete! Permissions :group_id group-id, :object [:like (str (object-path database-id) "%")])
  ;; now insert a new entry if appropriate
  (case access_type
    "unrestricted" (db/insert! Permissions :group_id group-id, :object (object-path database-id))
    "all_schemas"  (db/insert! Permissions :group_id group-id, :object (str (object-path database-id) "schema/"))
    ;; just insert an entry for the first schema for this DB
    "some_schemas" (let [first-schema-name (first (database/schema-names {:id 1}))]
                     (db/insert! Permissions :group_id group-id, :object (object-path database-id first-schema-name)))
    ;; nothing to create for no_access
    "no_access"    nil)
  (group-permissions-for-db group-id database-id))


;;; ---------------------------------------- SchemaPermissions (/api/permissions/group/:id/database/:id/schema/:schema) endpoints ----------------------------------------

(defendpoint GET "/group/:group-id/database/:database-id/schema/:schema-name"
  "Fetch schema permissions for a permissions group."
  [group-id database-id schema-name]
  {schema-name NonEmptyString}
  (check-superuser)
  (group-permissions-for-schema group-id database-id schema-name))


(defendpoint POST "/group/:group-id/database/:database-id/schema"
  "Create schema permissions for a Group."
  [database-id group-id :as {{:keys [schema]} :body}]
  {schema [Required NonEmptyString]}
  (check-superuser)
  (let [object (object-path database-id schema)]
    ;; remove any existing permissions
    (db/cascade-delete! Permissions :group_id group-id, :object [:like (str object "%")])
    ;; now create a new entry with full schema permissions
    (db/insert! Permissions :group_id group-id, :object object)))


(defendpoint DELETE "/group/:group-id/database/:database-id/schema/:schema-name"
  "Remove schema permissions for a group."
  [group-id database-id schema-name]
  {schema-name NonEmptyString}
  (db/cascade-delete! Permissions :group_id group-id, :object [:like (str (object-path database-id schema-name) "%")]))


(defendpoint PUT "/group/:group-id/database/:database-id/schema/:schema-name"
  "Change the permissions settings for a schema."
  [group-id database-id schema-name :as {{:keys [unrestricted_table_access]} :body}]
  {unrestricted_table_access [Required Boolean]}
  (check-superuser)
  (let [object (object-path database-id schema-name)]
    ;; delete any old permissions
    (db/cascade-delete! Permissions :group_id group-id, :object [:like (str object "%")])
    ;; create a new unrestricted entry for the schema if appropriate
    (when unrestricted_table_access
      (db/insert! Permissions :group_id group-id, :object object)))
  (group-permissions-for-schema group-id database-id schema-name))

;;; ---------------------------------------- TablePermissions (/api/permissions/group/:id/table/:id) endpoints ----------------------------------------

(defendpoint POST "/group/:group-id/table/:table-id"
  "Create permissions for a Table."
  [group-id table-id]
  (check-superuser)
  (let-404 [{:keys [database-id schema]} (db/select-one [Table [:db_id :database-id] :schema], :id table-id)]
    (let [object (object-path database-id schema table-id)]
      ;; delete any existing entries for the table
      (db/cascade-delete! Permissions :group_id group-id, :object [:like (str object "%")])
      ;; now create a new entry with full access
      (db/insert! Permissions :group_id group-id, :object object))))

(defendpoint DELETE "/group/:group-id/table/:table-id"
  "Revoke `TablePermissions` for a Table."
  [group-id table-id]
  (check-superuser)
  (let-404 [{:keys [database-id schema]} (db/select-one [Table [:db_id :database-id] :schema], :id table-id)]
    (db/cascade-delete! Permissions :group_id group-id, :object [:like (str (object-path database-id schema table-id) "%")])))


(define-routes)
