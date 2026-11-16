(ns metabase.permissions.models.permissions
  "Low-level Metabase permissions system definition and utility functions.

  The Metabase permissions system is based around permissions *paths* that are granted to individual
  [[metabase.permissions.models.permissions-group]]s.

  ### Core concepts

  Permissions are granted to individual [[metabase.permissions.models.permissions-group]]s, and Users are members of one or more
  Permissions Groups. Permissions Groups are like 'roles' in other permissions systems. There are a few 'magic'
  Permissions Groups: the [[metabase.permissions.models.permissions-group/all-users]] Group, of which every User is a member and
  cannot be removed; and the [[metabase.permissions.models.permissions-group/admin]] Group, of which every superuser (i.e., every
  User with `is_superuser`) is a member.

  The permissions needed to perform an action are represented as slash-delimited path strings, for example
  `/db/1/schema/PUBLIC/`. Each slash represents a different part of the permissions path, and each permissions path
  must start and end with a slash. Permissions use the same path representation for both the permissions required to
  perform an action and the permissions granted to individual Groups.

  Permissions paths use a prefix system where a User is normally allowed to perform any action if one of their Groups
  has *any* permissions entry that is a prefix for the permission required to perform that action. For example, if
  reading Database 1 requires the permission `/db/1/read/`, then the current User may perform that action if they have
  `/db/1/read/` permissions, or if they have `/db/1/`, or even full `/` superuser permissions.

  This prefix system allows us to easily and efficiently query the application database to find relevant matching
  permissions matching an path or path using `LIKE`; see [[metabase.warehouses.models.database/pre-delete]] for
  an example of the sort of efficient queries the prefix system facilitates.

  A User's permissions are answered by the bulk functions of [[metabase.permissions.collection-permissions]],
  [[metabase.permissions.application-permissions]] and the data permission namespaces, which read the rows of the
  groups they are a member of every time they are asked.

  ### Different types of permissions

  There are two main types of permissions:

  * _data permissions_ -- permissions to view, update, or run ad-hoc or SQL queries against a Database or Table.

  * _Collection permissions_ -- permissions to view/curate/etc. an
  individual [[metabase.collections.models.collection]] and the items inside it. Collection permissions apply to
  individual Collections and to any non-Collection items inside that Collection. Child Collections get their own
  permissions. Many objects such as Cards (a.k.a. *Saved Questions*) and Dashboards get their permissions from the
  Collection in which they live.

  ### Enterprise-only permissions and \"anti-permissions\"

  In addition to data permissions and Collection permissions, a User can also be granted four additional types of
  permissions.

  * _root permissions_ -- permissions for `/`, i.e. full access for everything. Automatically granted to
    the [[metabase.permissions.models.permissions-group/admin]] group that gets created on first launch. Because `/` is a prefix
    for every permissions path, admins have permissions to do everything.

  * _segmented permissions_ -- a special grant for a Table that applies sandboxing, a.k.a. row-level permissions,
    a.k.a. segmented permissions, to any queries ran by the User when that User does not have full data permissions.
    Segmented permissions allow a User to run ad-hoc MBQL queries against the Table in question; regardless of whether
    they have relevant Collection permissions, queries against the sandboxed Table are rewritten to replace the Table
    itself with a special type of nested query called a
    [[metabase-enterprise.sandbox.models.sandbox]], or _GTAP_. Note that segmented permissions are
    both additive and subtractive -- they are additive because they grant (sandboxed) ad-hoc query access for a Table,
    but subtractive in that any access thru a Saved Question will now be sandboxed as well.

    Additional things to know:

    * Sandboxed permissions are only available in Metabase® Enterprise Edition™.

    * Only one GTAP may defined per-Group per-Table (this is an application-DB-level constraint). A User may have
      multiple applicable GTAPs if they are members of multiple groups that have sandboxed anti-perms for that Table; in
      that case, the QP signals an error if multiple GTAPs apply to a given Table for the current User (see
      [[metabase-enterprise.sandbox.query-processor.middleware.sandboxing/assert-one-gtap-per-table]]).

    * Segmented (sandboxing) permissions and GTAPs are tied together, and a Group should be given both (or both
      should be deleted) at the same time. This is *not* currently enforced as a hard application DB constraint, but is
      done in the respective Toucan pre-delete actions. The QP will signal an error if the current user has segmented
      permissions but no matching GTAP exists.

    * Segmented permissions can also be used to enforce column-level permissions -- any column not returned by the
      underlying GTAP query is not allowed to be referenced by the parent query thru other means such as filter clauses.

    * GTAPs are not allowed to add columns not present in the original Table, or change their effective type to
      something incompatible (this constraint is in place so we other things continue to work transparently regardless
      of whether the Table is swapped out.) See
      [[metabase-enterprise.sandbox.models.sandbox/check-columns-match-table]]

  * *block \"anti-permissions\"* are per-Group, per-Table grants that tell Metabase to disallow running Saved
    Questions unless the User has data permissions (in other words, disregard Collection permissions). These are
    referred to as \"anti-permissions\" because they are subtractive grants that take away permissions from what the
    User would otherwise have. See the `Determining query permissions` section below for more details. As with
    segmented permissions, block anti-permissions are only available in Metabase® Enterprise Edition™.

  * _Application permissions_ -- are per-Group permissions that give non-admin users access to features like:
    change instance's Settings; access Audit, Tools, Troubleshooting ...

  ### Determining CRUD permissions in the REST API

  REST API permissions checks are generally done in various `metabase.api.*` namespaces. Whether the current User can
  perform various CRUD actions are defined by [[metabase.models.interface/can-read?]] (in the API sense, not in the
  run-query sense) and [[metabase.models.interface/can-write?]] as well as the
  newer [[metabase.models.interface/can-create?]] and [[metabase.models.interface/can-update?]] methods.
  Implementations for these methods live in `metabase.models.*` namespaces.

  The implementation of these methods is up to individual models, which hydrate `:can_read` and `:can_write` in
  batches from the bulk permission functions.

  ### Determining query permissions

  Normally, a User is allowed to view (i.e., run the query for) a Saved Question if they have read permissions for the
  Collection in which Saved Question lives, **or** if they have data permissions for the Database and Table(s) the
  Question accesses. The main idea here is that some Users with more permissions can go create a curated set of Saved
  Questions they deem appropriate for less-privileged Users to see, and put them in a Collection they can see. These
  Users would still be prevented from poking around things on their own, however.

  The Query Processor middleware in [[metabase.query-processor.middleware.permissions]],
  [[metabase-enterprise.sandbox.query-processor.middleware.sandboxing]], and
  [[metabase-enterprise.advanced-permissions.models.permissions.block-permissions]] determines whether the current
  User has permissions to run the current query. Permissions are as follows:

  | Data perms? | Coll perms? | Block? | Segmented? | Can run? |
  | ----------- | ----------- | ------ | ---------- | -------- |
  |          no |          no |     no |         no |       ⛔ |
  |          no |          no |     no |        yes |       ⚠️ |
  |          no |          no |    yes |         no |       ⛔ |
  |          no |          no |    yes |        yes |       ⚠️ |
  |          no |         yes |     no |         no |       ✅ |
  |          no |         yes |     no |        yes |       ⚠️ |
  |          no |         yes |    yes |         no |       ⛔ |
  |          no |         yes |    yes |        yes |       ⚠️ |
  |         yes |          no |     no |         no |       ✅ |
  |         yes |          no |     no |        yes |       ✅ |
  |         yes |          no |    yes |         no |       ✅ |
  |         yes |          no |    yes |        yes |       ✅ |
  |         yes |         yes |     no |         no |       ✅ |
  |         yes |         yes |     no |        yes |       ✅ |
  |         yes |         yes |    yes |         no |       ✅ |
  |         yes |         yes |    yes |        yes |       ✅ |

  (`⚠️` = runs in sandboxed mode)

  ### Known Permissions Paths

  See [[metabase.permissions.util/path-regex-v1]] for an always-up-to-date list of permissions paths.

    /collection/:id/                                ; read-write perms for a Coll and its non-Coll children
    /collection/:id/read/                           ; read-only  perms for a Coll and its non-Coll children
    /collection/root/                               ; read-write perms for the Root Coll and its non-Coll children
    /colllection/root/read/                         ; read-only  perms for the Root Coll and its non-Coll children
    /collection/namespace/:namespace/root/          ; read-write perms for the Root Coll of a non-default namespace (e.g. SQL Snippets)
    /collection/namespace/:namespace/root/read/     ; read-only  perms for the Root Coll of a non-default namespace (e.g. SQL Snippets)
    /db/:id/                                        ; full perms for a Database
    /db/:id/native/                                 ; ad-hoc native query perms for a Database
    /db/:id/schema/                                 ; ad-hoc MBQL query perms for all schemas in DB (does not include native queries)
    /db/:id/schema/:name/                           ; ad-hoc MBQL query perms for a specific schema
    /db/:id/schema/:name/table/:id/                 ; full perms for a Table
    /db/:id/schema/:name/table/:id/read/            ; perms to fetch info about this Table from the DB
    /db/:id/schema/:name/table/:id/query/           ; ad-hoc MBQL query perms for a Table
    /db/:id/schema/:name/table/:id/query/segmented/ ; allow ad-hoc MBQL queries. Sandbox all queries against this Table.
    /block/db/:id/                                  ; disallow queries against this DB unless User has data perms.
    /                                               ; full root perms"
  (:require
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.path :as permissions.path]
   [metabase.permissions.util :as perms.u]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    UTIL FNS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- Dynamic Vars --------------------------------------------------

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^Boolean *allow-root-entries*
  "Should we allow permissions entries like `/`? By default, this is disallowed, but you can temporarily disable it here
   when creating the default entry for `Admin`."
  false)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^Boolean *allow-admin-permissions-changes*
  "Should we allow changes to be made to permissions belonging to the Admin group? By default this is disabled to
   prevent accidental tragedy, but you can enable it here when creating the default entry for `Admin`."
  false)

