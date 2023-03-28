(ns metabase.models.permissions-group
  "A `PermissionsGroup` is a group (or role) that can be assigned certain permissions. Users can be members of one or
  more of these groups.

  A few 'magic' groups exist: [[all-users]], which predicably contains All Users; and [[admin]], which contains all
  superusers. These groups are 'magic' in the sense that you cannot add users to them yourself, nor can you delete
  them; they are created automatically. You can, however, set permissions for them.

  See documentation in [[metabase.models.permissions]] for more information about the Metabase permissions system."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.query :as mdb.query]
   [metabase.models.interface :as mi]
   [metabase.models.setting :as setting]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(models/defmodel PermissionsGroup :permissions_group)


;;; -------------------------------------------- Magic Groups Getter Fns ---------------------------------------------

(defn- magic-group [group-name]
  (mdb.connection/memoize-for-application-db
   (fn []
     (u/prog1 (t2/select-one PermissionsGroup :name group-name)
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

(defn- pre-insert [{group-name :name, :as group}]
  (u/prog1 group
    (check-name-not-already-taken group-name)))

(defn- pre-delete [{id :id, :as group}]
  (check-not-magic-group group)
  ;; Remove from LDAP mappings
  (classloader/require 'metabase.integrations.ldap)
  (setting/set-value-of-type!
   :json :ldap-group-mappings
   (when-let [mappings (setting/get-value-of-type :json :ldap-group-mappings)]
     (zipmap (keys mappings)
             (for [val (vals mappings)]
               (remove (partial = id) val))))))

(defn- pre-update [{group-name :name, :as group}]
  (u/prog1 group
    (check-not-magic-group group)
    (when group-name
      (check-name-not-already-taken group-name))))

(mi/define-methods
 PermissionsGroup
 {:pre-delete  pre-delete
  :pre-insert  pre-insert
  :pre-update  pre-update})

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
