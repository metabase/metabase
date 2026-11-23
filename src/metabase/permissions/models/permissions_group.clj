(ns metabase.permissions.models.permissions-group
  "A `PermissionsGroup` is a group (or role) that can be assigned certain permissions. Users can be members of one or
  more of these groups.

  A few 'magic' groups exist: [[all-users]], which predicably contains All Users; and [[admin]], which contains all
  superusers. These groups are 'magic' in the sense that you cannot add users to them yourself, nor can you delete
  them; they are created automatically. You can, however, set permissions for them.

  See documentation in [[metabase.permissions.models.permissions]] for more information about the Metabase permissions system."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.config.core :as config]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.before-update :as t2.before-update]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/PermissionsGroup [_model] :permissions_group)
(methodical/defmethod t2/model-for-automagic-hydration [:default :permissions_group] [_original-model _k] :model/PermissionsGroup)
(methodical/defmethod t2.hydrate/fk-keys-for-automagic-hydration [:default :permissions_group :default]
  [_original-model _dest-key _hydrating-model]
  [:permissions_group_id])

(doto :model/PermissionsGroup
  (derive :metabase/model)
  (derive :hook/entity-id))

;;; -------------------------------------------- Magic Groups Getter Fns ---------------------------------------------

(defn- magic-group [magic-group-type]
  (mdb/memoize-for-application-db
   (fn []
     (u/prog1 (permissions.db/magic-group magic-group-type)
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

(defn group-display-name
  "The group's display name, with internal membership explicit when tenants are enabled."
  [{:keys [magic_group_type name]} using-tenants?]
  (if (and (= magic_group_type all-users-magic-group-type) using-tenants?)
    "All internal users"
    name))

(def ^{:arglists '([])} data-analyst
  "Fetch the `Data Analysts` permissions group"
  (magic-group data-analyst-magic-group-type))

;;; ---------------------------------------------------- Util Fns ----------------------------------------------------

(defn exists-with-name?
  "Does a `PermissionsGroup` with `group-name` exist in the DB? (case-insensitive)"
  ^Boolean [group-name]
  {:pre [((some-fn keyword? string?) group-name)]}
  (permissions.db/group-exists-with-lower-name? (u/lower-case-en (name group-name))))

(defn non-admin-groups
  "Return a set of the IDs of all `PermissionsGroups`, aside from the admin group."
  []
  (permissions.db/groups-except-magic-type admin-magic-group-type))

(defn non-magic-groups
  "Return a set of the IDs of all `PermissionsGroups`, aside from the admin group and the All Users group."
  []
  (permissions.db/non-magic-groups))

(defn is-tenant-group?
  "Returns a boolean representing whether this group is a tenant group."
  [group-id]
  (permissions.db/tenant-group? (u/the-id group-id)))

(defn hidden-tenant-group-ids
  "Returns the subset of `group-ids` that are tenant groups while the Tenants feature is disabled
  (i.e. invisible to API consumers right now). Returns an empty set if the feature is enabled, or
  if no supplied IDs are tenant groups."
  [group-ids]
  (if (or (setting/get :use-tenants) (empty? group-ids))
    #{}
    (set/intersection (set (map u/the-id group-ids))
                      (permissions.db/tenant-group-ids))))

(defn check-tenant-groups-visible
  "Throws a 400 if any of `group-ids` is a tenant group while the Tenants feature is disabled.
  The error payload includes the offending IDs under `[:errors :tenant-group-ids]`."
  [group-ids]
  (when-let [offending (seq (hidden-tenant-group-ids group-ids))]
    (throw (ex-info (tru "Tenant groups are not editable while the Tenants feature is disabled.")
                    {:status-code 400
                     :errors      {:tenant-group-ids (sort offending)}}))))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-not-magic-group
  "Throws a 400 when `group`, a stored PermissionsGroup, is one of the built-in groups, which its row says through its
  `:magic_group_type`."
  [{:keys [magic_group_type name]}]
  (when magic_group_type
    (throw (ex-info (tru "You cannot edit or delete the ''{0}'' permissions group!" name)
                    {:status-code 400}))))

(t2/define-before-update :model/PermissionsGroup
  [group]
  (let [changes (t2/changes group)]
    (when (contains? changes :name)
      (check-not-magic-group (t2/original group)))
    (when (contains? changes :is_tenant_group)
      (throw (ex-info (tru "You cannot change whether a group is a tenant group.") {:status-code 400})))
    (when (contains? changes :magic_group_type)
      (throw (ex-info (tru "You cannot change the type of a group.") {:status-code 400})))
    group))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn manageable-group-id-fn
  "A predicate over group ids answering whether the current user manages the group, as a superuser for every group or
  with advanced permissions as its group manager, answered for all groups with at most one query."
  []
  (cond
    api/*is-superuser?*
    (constantly true)

    (and (premium-features/enable-advanced-permissions?)
         config/ee-available?
         api/*current-user-id*)
    (let [managed-ids (set (permissions.db/managed-group-ids api/*current-user-id*))]
      (fn [group-id] (contains? managed-ids group-id)))

    :else
    (constantly false)))

(methodical/defmethod t2/batched-hydrate [:model/PermissionsGroup :can_read]
  "Whether the current user can read each of `groups`, which they can when they manage it."
  [_model k groups]
  (let [manages? (manageable-group-id-fn)]
    (for [group groups]
      (when group
        (vary-meta group assoc k (manages? (:id group)))))))

(methodical/defmethod t2/batched-hydrate [:model/PermissionsGroup :can_write]
  "Whether the current user can write each of `groups`, which they can when they manage it."
  [_model k groups]
  (let [manages? (manageable-group-id-fn)]
    (for [group groups]
      (when group
        (assoc group k (manages? (:id group)))))))

(defmethod mi/can-create? :model/PermissionsGroup
  [_model _group]
  (boolean api/*is-superuser?*))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/PermissionsGroup :members]
  "Batch hydration Users for a list of PermissionsGroups"
  [_model k groups]
  (mi/instances-with-hydrated-data
   groups k
   ;; `user_id` in the result is for legacy reasons, we should remove it
   #(group-by :group_id (permissions.db/group-members (map :id groups)
                                                      (boolean (premium-features/enable-advanced-permissions?))))
   :id
   {:default []}))

(defn- group-id->num-members
  "Return a map of `PermissionsGroup` ID -> number of members in the group. (This doesn't include entries for empty
  groups.)"
  []
  (permissions.db/group-member-counts))

(methodical/defmethod t2/batched-hydrate [:model/PermissionsGroup :member_count]
  "Efficiently add `:member_count` to PermissionGroups."
  [_model _k groups]
  (let [group-id->num-members (group-id->num-members)]
    (for [group groups]
      (assoc group :member_count (get group-id->num-members (u/the-id group) 0)))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- check-names-not-already-taken
  "Throws a 400 unless `group-names` satisfy these rules, compared lower-cased:

  - no two of them are the same
  - none is the name of an existing group"
  [group-names]
  (let [lower-names (mapv u/lower-case-en group-names)]
    (when (or (not (apply distinct? lower-names))
              (permissions.db/group-exists-with-lower-names? lower-names))
      (throw (ex-info (tru "A group with that name already exists.") {:status-code 400})))))

(defn- remove-from-ldap-group-mappings!
  "Drop the groups with `group-ids` from every mapping of the `ldap-group-mappings` setting."
  [group-ids]
  (let [group-ids (set group-ids)]
    (setting/set-value-of-type!
     :json :ldap-group-mappings
     (when-let [mappings (setting/get :ldap-group-mappings)]
       (zipmap (keys mappings)
               (for [val (vals mappings)]
                 (remove group-ids val)))))))

(defn- insert-permissions-groups!
  "Insert the PermissionsGroup `rows`, each with the default permissions on every Database, and return them in order."
  [rows]
  (u/prog1 (permissions.db/insert-permissions-groups! rows)
    (data-perms/with-global-permissions-lock
      (data-perms/set-default-groups-permissions! <> (permissions.db/non-destination-database-ids)))))

(mu/defn create-permissions-groups! :- [:sequential ::permissions.schema/permissions-group]
  "Insert the PermissionsGroup `rows`, each with the default permissions on every Database, in one transaction and
  return them in order, publishing their create event; the name of an existing group is a 400."
  [rows :- [:sequential ::permissions.schema/permissions-group.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (check-names-not-already-taken (map :name rows))
      (let [created (into [] (mapcat (comp insert-permissions-groups! vec))
                          (partition-all mdb/create-partition-size rows))]
        (events/publish-event! :event/group-create (events/create-event created))
        created))))

(defn- rename-order
  "The rows of `updates`, whose stored PermissionsGroups `stored` holds, in an order in which each rename comes after the rename
  that frees its name, comparing names lower-cased, or nil when the renames take each other's names in a cycle."
  [stored updates]
  (let [stored-name #(u/lower-case-en (:name (stored (:id %))))
        new-name    #(some-> (:name %) u/lower-case-en)]
    (loop [pending (vec updates), ordered []]
      (if (empty? pending)
        ordered
        (let [held   (into #{} (map stored-name) pending)
              ready? (fn [row] (or (nil? (new-name row)) (= (new-name row) (stored-name row)) (not (held (new-name row)))))
              ready  (filterv ready? pending)]
          (when (seq ready)
            (recur (filterv (complement ready?) pending) (into ordered ready))))))))

(defn- check-group-updates
  "Throws a 400 unless every row of `updates`, whose stored PermissionsGroups `stored` holds, satisfies these rules,
  with the refusal of the first row that breaks one, in this order for each:

  - a rename does not take the name of an earlier rename of the batch, compared lower-cased
  - a rename does not take the name of a group as it stands after the renames of the batch, compared lower-cased, so
    a name another row of the batch renames away is free
  - the hooks of the group accept the row merged into its stored row (a magic group keeps its name)
  - the renames of the batch do not take each other's names in a cycle"
  [stored updates]
  (let [renames (filterv #(and (contains? % :name) (not= (:name %) (:name (stored (:id %))))) updates)
        taken   (if (seq renames)
                  (permissions.db/lower-names-taken-outside (mapv (comp u/lower-case-en :name) renames) (mapv :id renames))
                  #{})
        renamed (into #{} (map :id) renames)]
    (reduce (fn [earlier-names {id :id :as row}]
              (let [lower-name (some-> (:name row) u/lower-case-en)]
                (when (and (renamed id) (or (taken lower-name) (earlier-names lower-name)))
                  (throw (ex-info (tru "A group with that name already exists.") {:status-code 400})))
                (t2.before-update/before-update :model/PermissionsGroup (merge (stored id) (dissoc row :id)))
                (cond-> earlier-names (renamed id) (conj lower-name))))
            #{}
            updates)
    (when (nil? (rename-order stored updates))
      (throw (ex-info (tru "A group with that name already exists.") {:status-code 400})))))

(defn- write-group-updates!
  "Write `updates` over the `stored` PermissionsGroups, a statement per row, each rename after the one that frees its
  name."
  [stored updates]
  (permissions.db/update-permissions-groups! (rename-order stored updates)))

(defn- update-group-batch!
  "Check and apply the `batch` of updates whose PermissionsGroups exist, returning them with their stored groups."
  [batch]
  (let [stored  (u/index-by :id (permissions.db/permissions-groups-by-ids (mapv :id batch)))
        updates (filterv (comp stored :id) batch)]
    (check-group-updates stored updates)
    (write-group-updates! stored updates)
    {:stored stored :updates updates}))

(mu/defn update-permissions-groups! :- [:sequential ::permissions.schema/permissions-group.update]
  "Apply the `rows`, each an `:id` and its changes, to their PermissionsGroups in one transaction and return the rows
  that exist, publishing their update event; renaming a magic group, or to the name of an existing group or of another
  row, is a 400."
  [rows :- [:sequential ::permissions.schema/permissions-group.update]]
  (t2/with-transaction [_conn]
    (let [written (mapv update-group-batch! (partition-all mdb/update-partition-size rows))
          stored  (into {} (map :stored) written)
          updates (into [] (mapcat :updates) written)]
      (when (seq updates)
        (events/publish-event! :event/group-update (events/update-event stored updates)))
      updates)))

(defn- check-groups-deletable
  "Throws a 400 unless every one of the `groups` satisfies these rules:

  - it is not a magic group"
  [groups]
  (run! check-not-magic-group groups))

(mu/defn delete-permissions-groups! :- :nil
  "Delete the PermissionsGroups with `ids` in one transaction and drop them from the LDAP group mappings, publishing
  their delete event; deleting a magic group is a 400."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (let [batches (mapv vec (partition-all mdb/delete-partition-size ids))
            by-id   (u/index-by :id (into [] (mapcat permissions.db/permissions-groups-by-ids) batches))
            groups  (into [] (comp (keep by-id) (distinct)) ids)]
        (when (seq groups)
          (check-groups-deletable groups)
          (remove-from-ldap-group-mappings! (map :id groups))
          (events/publish-event! :event/group-delete (events/delete-event groups))
          (run! permissions.db/delete-permissions-groups! batches)))))
  nil)

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/PermissionsGroup [_model]
  {:skip? false})

(defmethod change-log/spec :model/PermissionsGroup [_model]
  {:track [:name :entity_id :magic_group_type :is_tenant_group]
   :skip  []})

(defmethod audit/spec :model/PermissionsGroup [_model]
  {:track          [:id :name :is_tenant_group :magic_group_type]
   :track-redacted []
   :skip           [:entity_id]})

(defmethod eid-translation/spec :model/PermissionsGroup [_model]
  {:names [:permissions-group]})
