(ns metabase.models.permissions
  "Low-level Metabase permissions system definition and utility functions.

  The Metabase permissions system is based around permissions *paths* that are granted to individual
  [[metabase.models.permissions-group]]s.

  ### Core concepts

  Permissions are granted to individual [[metabase.models.permissions-group]]s, and Users are members of one or more
  Permissions Groups. Permissions Groups are like 'roles' in other permissions systems. There are a few 'magic'
  Permissions Groups: the [[metabase.models.permissions-group/all-users]] Group, of which every User is a member and
  cannot be removed; and the [[metabase.models.permissions-group/admin]] Group, of which every superuser (i.e., every
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
  permissions matching an path or path using `LIKE`; see [[metabase.models.database/pre-delete]] for
  an example of the sort of efficient queries the prefix system facilitates.

  The union of all permissions the current User's gets from all groups of which they are a member are automatically
  bound to [[metabase.api.common/*current-user-permissions-set*]] by
  [[metabase.server.middleware.session/bind-current-user]] for every REST API request, and in other places when
  queries are ran in a non-API thread (e.g. for scheduled Dashboard Subscriptions).

  ### Different types of permissions

  There are two main types of permissions:

  * _data permissions_ -- permissions to view, update, or run ad-hoc or SQL queries against a Database or Table.

  * _Collection permissions_ -- permissions to view/curate/etc. an individual [[metabase.models.collection]] and the
    items inside it. Collection permissions apply to individual Collections and to any non-Collection items inside that
    Collection. Child Collections get their own permissions. Many objects such as Cards (a.k.a. *Saved Questions*) and
    Dashboards get their permissions from the Collection in which they live.

  ### Enterprise-only permissions and \"anti-permissions\"

  In addition to data permissions and Collection permissions, a User can also be granted four additional types of
  permissions.

  * _root permissions_ -- permissions for `/`, i.e. full access for everything. Automatically granted to
    the [[metabase.models.permissions-group/admin]] group that gets created on first launch. Because `/` is a prefix
    for every permissions path, admins have permissions to do everything.

  * _segmented permissions_ -- a special grant for a Table that applies sandboxing, a.k.a. row-level permissions,
    a.k.a. segmented permissions, to any queries ran by the User when that User does not have full data permissions.
    Segmented permissions allow a User to run ad-hoc MBQL queries against the Table in question; regardless of whether
    they have relevant Collection permissions, queries against the sandboxed Table are rewritten to replace the Table
    itself with a special type of nested query called a
    [[metabase-enterprise.sandbox.models.group-table-access-policy]], or _GTAP_. Note that segmented permissions are
    both additive and subtractive -- they are additive because they grant (sandboxed) ad-hoc query access for a Table,
    but subtractive in that any access thru a Saved Question will now be sandboxed as well.

    Additional things to know:

    * Sandboxed permissions are only available in Metabase® Enterprise Edition™.

    * Only one GTAP may defined per-Group per-Table (this is an application-DB-level constraint). A User may have
      multiple applicable GTAPs if they are members of multiple groups that have sandboxed anti-perms for that Table; in
      that case, the QP signals an error if multiple GTAPs apply to a given Table for the current User (see
      [[metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions/assert-one-gtap-per-table]]).

    * Segmented (sandboxing) permissions and GTAPs are tied together, and a Group should be given both (or both
      should be deleted) at the same time. This is *not* currently enforced as a hard application DB constraint, but is
      done in the respective Toucan pre-delete actions. The QP will signal an error if the current user has segmented
      permissions but no matching GTAP exists.

    * Segmented permissions can also be used to enforce column-level permissions -- any column not returned by the
      underlying GTAP query is not allowed to be referenced by the parent query thru other means such as filter clauses.
      See [[metabase-enterprise.sandbox.query-processor.middleware.column-level-perms-check]].

    * GTAPs are not allowed to add columns not present in the original Table, or change their effective type to
      something incompatible (this constraint is in place so we other things continue to work transparently regardless
      of whether the Table is swapped out.) See
      [[metabase-enterprise.sandbox.models.group-table-access-policy/check-columns-match-table]]

  * *block \"anti-permissions\"* are per-Group, per-Table grants that tell Metabase to disallow running Saved
    Questions unless the User has data permissions (in other words, disregard Collection permissions). These are
    referred to as \"anti-permissions\" because they are subtractive grants that take away permissions from what the
    User would otherwise have. See the `Determining query permissions` section below for more details. As with
    segmented permissions, block anti-permissions are only available in Metabase® Enterprise Edition™.

  * _Application permisisons_ -- are per-Group permissions that give non-admin users access to features like:
    change instance's Settings; access Audit, Tools, Troubleshooting ...

  ### Determining CRUD permissions in the REST API

  REST API permissions checks are generally done in various `metabase.api.*` namespaces. Whether the current User can
  perform various CRUD actions are defined by [[metabase.models.interface/can-read?]] (in the API sense, not in the
  run-query sense) and [[metabase.models.interface/can-write?]] as well as the
  newer [[metabase.models.interface/can-create?]] and [[metabase.models.interface/can-update?]] methods.
  Implementations for these methods live in `metabase.models.*` namespaces.

  The implementation of these methods is up to individual models. The majority of implementations check whether
  [[metabase.api.common/*current-user-permissions-set*]] includes permissions for a given path (action)
  using [[set-has-full-permissions?]], or for a set of paths using [[set-has-full-permissions-for-set?]].

  Other implementations check whether a user has _partial permissions_ for a path or set
  using [[set-has-partial-permissions?]] or [[set-has-partial-permissions-for-set?]]. Partial permissions means that
  the User has permissions for some subpath of the path in question, e.g. `/db/1/read/` is considered to be partial
  permissions for `/db/1/`. For example the [[metabase.models.interface/can-read?]] implementation for Database checks
  whether the current User has *any* permissions for that Database; a User can fetch Database 1 from API
  endpoints (\"read\" it) if they have any permissions starting with `/db/1/`, for example `/db/1/` itself (full
  permissions) `/db/1/native/` (ad-hoc SQL query permissions) or permissions, or
  `/db/1/schema/PUBLIC/table/2/query/` (run ad-hoc queries against Table 2 permissions).

  ### Determining query permissions

  Normally, a User is allowed to view (i.e., run the query for) a Saved Question if they have read permissions for the
  Collection in which Saved Question lives, **or** if they have data permissions for the Database and Table(s) the
  Question accesses. The main idea here is that some Users with more permissions can go create a curated set of Saved
  Questions they deem appropriate for less-privileged Users to see, and put them in a Collection they can see. These
  Users would still be prevented from poking around things on their own, however.

  The Query Processor middleware in [[metabase.query-processor.middleware.permissions]],
  [[metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions]], and
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

  See [[path-regex-v1]] for an always-up-to-date list of permissions paths.

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
   [clojure.string :as str]
   [metabase.audit :as audit]
   [metabase.config :as config]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.permissions.util :as perms.u]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    UTIL FNS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- Dynamic Vars --------------------------------------------------

(def ^:dynamic ^Boolean *allow-root-entries*
  "Should we allow permissions entries like `/`? By default, this is disallowed, but you can temporarily disable it here
   when creating the default entry for `Admin`."
  false)

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


;;; ------------------------------------------------- Path Util Fns --------------------------------------------------

(def ^:private MapOrID
  [:or :map ms/PositiveInt])

(mu/defn collection-readwrite-path :- perms.u/PathSchema
  "Return the permissions path for *readwrite* access for a `collection-or-id`."
  [collection-or-id :- MapOrID]
  (if-not (get collection-or-id :metabase.models.collection.root/is-root?)
    (format "/collection/%d/" (u/the-id collection-or-id))
    (if-let [collection-namespace (:namespace collection-or-id)]
      (format "/collection/namespace/%s/root/" (perms.u/escape-path-component (u/qualified-name collection-namespace)))
      "/collection/root/")))

(mu/defn collection-read-path :- perms.u/PathSchema
  "Return the permissions path for *read* access for a `collection-or-id`."
  [collection-or-id :- MapOrID]
  (str (collection-readwrite-path collection-or-id) "read/"))


(mu/defn application-perms-path :- perms.u/PathSchema
  "Returns the permissions path for *full* access a application permission."
  [perm-type]
  (case perm-type
    :setting
    "/application/setting/"

    :monitoring
    "/application/monitoring/"

    :subscription
    "/application/subscription/"))

;;; -------------------------------------------- Permissions Checking Fns --------------------------------------------

(defn is-permissions-for-object?
  "Does `permissions-path` grant *full* access for `path`?"
  [permissions-path path]
  (str/starts-with? path permissions-path))

(defn is-partial-permissions-for-object?
  "Does `permissions-path` grant access full access for `path` *or* for a descendant of `path`?"
  [permissions-path path]
  (or (is-permissions-for-object? permissions-path path)
      (str/starts-with? permissions-path path)))

(defn set-has-full-permissions?
  "Does `permissions-set` grant *full* access to object with `path`?"
  ^Boolean [permissions-set path]
  (boolean (some #(is-permissions-for-object? % path) permissions-set)))

(defn set-has-partial-permissions?
  "Does `permissions-set` grant access full access to object with `path` *or* to a descendant of it?"
  ^Boolean [permissions-set path]
  (boolean (some #(is-partial-permissions-for-object? % path) permissions-set)))

(mu/defn set-has-full-permissions-for-set? :- :boolean
  "Do the permissions paths in `permissions-set` grant *full* access to all the object paths in `paths-set`?"
  [permissions-set paths-set]
  (every? (partial set-has-full-permissions? permissions-set)
          paths-set))

(mu/defn set-has-partial-permissions-for-set? :- :boolean
  "Do the permissions paths in `permissions-set` grant *partial* access to all the object paths in `paths-set`?
   (`permissions-set` must grant partial access to *every* object in `paths-set` set)."
  [permissions-set paths-set]
  (every? (partial set-has-partial-permissions? permissions-set)
          paths-set))

(mu/defn set-has-application-permission-of-type? :- :boolean
  "Does `permissions-set` grant *full* access to a application permission of type `perm-type`?"
  [permissions-set perm-type]
  (set-has-full-permissions? permissions-set (application-perms-path perm-type)))

(mu/defn perms-objects-set-for-parent-collection :- [:set perms.u/PathSchema]
  "Implementation of `perms-objects-set` for models with a `collection_id`, such as Card, Dashboard, or Pulse.
  This simply returns the `perms-objects-set` of the parent Collection (based on `collection_id`) or for the Root
  Collection if `collection_id` is `nil`."
  ([this read-or-write]
   (perms-objects-set-for-parent-collection nil this read-or-write))

  ([collection-namespace :- [:maybe ms/KeywordOrString]
    this                 :- [:map
                             [:collection_id [:maybe ms/PositiveInt]]]
    read-or-write        :- [:enum :read :write]]
   ;; based on value of read-or-write determine the approprite function used to calculate the perms path
   (let [path-fn (case read-or-write
                   :read  collection-read-path
                   :write collection-readwrite-path)]
     ;; now pass that function our collection_id if we have one, or if not, pass it an object representing the Root
     ;; Collection
     #{(path-fn (or (:collection_id this)
                    {:metabase.models.collection.root/is-root? true
                     :namespace                                collection-namespace}))})))

(doto ::use-parent-collection-perms
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

(defmethod mi/perms-objects-set ::use-parent-collection-perms
  [instance read-or-write]
  (perms-objects-set-for-parent-collection instance read-or-write))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               ENTITY + LIFECYCLE                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def Permissions
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/Permissions)

(methodical/defmethod t2/table-name :model/Permissions [_model] :permissions)

(derive :model/Permissions :metabase/model)

(t2/define-before-insert :model/Permissions
  [permissions]
  (u/prog1 permissions
    (assert-valid permissions)
    (log/debug (u/format-color :green "Granting permissions for group %s: %s" (:group_id permissions) (:object permissions)))))

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

  Suppose we asked this functions to delete related permssions for `/db/1/schema/PUBLIC/`. Depending on the
  permissions the group has, it could end up doing something like:

    *  deleting `/db/1/` permissions (because the ancestor perms implicity grant you full perms for `schema/PUBLIC`)
    *  deleting perms for `/db/1/schema/PUBLIC/table/2/` (because Table 2 is a descendant of `schema/PUBLIC`)

  In short, it will delete any permissions that contain `/db/1/schema/` as a prefix, or that themeselves are prefixes
  for `/db/1/schema/`.

  You can optionally include `other-conditions`, which are anded into the filter clause, to further restrict what is
  deleted.

  NOTE: This function is meant for internal usage in this namespace only; use one of the other functions like
  `revoke-data-perms!` elsewhere instead of calling this directly."
  {:style/indent 2}
  [group-or-id :- [:or :map ms/PositiveInt] path :- perms.u/PathSchema & other-conditions]
  (let [paths (conj (perms.u/->v2-path path) path)
        where {:where (apply list
                             :and
                             [:= :group_id (u/the-id group-or-id)]
                             (into [:or
                                    [:like path (h2x/concat :object (h2x/literal "%"))]]
                                   (map (fn [path-form] [:like :object (str path-form "%")])
                                        paths))
                             other-conditions)}]
    (when-let [revoked (t2/select-fn-set :object Permissions where)]
      (log/debug (u/format-color 'red "Revoking permissions for group %d: %s" (u/the-id group-or-id) revoked))
      (t2/delete! Permissions where))))

(defn grant-permissions!
  "Grant permissions for `group-or-id` and return the inserted permissions. Two-arity grants any arbitrary Permissions `path`.
  With > 2 args, grants the data permissions from calling [[data-perms-path]]."
  ([group-or-id path]
   (try
     (t2/insert-returning-instances! Permissions
                                     (map (fn [path-object]
                                            {:group_id (u/the-id group-or-id) :object path-object})
                                          (distinct (conj (perms.u/->v2-path path) path))))
     ;; on some occasions through weirdness we might accidentally try to insert a key that's already been inserted
     (catch Throwable e
       (log/error e (u/format-color 'red "Failed to grant permissions"))
       ;; if we're running tests, we're doing something wrong here if duplicate permissions are getting assigned,
       ;; mostly likely because tests aren't properly cleaning up after themselves, and possibly causing other tests
       ;; to pass when they shouldn't. Don't allow this during tests
       (when config/is-test?
         (throw e))))))

; Audit Permissions helper fns

(defn check-audit-db-permissions
  "Check that the changes coming in does not attempt to change audit database permission. Admins should
  change these permissions in application monitoring permissions."
  [changes]
  (let [changes-ids (->> changes
                         vals
                         (map keys)
                         (apply concat))]
    (when (some #{audit/audit-db-id} changes-ids)
      (throw (ex-info (tru
                       (str "Audit database permissions can only be changed by updating audit collection permissions."))
                      {:status-code 400})))))

(defn audit-namespace-clause
  "SQL clause to filter namespaces depending on if audit app is enabled or not, and if the namespace is the default one."
  [namespace-keyword namespace-val]
  (if (and (nil? namespace-val) (premium-features/enable-audit-app?))
    [:or [:= namespace-keyword nil] [:= namespace-keyword "analytics"]]
    [:= namespace-keyword namespace-val]))

(defn can-read-audit-helper
  "Audit instances should only be readable if audit app is enabled."
  [model instance]
  (if (and (not (premium-features/enable-audit-app?))
           (case model
             :model/Collection (audit/is-collection-id-audit? (:id instance))
             (audit/is-parent-collection-audit? instance)))
    false
    (case model
      :model/Collection (mi/current-user-has-full-permissions? :read instance)
      (mi/current-user-has-full-permissions? (perms-objects-set-for-parent-collection instance :read)))))

; Audit permissions helper fns end

(defn revoke-application-permissions!
  "Remove all permissions entries for a Group to access a Application permisisons"
  [group-or-id perm-type]
  (delete-related-permissions! group-or-id (application-perms-path perm-type)))

(defn grant-application-permissions!
  "Grant full permissions for a group to access a Application permisisons."
  [group-or-id perm-type]
  (grant-permissions! group-or-id (application-perms-path perm-type)))

(defn- is-personal-collection-or-descendant-of-one? [collection]
  (classloader/require 'metabase.models.collection)
  ((resolve 'metabase.models.collection/is-personal-collection-or-descendant-of-one?) collection))

(mu/defn ^:private check-not-personal-collection-or-descendant
  "Check whether `collection-or-id` refers to a Personal Collection; if so, throw an Exception. This is done because we
  *should* never be editing granting/etc. permissions for *Personal* Collections to entire Groups! Their owner will
  get implicit permissions automatically, and of course admins will be able to see them,but a whole group should never
  be given some sort of access."
  [collection-or-id :- MapOrID]
  ;; don't apply this check to the Root Collection, because it's never personal
  (when-not (:metabase.models.collection.root/is-root? collection-or-id)
    ;; ok, once we've confirmed this isn't the Root Collection, see if it's in the DB with a personal_owner_id
    (let [collection (if (map? collection-or-id)
                       collection-or-id
                       (or (t2/select-one 'Collection :id (u/the-id collection-or-id))
                           (throw (ex-info (tru "Collection does not exist.") {:collection-id (u/the-id collection-or-id)}))))]
      (when (is-personal-collection-or-descendant-of-one? collection)
        (throw (Exception. (tru "You cannot edit permissions for a Personal Collection or its descendants.")))))))

(mu/defn revoke-collection-permissions!
  "Revoke all access for `group-or-id` to a Collection."
  [group-or-id :- MapOrID collection-or-id :- MapOrID]
  (check-not-personal-collection-or-descendant collection-or-id)
  (delete-related-permissions! group-or-id (collection-readwrite-path collection-or-id)))

(mu/defn grant-collection-readwrite-permissions!
  "Grant full access to a Collection, which means a user can view all Cards in the Collection and add/remove Cards."
  [group-or-id :- MapOrID collection-or-id :- MapOrID]
  (check-not-personal-collection-or-descendant collection-or-id)
  (grant-permissions! (u/the-id group-or-id) (collection-readwrite-path collection-or-id)))

(mu/defn grant-collection-read-permissions!
  "Grant read access to a Collection, which means a user can view all Cards in the Collection."
  [group-or-id :- MapOrID collection-or-id :- MapOrID]
  (check-not-personal-collection-or-descendant collection-or-id)
  (grant-permissions! (u/the-id group-or-id) (collection-read-path collection-or-id)))
