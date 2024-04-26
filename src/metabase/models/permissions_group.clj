(ns metabase.models.permissions-group
  "A `PermissionsGroup` is a group (or role) that can be assigned certain permissions. Users can be members of one or
  more of these groups.

  A few 'magic' groups exist: [[all-users]], which predicably contains All Users; and [[admin]], which contains all
  superusers. These groups are 'magic' in the sense that you cannot add users to them yourself, nor can you delete
  them; they are created automatically. You can, however, set permissions for them.

  See documentation in [[metabase.models.permissions]] for more information about the Metabase permissions system."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.models.setting :as setting]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def PermissionsGroup
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/PermissionsGroup)

(methodical/defmethod t2/table-name :model/PermissionsGroup [_model] :permissions_group)

(doto :model/PermissionsGroup
  (derive :metabase/model)
  (derive :hook/entity-id))

(defmethod serdes/hash-fields :model/PermissionsGroup
  [_user]
  [:name])

;;; -------------------------------------------- Magic Groups Getter Fns ---------------------------------------------

(defn- magic-group [group-name]
  (mdb/memoize-for-application-db
   (fn []
     (u/prog1 (t2/select-one [PermissionsGroup :id :name] :name group-name)
       ;; normally it is impossible to delete the magic [[all-users]] or [[admin]] Groups -- see
       ;; [[check-not-magic-group]]. This assertion is here to catch us if we do something dumb when hacking on
       ;; the MB code -- to make tests fail fast. For that reason it's not i18n'ed.
       (when-not <>
         (throw (ex-info (format "Fatal error: magic Permissions Group %s has gone missing." (pr-str group-name))
                         {:name group-name})))))))

(def all-users-group-name
  "The name of the \"All Users\" magic group."
  "All Users")

(def ^{:arglists '([])} all-users
  "Fetch the `All Users` permissions group"
  (magic-group all-users-group-name))

(def admin-group-name
  "The name of the \"Administrators\" magic group."
  "Administrators")

(def ^{:arglists '([])} admin
  "Fetch the `Administrators` permissions group"
  (magic-group admin-group-name))


;;; --------------------------------------------------- Validation ---------------------------------------------------

(defn exists-with-name?
  "Does a `PermissionsGroup` with `group-name` exist in the DB? (case-insensitive)"
  ^Boolean [group-name]
  {:pre [((some-fn keyword? string?) group-name)]}
  (t2/exists? PermissionsGroup
    :%lower.name (u/lower-case-en (name group-name))))

(defn- check-name-not-already-taken
  [group-name]
  (when (exists-with-name? group-name)
    (throw (ex-info (tru "A group with that name already exists.") {:status-code 400}))))

(defn- check-not-magic-group
  "Make sure we're not trying to edit/delete one of the magic groups, or throw an exception."
  [{id :id}]
  {:pre [(integer? id)]}
  (doseq [magic-group [(all-users)
                       (admin)]]
    (when (= id (:id magic-group))
      (throw (ex-info (tru "You cannot edit or delete the ''{0}'' permissions group!" (:name magic-group))
               {:status-code 400})))))


;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(t2/define-before-insert :model/PermissionsGroup
 [{group-name :name, :as group}]
 (u/prog1 group
   (check-name-not-already-taken group-name)))

(defn- set-default-permission-values!
  [group]
  (t2/with-transaction [_conn]
    (doseq [db-id (t2/select-pks-vec :model/Database)]
      (data-perms/set-new-group-permissions! group db-id (u/the-id (all-users))))))

(t2/define-after-insert :model/PermissionsGroup
  [group]
  (u/prog1 group
    (set-default-permission-values! group)))

(t2/define-before-delete :model/PermissionsGroup
  [{id :id, :as group}]
  (check-not-magic-group group)
  ;; Remove from LDAP mappings
  (classloader/require 'metabase.integrations.ldap)
  (setting/set-value-of-type!
    :json :ldap-group-mappings
    (when-let [mappings (setting/get-value-of-type :json :ldap-group-mappings)]
      (zipmap (keys mappings)
              (for [val (vals mappings)]
                (remove (partial = id) val))))))

(t2/define-before-update :model/PermissionsGroup
  [group]
  (let [changes (t2/changes group)]
    (u/prog1 group
      (when (contains? changes :name)
        ;; Allow backfilling the entity ID for magic groups, but not changing anything else
        (check-not-magic-group group))
      (when-let [group-name (:name changes)]
        (check-name-not-already-taken group-name)))))

;;; ---------------------------------------------------- Util Fns ----------------------------------------------------


(mi/define-simple-hydration-method members
  :members
  "Return `Users` that belong to `group-or-id`, ordered by their name (case-insensitive)."
  [group-or-id]
  (mdb.query/query (cond-> {:select    [:user.first_name
                                        :user.last_name
                                        :user.email
                                        [:user.id :user_id]
                                        [:pgm.id :membership_id]]
                            :from      [[:core_user :user]]
                            :left-join [[:permissions_group_membership :pgm] [:= :user.id :pgm.user_id]]
                            :where     [:and [:= :user.is_active true]
                                        [:= :pgm.group_id (u/the-id group-or-id)]]
                            :order-by  [[[:lower :user.first_name] :asc]
                                        [[:lower :user.last_name] :asc]]}

                     (premium-features/enable-advanced-permissions?)
                     (sql.helpers/select [:pgm.is_group_manager :is_group_manager]))))

(defn non-admin-groups
  "Return a set of the IDs of all `PermissionsGroups`, aside from the admin group."
  []
  (t2/select PermissionsGroup :name [:not= admin-group-name]))

(defn non-magic-groups
  "Return a set of the IDs of all `PermissionsGroups`, aside from the admin group and the All Users group."
  []
  (t2/select PermissionsGroup {:where [:and [:not= :name admin-group-name]
                                            [:not= :name all-users-group-name]]}))
