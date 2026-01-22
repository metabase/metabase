(ns metabase.permissions.models.permissions-group
  "A `PermissionsGroup` is a group (or role) that can be assigned certain permissions. Users can be members of one or
  more of these groups.

  A few 'magic' groups exist: [[all-users]], which predicably contains All Users; and [[admin]], which contains all
  superusers. These groups are 'magic' in the sense that you cannot add users to them yourself, nor can you delete
  them; they are created automatically. You can, however, set permissions for them.

  See documentation in [[metabase.permissions.models.permissions]] for more information about the Metabase permissions system."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(methodical/defmethod t2/table-name :model/PermissionsGroup [_model] :permissions_group)
(methodical/defmethod t2/model-for-automagic-hydration [:default :permissions_group] [_original-model _k] :model/PermissionsGroup)
(methodical/defmethod t2.hydrate/fk-keys-for-automagic-hydration [:default :permissions_group :default]
  [_original-model _dest-key _hydrating-model]
  [:permissions_group_id])

(doto :model/PermissionsGroup
  (derive :metabase/model)
  (derive :hook/entity-id))

(defmethod serdes/hash-fields :model/PermissionsGroup
  [_user]
  [:name])

;;; -------------------------------------------- Magic Groups Getter Fns ---------------------------------------------

(defn- magic-group [magic-group-type]
  (mdb/memoize-for-application-db
   (fn []
     (u/prog1 (t2/select-one [:model/PermissionsGroup :id :name :magic_group_type] :magic_group_type magic-group-type)
       ;; normally it is impossible to delete the magic [[all-users]] or [[admin]] Groups -- see
       ;; [[check-not-magic-group]]. This assertion is here to catch us if we do something dumb when hacking on
       ;; the MB code -- to make tests fail fast. For that reason it's not i18n'ed.
       (when-not <>
         (throw (ex-info (format "Fatal error: magic Permissions Group '%s' has gone missing." magic-group-type)
                         {:magic-group-type magic-group-type})))))))

(def all-users-magic-group-type
  "The magic-group type of the \"All Users\" magic group."
  "all-internal-users")

(def ^{:arglists '([])} all-users
  "Fetch the `All Users` permissions group"
  (magic-group all-users-magic-group-type))

(def all-external-users-magic-group-type
  "The magic group type of the \"All tenant users\" magic group."
  "all-external-users")

(def ^{:arglists '([])} all-external-users
  "Fetch the `All tenant users` permissions group"
  (magic-group all-external-users-magic-group-type))

(def admin-magic-group-type
  "The magic-group type of the \"Administrators\" magic group."
  "admin")

(def ^{:arglists '([])} admin
  "Fetch the `Administrators` permissions group"
  (magic-group admin-magic-group-type))

(def data-analyst-magic-group-type
  "The magic-group type of the \"Data Analysts\" magic group."
  "data-analyst")

(def ^{:arglists '([])} data-analyst
  "Fetch the `Data Analysts` permissions group"
  (magic-group data-analyst-magic-group-type))

;;; --------------------------------------------------- Validation ---------------------------------------------------

(defn exists-with-name?
  "Does a `PermissionsGroup` with `group-name` exist in the DB? (case-insensitive)"
  ^Boolean [group-name]
  {:pre [((some-fn keyword? string?) group-name)]}
  (t2/exists? :model/PermissionsGroup
              :%lower.name (u/lower-case-en (name group-name))))

(defn- check-name-not-already-taken
  [group-name]
  (when (exists-with-name? group-name)
    (throw (ex-info (tru "A group with that name already exists.") {:status-code 400}))))

(def ^:dynamic ^:private *allow-modifying-magic-groups*
  "Dynamic var that, when bound to true, allows modifying magic groups. Used by [[sync-data-analyst-group-for-oss!]]."
  false)

(defn- check-not-magic-group
  "Make sure we're not trying to edit/delete one of the magic groups, or throw an exception."
  [{id :id}]
  {:pre [(integer? id)]}
  (when-not *allow-modifying-magic-groups*
    (doseq [magic-group [(all-users)
                         (all-external-users)
                         (admin)
                         (data-analyst)]]
      (when (= id (:id magic-group))
        (throw (ex-info (tru "You cannot edit or delete the ''{0}'' permissions group!" (:name magic-group))
                        {:status-code 400}))))))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(t2/define-before-insert :model/PermissionsGroup
  [{group-name :name, :as group}]
  (u/prog1 group
    (check-name-not-already-taken group-name)))

(defn- set-default-permission-values!
  [group]
  (t2/with-transaction [_conn]
    (doseq [db-id (t2/select-pks-vec :model/Database)]
      (if (:is_tenant_group group)
        (data-perms/set-external-group-permissions! group db-id)
        (data-perms/set-new-group-permissions! group db-id (u/the-id (all-users)))))))

(t2/define-after-insert :model/PermissionsGroup
  [group]
  (u/prog1 group
    (set-default-permission-values! group)))

(t2/define-before-delete :model/PermissionsGroup
  [{id :id, :as group}]
  (check-not-magic-group group)
  (setting/set-value-of-type!
   :json :ldap-group-mappings
   (when-let [mappings (setting/get :ldap-group-mappings)]
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

(methodical/defmethod t2/batched-hydrate [:model/PermissionsGroup :members]
  "Batch hydration Users for a list of PermissionsGroups"
  [_model k groups]
  (mi/instances-with-hydrated-data
   groups k
   #(group-by :group_id (t2/select :model/User {:select    [:u.id
                                                            ;; user_id is for legacy reasons, we should remove it
                                                            [:u.id :user_id]
                                                            :u.first_name
                                                            :u.last_name
                                                            :u.email
                                                            :u.is_superuser
                                                            :pgm.group_id
                                                            [:pgm.id :membership_id]
                                                            (when (premium-features/enable-advanced-permissions?)
                                                              [:pgm.is_group_manager :is_group_manager])]
                                                :from      [[:core_user :u]]
                                                :left-join [[:permissions_group_membership :pgm] [:= :u.id :pgm.user_id]]
                                                :where     [:and
                                                            [:= :u.is_active true]
                                                            [:in :pgm.group_id (map :id groups)]]
                                                :order-by  [[[:lower :u.first_name] :asc]
                                                            [[:lower :u.last_name] :asc]]}))
   :id
   {:default []}))

(defn non-admin-groups
  "Return a set of the IDs of all `PermissionsGroups`, aside from the admin group."
  []
  (t2/select :model/PermissionsGroup :magic_group_type [:not= admin-magic-group-type]))

(defn non-magic-groups
  "Return a set of the IDs of all `PermissionsGroups`, aside from the admin group and the All Users group."
  []
  (t2/select :model/PermissionsGroup {:where [:= :magic_group_type nil]}))

(defn is-tenant-group?
  "Returns a boolean representing whether this group is a tenant group."
  [group-id]
  (t2/select-one-fn :is_tenant_group :model/PermissionsGroup :id (u/the-id group-id)))

(defn- group-id->num-members
  "Return a map of `PermissionsGroup` ID -> number of members in the group. (This doesn't include entries for empty
  groups.)"
  []
  (let [results (mdb/query
                 {:select    [[:pgm.group_id :group_id] [[:count :pgm.id] :members]]
                  :from      [[:permissions_group_membership :pgm]]
                  :left-join [[:core_user :user] [:= :pgm.user_id :user.id]]
                  :where     [:= :user.is_active true]
                  :group-by  [:pgm.group_id]})]
    (zipmap
     (map :group_id results)
     (map :members results))))

(methodical/defmethod t2/batched-hydrate [:model/PermissionsGroup :member_count]
  "Efficiently add `:member_count` to PermissionGroups."
  [_model _k groups]
  (let [group-id->num-members (group-id->num-members)]
    (for [group groups]
      (assoc group :member_count (get group-id->num-members (u/the-id group) 0)))))

;;; ------------------------------------------ OSS Data Analyst Group Handling ------------------------------------------

(defn- unique-converted-group-name
  "Generate a unique name for the converted Data Analysts group.
  Returns \"Data Analysts (converted)\", or \"Data Analysts (converted) (2)\", etc."
  []
  (let [existing-names (t2/select-fn-set :name :model/PermissionsGroup
                                         :name [:like "Data Analysts (converted)%"])
        base-name      "Data Analysts (converted)"]
    (if-not (contains? existing-names base-name)
      base-name
      (loop [n 2]
        (let [candidate (str base-name " (" n ")")]
          (if-not (contains? existing-names candidate)
            candidate
            (recur (inc n))))))))

(defn- grant-library-permissions!
  "Grant write permissions on all library collections to a group."
  [group-id]
  (when-let [collection-ids (seq (t2/select-pks-set :model/Collection
                                                    :type [:in ["library" "library-data" "library-metrics"]]))]
    (t2/insert! :model/Permissions
                (for [coll-id collection-ids]
                  {:group_id group-id
                   :object   (str "/collection/" coll-id "/")}))))

(defn sync-data-analyst-group-for-oss!
  "On OSS startup, convert the Data Analysts group to a normal visible group and create a new empty magic group.

  In OSS, we don't want the Data Analysts group to be invisible while still granting permissions - that's a hidden
  backdoor. Instead, we convert any existing Data Analysts group (with members) to a normal group with a unique name
  like 'Data Analysts (converted)' that admins can see and manage. We then create a fresh empty Data Analysts magic
  group.

  This is idempotent: if the magic group has no members, nothing happens."
  []
  (when-not (premium-features/enable-data-studio?)
    (when-let [existing-group (t2/select-one :model/PermissionsGroup :magic_group_type data-analyst-magic-group-type)]
      (when (pos? (t2/count :model/PermissionsGroupMembership :group_id (:id existing-group)))
        (log/info "Converting Data Analysts group to normal group for OSS")
        (binding [*allow-modifying-magic-groups* true]
          (t2/with-transaction [_conn]
            ;; Rename and demote the existing group to a normal visible group
            (t2/update! :model/PermissionsGroup (:id existing-group)
                        {:name             (unique-converted-group-name)
                         :magic_group_type nil})
            ;; Create new empty magic group with default library permissions
            (let [{new-group-id :id} (t2/insert-returning-instance! :model/PermissionsGroup
                                                                    {:name             "Data Analysts"
                                                                     :magic_group_type data-analyst-magic-group-type})]
              (grant-library-permissions! new-group-id))
            (t2/update! :model/User {:is_data_analyst true} {:is_data_analyst false})))))))