;;; --------------------------------------------------- Assertions ---------------------------------------------------

(defn- assert-not-admin-group
  "Check to make sure the `:group_id` for `permissions` entry isn't the admin group."
  [{:keys [group_id]}]
  (when (and (= group_id (:id (perms-group/admin)))
             (not *allow-admin-permissions-changes*))
    (throw (ex-info (tru "You cannot create or revoke permissions for the ''Admin'' group.")
                    {:status-code 400}))))

(defn- assert-valid-object
  "Check to make sure the value of `:object` for `permissions` entry is valid."
  [{:keys [object]}]
  (when (and object
             (not (perms.u/valid-path? object))
             (or (not= object "/")
                 (not *allow-root-entries*)))
    (throw (ex-info (tru "Invalid permissions object path: ''{0}''." object)
                    {:status-code 400, :path object}))))

(defn- assert-valid
  "Check to make sure this `permissions` entry is something that's allowed to be saved (i.e. it has a valid `:object`
   path and it's not for the admin group)."
  [permissions]
  (doseq [f [assert-not-admin-group
             assert-valid-object]]
    (f permissions)))

;;; -------------------------------------------- Permissions Checking Fns --------------------------------------------

(mu/defn collection-read-access-group-ids :- [:set ms/PositiveInt]
  "Set of `PermissionsGroup` ids holding a stored read (or read-write) permission row for the collection with
  `collection-id`, or for the Root Collection when `collection-id` is `nil`. Reflects explicit grant rows only, so
  groups whose access is implicit don't appear: the Administrators group never does (it has no stored collection
  rows in normal operation), and collections that don't use grant rows at all (personal collections and their
  descendants, trash) return an empty set."
  [collection-id :- [:maybe ms/PositiveInt]]
  (let [collection-or-root (or collection-id
                               {:metabase.collections.models.collection.root/is-root? true})]
    (or (permissions.db/group-ids-with-permission-objects
         [(permissions.path/collection-read-path collection-or-root)
          (permissions.path/collection-readwrite-path collection-or-root)])
        #{})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               ENTITY + LIFECYCLE                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(methodical/defmethod t2/table-name :model/Permissions [_model] :permissions)

(derive :model/Permissions :metabase/model)

(defn- maybe-break-out-permission-data
  "Given a `Permissions` model, add `:collection_id`, `:perm_type`, and `:perm_value` iff we know how to break that out."
  [permissions]
  (let [[match? coll-id-str read?] (re-matches #"^/collection/(\d+)/(read/)?" (:object permissions))]
    (cond-> permissions
      match? (assoc :collection_id (parse-long coll-id-str)
                    :perm_type :perms/collection-access
                    :perm_value (if read?
                                  :read
                                  :read-and-write)))))

(t2/define-before-insert :model/Permissions
  [permissions]
  (u/prog1 (maybe-break-out-permission-data permissions)
    (assert-valid permissions)
    (log/debug (u/format-color :green "Granting permissions for group %s: %s" (:group_id permissions) (:object permissions)))))

(t2/deftransforms :model/Permissions
  {:perm_type mi/transform-keyword
   :perm_value mi/transform-keyword})

(t2/define-before-update :model/Permissions
  [_]
  (throw (Exception. (tru "You cannot update a permissions entry! Delete it and create a new one."))))

(t2/define-before-delete :model/Permissions
  [permissions]
  (log/debug (u/format-color :red "Revoking permissions for group %s: %s" (:group_id permissions) (:object permissions)))
  (assert-not-admin-group permissions))

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(mu/defn delete-related-permissions!
  "Delete all 'related' permissions for `group-or-id` (i.e., perms that grant you full or partial access to `path`).
  This includes *both* ancestor and descendant paths. For example:

  Suppose we asked this functions to delete related permissions for `/db/1/schema/PUBLIC/`. Depending on the
  permissions the group has, it could end up doing something like:

    *  deleting `/db/1/` permissions (because the ancestor perms implicitly grant you full perms for `schema/PUBLIC`)
    *  deleting perms for `/db/1/schema/PUBLIC/table/2/` (because Table 2 is a descendant of `schema/PUBLIC`)

  In short, it will delete any permissions that contain `/db/1/schema/` as a prefix, or that themeselves are prefixes
  for `/db/1/schema/`.

  NOTE: This function is meant for internal usage in this namespace only; use one of the other functions like
  `revoke-data-perms!` elsewhere instead of calling this directly."
  [group-or-id :- permissions.path/GroupOrID path :- perms.u/PathSchema]
  (let [group-id (u/the-id group-or-id)
        paths    (conj (perms.u/->v2-path path) path)]
    (when-let [revoked (permissions.db/related-permission-objects group-id path paths)]
      (log/debug (u/format-color 'red "Revoking permissions for group %d: %s" group-id revoked))
      (permissions.db/delete-related-permissions! group-id path paths))))

(defn grant-permissions!
  "Grant the permissions `path` gives to `group-or-id`, returning nil."
  [group-or-id path]
  (try
    (permissions.db/insert-permissions! (map (fn [path-object]
                                               {:group_id (u/the-id group-or-id) :object path-object})
                                             (distinct (conj (perms.u/->v2-path path) path))))
    nil
    ;; on some occasions through weirdness we might accidentally try to insert a key that's already been inserted
    (catch Throwable e
      (log/error (u/format-color 'red "Failed to grant permissions: %s" (ex-message e)))
      ;; if we're running tests, we're doing something wrong here if duplicate permissions are getting assigned,
      ;; mostly likely because tests aren't properly cleaning up after themselves, and possibly causing other tests
      ;; to pass when they shouldn't. Don't allow this during tests
      (when config/is-test?
        (throw e)))))

;;;; Audit Permissions helper fns

(def namespace-clause
  "SQL clause to filter namespaces depending on if audit app is enabled or not, and if the namespace is the default one."
  permissions.db/namespace-clause)

(defn revoke-application-permissions!
  "Remove all permissions entries for a Group to access a Application permissions"
  [group-or-id perm-type]
  (delete-related-permissions! group-or-id (permissions.path/application-perms-path perm-type)))

(defn grant-application-permissions!
  "Grant full permissions for a group to access a Application permissions."
  [group-or-id perm-type]
  (when (and (perms-group/is-tenant-group? group-or-id)
             (not= perm-type :subscription))
    (throw (ex-info (tru "Cannot grant application permission to a tenant group.") {})))
  (grant-permissions! group-or-id (permissions.path/application-perms-path perm-type)))

;; TODO: We really have to figure out a better solution to these circular dependencies than this
(defn- is-personal-collection-or-descendant-of-one? [collection]
  ((requiring-resolve 'metabase.collections.models.collection/is-personal-collection-or-descendant-of-one?) collection))

(defn- is-trash-or-descendant? [collection]
  ((requiring-resolve 'metabase.collections.models.collection/is-trash-or-descendant?) collection))

(defn- shared-tenant-collection?
  [collection]
  ((requiring-resolve 'metabase.collections.models.collection/shared-tenant-collection?) collection))

(defn- ^:private collection-or-id->collection
  [collection-or-id]
  (if (map? collection-or-id)
    collection-or-id
    (permissions.db/collection (u/the-id collection-or-id))))

(mu/defn- check-is-modifiable-collection
  "Check whether `collection-or-id` refers to a collection that can have permissions modified. Personal collections, the
  Trash, and descendants of those can't have their permissions modified."
  [collection-or-id :- permissions.path/CollectionOrID]
  ;; skip the whole thing for the root collection, we know it's not a personal collection, trash, or descendant of one
  ;; of them.
  (when-not (:metabase.collections.models.collection.root/is-root? collection-or-id)
    (let [collection (collection-or-id->collection collection-or-id)]
      ;; Check whether the collection is the Trash collection or a descendant thereof; if so, throw an Exception. This
      ;; is done because you can't modify the permissions of things in the Trash, you need to untrash them first.
      (when (is-trash-or-descendant? collection)
        (throw (ex-info (tru "You cannot edit permissions for the Trash collection or its descendants.") {})))
      ;; Check whether the collection is a personal collection or a descendant thereof; if so, throw an Exception.
      ;; This is done because we *should* never be editing granting/etc. permissions for *Personal* Collections to
      ;; entire Groups! Their owner will get implicit permissions automatically, and of course admins will be able to
      ;; see them,but a whole group should never be given some sort of access.
      (when (is-personal-collection-or-descendant-of-one? collection)
        (throw (ex-info (tru "You cannot edit permissions for a Personal Collection or its descendants.") {}))))))

(mu/defn revoke-collection-permissions!
  "Revoke all access for `group-or-id` to a Collection."
  [group-or-id :- permissions.path/GroupOrID collection-or-id :- permissions.path/CollectionOrID]
  (check-is-modifiable-collection collection-or-id)
  (delete-related-permissions! group-or-id (permissions.path/collection-readwrite-path collection-or-id)))

(mu/defn grant-collection-readwrite-permissions!
  "Grant full access to a Collection, which means a user can view all Cards in the Collection and add/remove Cards."
  [group-or-id :- permissions.path/GroupOrID collection-or-id :- permissions.path/CollectionOrID]
  (check-is-modifiable-collection collection-or-id)
  (when (perms-group/is-tenant-group? group-or-id)
    (throw (ex-info (tru "Tenant groups cannot have write access to any collections.") {})))
  (grant-permissions! (u/the-id group-or-id) (permissions.path/collection-readwrite-path collection-or-id)))

(mu/defn grant-collection-read-permissions!
  "Grant read access to a Collection, which means a user can view all Cards in the Collection."
  [group-or-id :- permissions.path/GroupOrID collection-or-id :- permissions.path/CollectionOrID]
  (check-is-modifiable-collection collection-or-id)
  (let [collection (collection-or-id->collection collection-or-id)]
    (when (perms-group/is-tenant-group? group-or-id)
      (when-not (or (shared-tenant-collection? collection)
                    ;; Tenant groups access data apps through read grants on its resource collection.
                    (and (pos-int? (:id collection))
                         (data-perms/collection-owned-by-data-app? (:id collection))))
        (throw (ex-info (tru "Tenant groups cannot receive access to non-tenant collections.") {})))))
  (grant-permissions! (u/the-id group-or-id) (permissions.path/collection-read-path collection-or-id)))

(defenterprise current-user-has-application-permissions?
  "Check if `*current-user*` has permissions for a application permissions of type `perm-type`.
  This is a paid feature so it's `false` for OSS instances."
  metabase-enterprise.advanced-permissions.common
  [_instance]
  false)
