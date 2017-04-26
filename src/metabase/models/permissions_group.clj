(ns metabase.models.permissions-group
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel PermissionsGroup :permissions_group)


;;; ------------------------------------------------------------ Magic Groups Getter Fns ------------------------------------------------------------

(defn- group-fetch-fn [group-name]
  (memoize (fn []
             (or (db/select-one PermissionsGroup
                   :name group-name)
                 (u/prog1 (db/insert! PermissionsGroup
                            :name group-name)
                   (log/info (u/format-color 'green "Created magic permissions group '%s' (ID = %d)" group-name (:id <>))))))))

(def ^{:arglists '([])} ^metabase.models.permissions_group.PermissionsGroupInstance
  all-users
  "Fetch the `All Users` permissions group, creating it if needed."
  (group-fetch-fn "All Users"))

(def ^{:arglists '([])} ^metabase.models.permissions_group.PermissionsGroupInstance
  admin
  "Fetch the `Administators` permissions group, creating it if needed."
  (group-fetch-fn "Administrators"))

(def ^{:arglists '([])} ^metabase.models.permissions_group.PermissionsGroupInstance
  metabot
  "Fetch the `MetaBot` permissions group, creating it if needed."
  (group-fetch-fn "MetaBot"))


;;; ------------------------------------------------------------ Validation ------------------------------------------------------------

(defn exists-with-name?
  "Does a `PermissionsGroup` with GROUP-NAME exist in the DB? (case-insensitive)"
  ^Boolean [group-name]
  {:pre [(u/string-or-keyword? group-name)]}
  (db/exists? PermissionsGroup
    :%lower.name (s/lower-case (name group-name))))

(defn- check-name-not-already-taken
  [group-name]
  (when (exists-with-name? group-name)
    (throw (ex-info "A group with that name already exists." {:status-code 400}))))

(defn- check-not-magic-group
  "Make sure we're not trying to edit/delete one of the magic groups, or throw an exception."
  [{id :id}]
  {:pre [(integer? id)]}
  (doseq [magic-group [(all-users)
                       (admin)
                       (metabot)]]
    (when (= id (:id magic-group))
      (throw (ex-info (format "You cannot edit or delete the '%s' permissions group!" (:name magic-group))
               {:status-code 400})))))


;;; ------------------------------------------------------------ Lifecycle ------------------------------------------------------------

(defn- pre-insert [{group-name :name, :as group}]
  (u/prog1 group
    (check-name-not-already-taken group-name)))

(defn- pre-delete [{id :id, :as group}]
  (check-not-magic-group group)
  (db/delete! 'Permissions                :group_id id)
  (db/delete! 'PermissionsGroupMembership :group_id id))

(defn- pre-update [{group-name :name, :as group}]
  (u/prog1 group
    (check-not-magic-group group)
    (when group-name
      (check-name-not-already-taken group-name))))

(u/strict-extend (class PermissionsGroup)
  models/IModel (merge models/IModelDefaults
                   {:pre-delete pre-delete
                    :pre-insert         pre-insert
                    :pre-update         pre-update}))


;;; ------------------------------------------------------------ Util Fns ------------------------------------------------------------


(defn ^:hydrate members
  "Return `Users` that belong to GROUP-OR-ID, ordered by their name (case-insensitive)."
  [group-or-id]
  (db/query {:select    [:user.first_name
                         :user.last_name
                         :user.email
                         [:user.id :user_id]
                         [:pgm.id :membership_id]]
             :from      [[:core_user :user]]
             :left-join [[:permissions_group_membership :pgm] [:= :user.id :pgm.user_id]]
             :where     [:and [:= :user.is_active true]
                              [:= :pgm.group_id (u/get-id group-or-id)]]
             :order-by  [[:%lower.user.first_name :asc]
                         [:%lower.user.last_name :asc]]}))
