(ns metabase.models.permissions-group
  (:require [clojure.string :as s]
            [metabase.db :as db]
            [metabase.models.interface :as i]
            [metabase.util :as u]))

(i/defentity PermissionsGroup :permissions_group)


;;; magic permissions groups getter helper fns

(def ^{:arglists '([])}
  ^metabase.models.permissions_group.PermissionsGroupInstance
  default
  "Fetch the `Default` permissions group, creating it if needed."
  (memoize (fn []
             (or (db/select-one PermissionsGroup
                   :name "Default")
                 (db/insert! PermissionsGroup
                   :name "Default")))))

(def
  ^{:arglists '([])}
  ^metabase.models.permissions_group.PermissionsGroupInstance
  admin
  "Fetch the `Admin` permissions group, creating it if needed."
  (memoize (fn []
             (or (db/select-one PermissionsGroup
                   :name "Admin")
                 (db/insert! PermissionsGroup
                   :name "Admin")))))

(defn exists-with-name?
  "Does a `PermissionsGroup` with GROUP-NAME exist in the DB? (case-insensitive)"
  ^Boolean [group-name]
  {:pre [(u/string-or-keyword? group-name)]}
  (db/exists? PermissionsGroup
    :%lower.name (s/lower-case (name group-name))))

(defn- throw-exception-if-name-already-taken
  [group-name]
  (when (exists-with-name? group-name)
    (throw (ex-info "A group with that name already exists." {:status-code 400}))))

(defn- throw-exception-when-editing-magic-group
  "Make sure we're not trying to edit/delete one of the magic groups, or throw an exception."
  [{id :id}]
  {:pre [(integer? id)]}
  (when (= id (:id (default)))
    (throw (ex-info "You cannot edit or delete the 'Default' permissions group!" {:status-code 400})))
  (when (= id (:id (admin)))
    (throw (ex-info "You cannot edit or delete the 'Admin' permissions group!" {:status-code 400}))))


(defn- pre-insert [{group-name :name, :as group}]
  (u/prog1 group
    (throw-exception-if-name-already-taken group-name)))


(defn- pre-cascade-delete [{id :id, :as group}]
  (throw-exception-when-editing-magic-group group)
  (db/cascade-delete! 'Permissions                :group_id id)
  (db/cascade-delete! 'PermissionsGroupMembership :group_id id))

(defn- pre-update [{group-name :name, :as group}]
  (u/prog1 group
    (throw-exception-when-editing-magic-group group)
    (when group-name
      (throw-exception-if-name-already-taken group-name))))

(u/strict-extend (class PermissionsGroup)
  i/IEntity (merge i/IEntityDefaults
                   {:pre-cascade-delete pre-cascade-delete
                    :pre-insert         pre-insert
                    :pre-update         pre-update}))


(defn members
  "Return `Users` that belong to PERMISSIONS-GROUP, ordered by their name (case-insensitive)."
  [{id :id}]
  {:pre [(integer? id)]}
  (let [user-id->membership-id (into {} (for [{:keys [id user_id]} (db/select ['PermissionsGroupMembership :id :user_id] :group_id id)]
                                          {user_id id}))]
    (when (seq user-id->membership-id)
      (for [user (sort-by (comp :common_name s/lower-case)
                          (db/select ['User :first_name :last_name :email [:id :user_id]]
                            :id [:in (keys user-id->membership-id)]))]
        (assoc user
          :membership_id (user-id->membership-id (:user_id user)))))))
