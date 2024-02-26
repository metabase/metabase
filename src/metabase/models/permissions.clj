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
   [clojure.data :as data]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.api.common :refer [*current-user-id*]]
   [metabase.api.permission-graph :as api.permission-graph]
   [metabase.config :as config]
   [metabase.models.data-permissions.graph :as data-perms.graph]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.permissions-revision
    :as perms-revision
    :refer [PermissionsRevision]]
   [metabase.models.permissions.parse :as perms-parse]
   [metabase.permissions.util :as perms.u]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs tru]]
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

(mu/defn data-perms-path :- perms.u/PathSchema
  "Return the [readwrite] permissions path for a Database, schema, or Table. (At the time of this writing, DBs and
  schemas don't have separate `read/` and write permissions; you either have 'data access' permissions for them, or
  you don't. Tables, however, have separate read and write perms.)"
  ([database-or-id :- MapOrID]
   (str "/db/" (u/the-id database-or-id) "/"))

  ([database-or-id :- MapOrID schema-name :- [:maybe :string]]
   (str (data-perms-path database-or-id) "schema/" (perms.u/escape-path-component schema-name) "/"))

  ([database-or-id :- MapOrID schema-name :- [:maybe :string] table-or-id :- MapOrID]
   (str (data-perms-path database-or-id schema-name) "table/" (u/the-id table-or-id) "/")))

(mu/defn adhoc-native-query-path :- perms.u/PathSchema
  "Return the native query read/write permissions path for a database.
   This grants you permissions to run arbitary native queries."
  [database-or-id :- MapOrID]
  (str (data-perms-path database-or-id) "native/"))

(mu/defn all-schemas-path :- perms.u/PathSchema
  "Return the permissions path for a database that grants full access to all schemas."
  [database-or-id :- MapOrID]
  (str (data-perms-path database-or-id) "schema/"))

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

(mu/defn table-read-path :- perms.u/PathSchema
  "Return the permissions path required to fetch the Metadata for a Table."
  ([table-or-id]
   (if (integer? table-or-id)
     (recur (t2/select-one ['Table :db_id :schema :id] :id table-or-id))
     (table-read-path (:db_id table-or-id) (:schema table-or-id) table-or-id)))

  ([database-or-id schema-name table-or-id]
   {:post [(perms.u/valid-path? %)]}
   (str (data-perms-path (u/the-id database-or-id) schema-name (u/the-id table-or-id)) "read/")))

(mu/defn table-query-path :- perms.u/PathSchema
  "Return the permissions path for *full* query access for a Table. Full query access means you can run any (MBQL) query
  you wish against a given Table, with no GTAP-specified mandatory query alterations."
  ([table-or-id]
   (if (integer? table-or-id)
     (recur (t2/select-one ['Table :db_id :schema :id] :id table-or-id))
     (table-query-path (:db_id table-or-id) (:schema table-or-id) table-or-id)))

  ([database-or-id schema-name table-or-id]
   (str (data-perms-path (u/the-id database-or-id) schema-name (u/the-id table-or-id)) "query/")))

(mu/defn table-sandboxed-query-path :- perms.u/PathSchema
  "Return the permissions path for *segmented* query access for a Table. Segmented access means running queries against
  the Table will automatically replace the Table with a GTAP-specified question as the new source of the query,
  obstensibly limiting access to the results."
  ([table-or-id]
   (if (integer? table-or-id)
     (recur (t2/select-one ['Table :db_id :schema :id] :id table-or-id))
     (table-sandboxed-query-path (:db_id table-or-id) (:schema table-or-id) table-or-id)))

  ([database-or-id schema-name table-or-id]
   (str (data-perms-path (u/the-id database-or-id) schema-name (u/the-id table-or-id)) "query/segmented/")))

(mu/defn database-block-perms-path :- perms.u/PathSchema
  "Return the permissions path for the Block 'anti-permissions'. Block anti-permissions means a User cannot run a query
  against a Database unless they have data permissions, regardless of whether segmented permissions would normally give
  them access or not."
  [database-or-id :- MapOrID]
  (str "/block" (data-perms-path database-or-id)))

(mu/defn base->feature-perms-path :- perms.u/PathSchema
  "Returns the permissions path to use for a given permission type (e.g. download) and value (e.g. full or limited),
  given the 'base' permissions path for an entity (the base path is equivalent to the one used for data access
  permissions)."
  [perm-type perm-value base-path]
  (case [perm-type perm-value]
    [:download :full]
    (str "/download" base-path)

    [:download :limited]
    (str "/download/limited" base-path)

    [:data-model :all]
    (str "/data-model" base-path)

    [:details :yes]
    (str "/details" base-path)

    [:execute :all]
    (str "/execute" base-path)))

(mu/defn feature-perms-path :- perms.u/PathSchema
  "Returns the permissions path to use for a given feature-level permission type (e.g. download) and value (e.g. full
  or limited), for a database, schema or table."
  [perm-type perm-value & path-components]
  (base->feature-perms-path perm-type perm-value (apply data-perms-path path-components)))

(mu/defn native-feature-perms-path :- perms.u/PathSchema
  "Returns the native permissions path to use for a given feature-level permission type (e.g. download) and value
  (e.g. full or limited)."
  [perm-type perm-value database-or-id]
  (base->feature-perms-path perm-type perm-value (adhoc-native-query-path database-or-id)))

(mu/defn data-model-write-perms-path :- perms.u/PathSchema
  "Returns the permission path required to edit the table specified by the provided args, or a field in the table.
  If Enterprise Edition code is available, and a valid :advanced-permissions token is present, returns the data model
  permissions path for the table. Otherwise, defaults to the root path ('/'), thus restricting writes to admins."
  [& path-components]
  (let [f (when config/ee-available?
            (classloader/require 'metabase-enterprise.advanced-permissions.models.permissions)
            (resolve 'metabase-enterprise.advanced-permissions.models.permissions/data-model-write-perms-path))]
    (if (and f (premium-features/enable-advanced-permissions?))
      (apply f path-components)
      "/")))

(mu/defn db-details-write-perms-path :- perms.u/PathSchema
  "Returns the permission path required to edit the table specified by the provided args, or a field in the table.
  If Enterprise Edition code is available, and a valid :advanced-permissions token is present, returns the DB details
  permissions path for the table. Otherwise, defaults to the root path ('/'), thus restricting writes to admins."
  [db-id]
  (let [f (when config/ee-available?
            (classloader/require 'metabase-enterprise.advanced-permissions.models.permissions)
            (resolve 'metabase-enterprise.advanced-permissions.models.permissions/db-details-write-perms-path))]
    (if (and f (premium-features/enable-advanced-permissions?))
      (f db-id)
      "/")))

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

(mu/defn set-has-any-native-query-permissions? :- :boolean
  "Do the permission paths in `permission-set` grant native query access to any database?"
  [permissions-set]
  (boolean
    ;; Matches "/", "/db/:id/", or "/db/:id/native/"
    (some
     #(first (re-find #"^/(db/\d+/(native/)?)?$" %))
     permissions-set)))

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
    (log/debug (u/colorize 'green (trs "Granting permissions for group {0}: {1}"
                                       (:group_id permissions)
                                       (:object permissions))))))

(t2/define-before-update :model/Permissions
  [_]
  (throw (Exception. (tru "You cannot update a permissions entry! Delete it and create a new one."))))

(t2/define-before-delete :model/Permissions
  [permissions]
  (log/debug (u/colorize 'red (trs "Revoking permissions for group {0}: {1}"
                                   (:group_id permissions)
                                   (:object permissions))))
  (assert-not-admin-group permissions))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  GRAPH SCHEMA                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The stuff below is all for the *data* permissions graph. We have a separate graph for Collection permissions, and
;; code to work with it lives in [[metabase.models.collection.graph]].

;; TODO - there is so much stuff related to the perms graph I think we should really move it into a separate
;; `metabase.models.permissions.graph.data` namespace or something and move the collections graph from
;; [[metabase.models.collection.graph]] to `metabase.models.permissions.graph.collection` (?)

(def ^:private TablePermissionsGraph
  [:or
   {:error/message "Valid perms graph for a Table"}
   [:enum :none :all]
   [:and
    [:map
     [:read  {:optional true} [:enum :all :none]]
     [:query {:optional true} [:enum :all :segmented :none]]]
    [:fn
     {:error/message "non-empty map"}
     not-empty]]])

(def ^:private SchemaPermissionsGraph
  [:or
   {:error/message "Valid perms graph for a schema"}
   [:enum :none :all]
   [:map-of ms/PositiveInt TablePermissionsGraph]])

(def ^:private NativePermissionsGraph
  [:enum {:error/message "Valid native perms option for a database"} :write :none])

;; The "Strict" versions of the various graphs below are intended for schema checking when *updating* the permissions
;; graph. In other words, we shouldn't be stopped from returning the graph if it violates the "strict" rules, but we
;; *should* refuse to update the graph unless it matches the strict schema.
;;
;; TODO - It might be possible at some point in the future to just use the strict versions everywhere
;;
;; TODO -- instead of doing schema validation, why don't we just throw an Exception so the API responses are actually
;; somewhat useful?
(def ^:private DownloadTablePermissionsGraph
  [:enum {:error/message "Valid download perms graph for a table"} :full :limited :none])

(def ^:private DownloadSchemaPermissionsGraph
  [:or
   {:error/message "Valid download perms graph for a schema"}
   [:enum :full :limited :none]
   [:map-of ms/PositiveInt DownloadTablePermissionsGraph]])

(def ^:private DownloadNativePermissionsGraph
  [:enum {:error/message "Valid download perms option for native queries over a database"} :full :limited :none])

(def DownloadPermissionsGraph
  "Schema for a download permissions graph, used in [[metabase-enterprise.advanced-permissions.models.permissions]]."
  [:map
   {:error/message "Valid download perms graph for a database"}
   [:native  {:optional true} DownloadNativePermissionsGraph]
   [:schemas {:optional true} [:or
                               [:enum :full :limited :none]
                               [:map-of :string DownloadSchemaPermissionsGraph]]]])

(def ^:private DataModelTablePermissionsGraph
  [:enum {:error/message "Valid data model perms graph for a table"} :all :none])

(def ^:private DataModelSchemaPermissionsGraph
  [:or
   {:error/message "Valid data model perms graph for a schema"}
   [:enum :all :none]
   [:map-of ms/PositiveInt DataModelTablePermissionsGraph]])

(def DataModelPermissionsGraph
  "Schema for a data model permissions graph, used in [[metabase-enterprise.advanced-permissions.models.permissions]]."
  [:map
   {:error/message "Valid data model perms graph for a database"}
   [:schemas [:or
              [:enum :all :none]
              [:map-of :string DataModelSchemaPermissionsGraph]]]])

(def DetailsPermissions
  "Schema for a database details permissions, used in [[metabase-enterprise.advanced-permissions.models.permissions]]."
  [:enum {:error/message "Valid details perms graph for a database"} :yes :no])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  GRAPH FETCH                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- all-permissions
  "Handle '/' permission"
  [db-ids]
  (into {}
        (map (fn [db-id]
               [db-id {:data       {:native :write :schemas :all}
                       :download   {:native :full  :schemas :full}
                       :data-model {               :schemas :all}
                       :details :yes}])
             db-ids)))

(defn- permissions-by-group-ids [where-clause]
  (let [permissions (t2/select [Permissions [:group_id :group-id] [:object :path]]
                      {:where where-clause})]
    (reduce (fn [m {:keys [group-id path]}]
              (update m group-id conj path))
            {}
            permissions)))

(defn- post-process-graph [graph]
  (->>
   graph
   (walk/postwalk-replace {{:query {:schemas :all}}             {:query {:schemas :all :native :none}}
                           {:query {:schemas :all :native nil}} {:query {:schemas :all :native :none}}})))

(mu/defn generate-graph :- :map
  "Used to generation permission graph from parsed permission paths of v1 and v2 permission graphs for the api layer."
  [db-ids group-id->paths :- [:map-of :int [:* perms.u/Path]]]
  (->> group-id->paths
       (m/map-vals
        (fn [paths]
          (let [permissions-graph (perms-parse/->graph paths)]
            (if (= permissions-graph :all)
              (all-permissions db-ids)
              (:db permissions-graph)))))
       post-process-graph
       data-perms.graph/add-sandboxes-to-permissions-graph
       data-perms.graph/add-impersonations-to-permissions-graph))

(defn ->v1-paths
  "keep v1 paths, implicitly remove v2"
  [group-id->permissions]
  (m/map-vals (fn [paths]
                (filter (fn [path] (mc/validate [:re perms.u/path-regex-v1] path)) paths))
              group-id->permissions))

(defn data-perms-graph
  "Fetch a graph representing the current *data* permissions status for every Group and all permissioned databases.
  See [[metabase.models.collection.graph]] for the Collection permissions graph code."
  []
  {:revision (perms-revision/latest-id)
   :groups   (data-perms.graph/api-graph {})})

(defn data-graph-for-db
  "Efficiently returns a data permissions graph, which has all the permissions info for `db-id`."
  [db-id]
  {:revision (perms-revision/latest-id)
   :groups (data-perms.graph/api-graph {:db-id db-id})})

(defn data-graph-for-group
  "Efficiently returns a data permissions graph, which has all the permissions info for the permission group at `group-id`."
  [group-id]
  {:revision (perms-revision/latest-id)
   :groups (data-perms.graph/api-graph {:group-id group-id})})

(defn data-perms-graph-v2
  "Fetch a graph representing the current *data* permissions status for every Group and all permissioned databases.
  See [[metabase.models.collection.graph]] for the Collection permissions graph code. This version of data-perms-graph
  removes v1 paths, implicitly keeping Only v2 style paths.

  What are v1 and v2 permissions? see: [[classify-path]]. In summary:

         v1 permissions
  |--------------------------------|
  |                                |
  v1-data, block | all-other-paths | v2-data, v2-query
                 |                                   |
                 |-----------------------------------|
                           v2 permissions"
  []
  (let [db-ids             (delay (t2/select-pks-set 'Database))
        group-id->v2-paths (->> (permissions-by-group-ids [:or
                                                           [:= :object (h2x/literal "/")]
                                                           [:like :object (h2x/literal "%/db/%")]])
                                (m/map-vals (fn [paths]
                                              ;; remove v1 paths, implicitly keep v2 paths
                                              (remove (fn [path] (mc/validate perms.u/DataPath path))
                                                      paths))))]
    {:revision (perms-revision/latest-id)
     :groups   (generate-graph @db-ids group-id->v2-paths)}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  GRAPH UPDATE                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+


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

;; TODO: rename this function to `revoke-permissions!` and make its behavior consistent with `grant-permissions!`
(defn revoke-data-perms!
  "Revoke all permissions for `group-or-id` to object with `path-components`, *including* related permissions (i.e,
  permissions that grant full or partial access to the object in question).


    (revoke-data-perms! my-group my-db)"
  {:arglists '([group-or-id database-or-id]
               [group-or-id database-or-id schema-name]
               [group-or-id database-or-id schema-name table-or-id])}
  [group-or-id & path-components]
  (delete-related-permissions! group-or-id (apply data-perms-path path-components)))

(defn revoke-download-perms!
  "Revoke all full and limited download permissions for `group-or-id` to object with `path-components`."
  {:arglists '([group-id db-id]
               [group-id db-id schema-name]
               [group-id db-id schema-name table-or-id])}
  [group-or-id & path-components]
  (delete-related-permissions! group-or-id (apply (partial feature-perms-path :download :full) path-components))
  (delete-related-permissions! group-or-id (apply (partial feature-perms-path :download :limited) path-components)))

(defn grant-permissions!
  "Grant permissions for `group-or-id` and return the inserted permissions. Two-arity grants any arbitrary Permissions `path`.
  With > 2 args, grants the data permissions from calling [[data-perms-path]]."
  ([group-or-id db-id schema & more]
   (grant-permissions! group-or-id (apply data-perms-path db-id schema more)))

  ([group-or-id path]
   ;; TEMPORARY HACK: v2 paths won't be in the graph, so they will not be seen in the old graph, so will be
   ;; interpreted as being new, and hence will not get deleted.
   ;; But we can simply delete them here:
   ;; This must be pulled out once the frontend is sending up a proper v2 graph.
   (t2/delete! Permissions :group_id (u/the-id group-or-id) :object [:like "/query/%"])
   (t2/delete! Permissions :group_id (u/the-id group-or-id) :object [:like "/data/%"])
   (try
     (t2/insert-returning-instances! Permissions
                                     (map (fn [path-object]
                                            {:group_id (u/the-id group-or-id) :object path-object})
                                          (distinct (conj (perms.u/->v2-path path) path))))
     ;; on some occasions through weirdness we might accidentally try to insert a key that's already been inserted
     (catch Throwable e
       (log/error e (u/format-color 'red (tru "Failed to grant permissions")))
       ;; if we're running tests, we're doing something wrong here if duplicate permissions are getting assigned,
       ;; mostly likely because tests aren't properly cleaning up after themselves, and possibly causing other tests
       ;; to pass when they shouldn't. Don't allow this during tests
       (when config/is-test?
         (throw e))))))

(defn revoke-native-permissions!
  "Revoke all native query permissions for `group-or-id` to database with `database-id`."
  [group-or-id database-or-id]
  (delete-related-permissions! group-or-id (adhoc-native-query-path database-or-id)))

(defn grant-native-readwrite-permissions!
  "Grant full readwrite permissions for `group-or-id` to database with `database-id`."
  [group-or-id database-or-id]
  (grant-permissions! group-or-id (adhoc-native-query-path database-or-id)))

(defn- group-has-native-perms?
  [group-or-id database-or-id]
  (set-has-full-permissions?
   (t2/select-fn-set :object Permissions :group_id (u/the-id group-or-id))
   (adhoc-native-query-path database-or-id)))

(defn revoke-db-schema-permissions!
  "Remove all permissions entries for a DB and *any* child objects.
   This does *not* revoke native permissions; use `revoke-native-permssions!` to do that."
  [group-or-id database-or-id]
  (let [has-native-perms? (group-has-native-perms? group-or-id database-or-id)]
    (delete-related-permissions! group-or-id (data-perms-path database-or-id)
      [:not= :object (adhoc-native-query-path database-or-id)])
    ;; If we've removed native perms as a consequence of deleting a root database path like `/db/1/`, add them back
    (when (and has-native-perms? (not (group-has-native-perms? group-or-id database-or-id)))
      (grant-native-readwrite-permissions! group-or-id database-or-id))))

; Audit Permissions helper fns

(def audit-db-id
  "ID of Audit DB which is loaded when running an EE build. ID is placed in OSS code to facilitate permission checks."
  13371337)

(defenterprise default-audit-collection
  "OSS implementation of `audit-db/default-audit-collection`, which is an enterprise feature, so does nothing in the OSS
  version."
  metabase-enterprise.audit-db [] nil)

(defenterprise default-custom-reports-collection
  "OSS implementation of `audit-db/default-custom-reports-collection`, which is an enterprise feature, so does nothing in the OSS
  version."
  metabase-enterprise.audit-db [] ::noop)

(defn check-audit-db-permissions
  "Check that the changes coming in does not attempt to change audit database permission. Admins should
  change these permissions in application monitoring permissions."
  [changes]
  (let [changes-ids (->> changes
                         vals
                         (map keys)
                         (apply concat))]
    (when (some #{audit-db-id} changes-ids)
      (throw (ex-info (tru
                       (str "Audit database permissions can only be changed by updating audit collection permissions."))
                      {:status-code 400})))))

(defn audit-namespace-clause
  "SQL clause to filter namespaces depending on if audit app is enabled or not, and if the namespace is the default one."
  [namespace-keyword namespace-val]
  (if (and (nil? namespace-val) (premium-features/enable-audit-app?))
    [:or [:= namespace-keyword nil] [:= namespace-keyword "analytics"]]
    [:= namespace-keyword namespace-val]))

(defn is-collection-id-audit?
  "Check if an id is one of the audit collection ids."
  [id]
  (contains? (set [(:id (default-audit-collection)) (:id (default-custom-reports-collection))]) id))

(defn is-parent-collection-audit?
  "Check if an instance's parent collection is the audit collection."
  [instance]
  (let [parent-id (:collection_id instance)]
    (and (some? parent-id) (is-collection-id-audit? parent-id))))

(defn can-read-audit-helper
  "Audit instances should only be fetched if audit app is enabled."
  [model instance]
  (if (and (not (premium-features/enable-audit-app?))
           (case model
             :model/Collection (is-collection-id-audit? (:id instance))
             (is-parent-collection-audit? instance)))
    false
    (case model
      :model/Collection (mi/current-user-has-full-permissions? :read instance)
      (mi/current-user-has-full-permissions? (perms-objects-set-for-parent-collection instance :read)))))

; Audit permissions helper fns end

(defn revoke-application-permissions!
  "Remove all permissions entries for a Group to access a Application permisisons"
  [group-or-id perm-type]
  (delete-related-permissions! group-or-id (application-perms-path perm-type)))

(defn grant-permissions-for-all-schemas!
  "Grant full permissions for all schemas belonging to this database.
   This does *not* grant native permissions; use `grant-native-readwrite-permissions!` to do that."
  [group-or-id database-or-id]
  (grant-permissions! group-or-id (all-schemas-path database-or-id)))

(defn grant-full-data-permissions!
  "Grant full access to the database, including all schemas and readwrite native access."
  [group-or-id database-or-id]
  (grant-permissions! group-or-id (data-perms-path database-or-id)))

(defn grant-full-download-permissions!
  "Grant full download permissions to the database."
  [group-or-id database-or-id]
  (grant-permissions! group-or-id (feature-perms-path :download :full database-or-id)))

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


;;; ----------------------------------------------- Graph Updating Fns -----------------------------------------------

(defn ee-permissions-exception
  "Exception to throw when a permissions operation fails due to missing Enterprise Edition code, or missing a valid
   token with the advanced-permissions feature."
  [perm-type]
  (ex-info
    (tru "The {0} permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
         (str/replace (name perm-type) "-" " "))
    {:status-code 402}))

(defn- download-permissions-set
  [group-id]
  (t2/select-fn-set :object
                   [Permissions :object]
                   {:where [:and
                            [:= :group_id group-id]
                            [:or
                             [:= :object (h2x/literal "/")]
                             [:like :object (h2x/literal "/download/%")]]]}))

(defn- download-permissions-level
  [permissions-set db-id & [schema-name table-id]]
  (cond
   (set-has-full-permissions? permissions-set (feature-perms-path :download :full db-id schema-name table-id))
   :full

   (set-has-full-permissions? permissions-set (feature-perms-path :download :limited db-id schema-name table-id))
   :limited

   :else
   :none))

(mu/defn update-native-download-permissions!
  "Native download permissions control the ability of users to download the results of native questions for a given
  database.

  To update native download permissions, we must read the list of tables in the database, and check the group's
  download permission level for each one.
     - If they have full download permissions for all tables, they have full native download permissions.
     - If they have *at least* limited download permissions for all tables, they have limited native download
       permissions.
     - If they have no download permissions for at least one table, they have no native download permissions.

  This lives in non-EE code because it needs to be called during sync, in case a new table was discovered or a
  table was deleted. This ensures that native download perms are always up to date, even on OSS instances, in case
  they are upgraded to EE."
  [group-id :- ms/PositiveInt db-id :- ms/PositiveInt]
  (let [permissions-set (download-permissions-set group-id)
        table-ids-and-schemas (t2/select-pk->fn :schema 'Table :db_id db-id :active [:= true])
        native-perm-level (reduce (fn [lowest-seen-perm-level [table-id table-schema]]
                                    (let [table-perm-level (download-permissions-level permissions-set
                                                                                       db-id
                                                                                       table-schema
                                                                                       table-id)]
                                      (cond
                                        (= table-perm-level :none)
                                        (reduced :none)

                                        (or (= lowest-seen-perm-level :limited)
                                            (= table-perm-level :limited))
                                        :limited

                                        :else
                                        :full)))
                                  :full
                                  (seq table-ids-and-schemas))]
    (doseq [perm-value [:full :limited]]
      ;; We don't want to call `delete-related-permissions!` here because that would also delete prefixes of the native
      ;; downloads path, including `/download/db/:id/`, thus removing download permissions for the entire DB. Instead
      ;; we just delete the native downloads path directly, so that we can replace it with a new value.
      (t2/delete! Permissions :group_id group-id, :object (native-feature-perms-path :download perm-value db-id)))
    (when (not= native-perm-level :none)
      (grant-permissions! group-id (native-feature-perms-path :download native-perm-level db-id)))))

(mu/defn ^:private update-table-read-permissions!
  [group-id       :- ms/PositiveInt
   db-id          :- ms/PositiveInt
   schema         :- :string
   table-id       :- ms/PositiveInt
   new-read-perms :- [:enum :all :none]]
  ((case new-read-perms
     :all  grant-permissions!
     :none revoke-data-perms!) group-id (table-read-path db-id schema table-id)))

(mu/defn ^:private update-table-query-permissions!
  [group-id        :- ms/PositiveInt
   db-id           :- ms/PositiveInt
   schema          :- :string
   table-id        :- ms/PositiveInt
   new-query-perms :- [:enum :all :segmented :none]]
  (case new-query-perms
    :all       (grant-permissions! group-id (table-query-path           db-id schema table-id))
    :segmented (grant-permissions! group-id (table-sandboxed-query-path db-id schema table-id))
    :none      (revoke-data-perms! group-id (table-query-path           db-id schema table-id))))

(mu/defn ^:private update-table-data-access-permissions!
  [group-id        :- ms/PositiveInt
   db-id           :- ms/PositiveInt
   schema          :- :string
   table-id        :- ms/PositiveInt
   new-table-perms :- TablePermissionsGraph]
  (cond
    (= new-table-perms :all)
    (do
      (revoke-data-perms! group-id db-id schema table-id)
      (grant-permissions! group-id db-id schema table-id))

    (= new-table-perms :none)
    (revoke-data-perms! group-id db-id schema table-id)

    (map? new-table-perms)
    (let [{new-read-perms :read, new-query-perms :query} new-table-perms]
      ;; clear out any existing permissions
      (revoke-data-perms! group-id db-id schema table-id)
      ;; then grant/revoke read and query perms as appropriate
      (when new-read-perms  (update-table-read-permissions!  group-id db-id schema table-id new-read-perms))
      (when new-query-perms (update-table-query-permissions! group-id db-id schema table-id new-query-perms)))))

(mu/defn ^:private update-schema-data-access-permissions!
  [group-id         :- ms/PositiveInt
   db-id            :- ms/PositiveInt
   schema           :- :string
   new-schema-perms :- SchemaPermissionsGraph]
  (cond
    (= new-schema-perms :all)  (do (revoke-data-perms! group-id db-id schema)  ; clear out any existing related permissions
                                   (grant-permissions! group-id db-id schema)) ; then grant full perms for the schema
    (= new-schema-perms :none) (revoke-data-perms! group-id db-id schema)
    (map? new-schema-perms)    (doseq [[table-id table-perms] new-schema-perms]
                                 (update-table-data-access-permissions! group-id db-id schema table-id table-perms))))

(mu/defn ^:private update-native-data-access-permissions!
  [group-id :- ms/PositiveInt db-id :- ms/PositiveInt new-native-perms :- NativePermissionsGraph]
  ;; revoke-native-permissions! will delete all entries that would give permissions for native access. Thus if you had
  ;; a root DB entry like `/db/11/` this will delete that too. In that case we want to create a new full schemas entry
  ;; so you don't lose access to all schemas when we modify native access.
  (let [has-full-access? (t2/exists? Permissions :group_id group-id, :object (data-perms-path db-id))]
    (revoke-native-permissions! group-id db-id)
    (when has-full-access?
      (grant-permissions-for-all-schemas! group-id db-id)))
  (case new-native-perms
    :write (grant-native-readwrite-permissions! group-id db-id)
    :none  nil))

(defn- delete-block-perms-for-db!
  [group-id db-id]
  (log/trace "Deleting block permissions entries for Group %d for Database %d" group-id db-id)
  (t2/delete! Permissions :group_id group-id, :object (database-block-perms-path db-id)))

(defn- revoke-schema-and-block-perms!
  [group-id db-id]
  (revoke-db-schema-permissions! group-id db-id)
  (delete-block-perms-for-db! group-id db-id))

(mu/defn ^:private update-db-data-access-permissions!
  [group-id :- pos-int?
   db-id :- pos-int?
   new-db-perms :- api.permission-graph/StrictDataPerms]
  (when-let [new-native-perms (:native new-db-perms)]
    (update-native-data-access-permissions! group-id db-id new-native-perms))
  (when-let [schemas (:schemas new-db-perms)]
    ;; TODO -- consider whether `delete-block-perms-for-this-db!` should be enterprise-only... not sure how to make it
    ;; work, especially if you downgraded from enterprise... FWIW the sandboxing code (for updating the graph) is not enterprise only.
    (condp = schemas
      :all
      (do
        (revoke-schema-and-block-perms! group-id db-id)
        (grant-permissions-for-all-schemas! group-id db-id))

      :none
      (revoke-schema-and-block-perms! group-id db-id)

      ;; Groups using connection impersonation for a DB should be treated the same as if they had full self-service
      ;; data access.
      :impersonated
      (do
        (revoke-schema-and-block-perms! group-id db-id)
        (grant-permissions-for-all-schemas! group-id db-id))

      ;; TODO -- should this code be enterprise only?
      :block
      (do
        (when-not (premium-features/has-feature? :advanced-permissions)
          (throw (ee-permissions-exception :block)))
        (revoke-data-perms! group-id db-id)
        (revoke-download-perms! group-id db-id)
        (grant-permissions! group-id (database-block-perms-path db-id)))

      (when (map? schemas)
        (delete-block-perms-for-db! group-id db-id)
        (doseq [schema (keys schemas)]
          (update-schema-data-access-permissions! group-id db-id schema (get-in new-db-perms [:schemas schema])))))))

(defn- update-feature-level-permission!
  [group-id db-id new-perms perm-type]
  (if-let [update-fn (when config/ee-available?
                       (classloader/require 'metabase-enterprise.advanced-permissions.models.permissions)
                       (resolve (symbol "metabase-enterprise.advanced-permissions.models.permissions"
                                        (str "update-db-" (name perm-type) "-permissions!"))))]
    (update-fn group-id db-id new-perms)
    (throw (ee-permissions-exception perm-type))))

(mu/defn ^:private update-group-permissions!
  [group-id :- pos-int? new-group-perms :- [:maybe api.permission-graph/StrictDbGraph]]
  (doseq [[db-id new-db-perms] new-group-perms
          [perm-type new-perms] new-db-perms]
    (case perm-type
      :data
      (update-db-data-access-permissions! group-id db-id new-perms)

      :download
      (update-feature-level-permission! group-id db-id new-perms :download)

      :data-model
      (update-feature-level-permission! group-id db-id new-perms :data-model)

      :details
      (update-feature-level-permission! group-id db-id new-perms :details))))

(defn check-revision-numbers
  "Check that the revision number coming in as part of `new-graph` matches the one from `old-graph`. This way we can
  make sure people don't submit a new graph based on something out of date, which would otherwise stomp over changes
  made in the interim. Return a 409 (Conflict) if the numbers don't match up."
  [old-graph new-graph]
  (when (not= (:revision old-graph) (:revision new-graph))
    (throw (ex-info (tru
                      (str "Looks like someone else edited the permissions and your data is out of date. "
                           "Please fetch new data and try again."))
                    {:status-code 409}))))

(defn save-perms-revision!
  "Save changes made to permission graph for logging/auditing purposes.
  This doesn't do anything if `*current-user-id*` is unset (e.g. for testing or REPL usage).
  *  `model`   -- revision model, should be one of
                  [PermissionsRevision, CollectionPermissionGraphRevision, ApplicationPermissionsRevision]
  *  `before`  -- the graph before the changes
  *  `changes` -- set of changes applied in this revision."
  [model current-revision before changes]
  (when *current-user-id*
    (first (t2/insert-returning-instances! model
                                           ;; manually specify ID here so if one was somehow inserted in the meantime in the fraction of a second since we
                                           ;; called `check-revision-numbers` the PK constraint will fail and the transaction will abort
                                           :id      (inc current-revision)
                                           :before  before
                                           :after   changes
                                           :user_id *current-user-id*))))

(defn log-permissions-changes
  "Log changes to the permissions graph."
  [old new]
  (log/debug
   (trs "Changing permissions")
   "\n" (trs "FROM:") (u/pprint-to-str 'magenta old)
   "\n" (trs "TO:")   (u/pprint-to-str 'blue    new)))

(mu/defn update-data-perms-graph!
  "Update the *data* permissions graph, making any changes necessary to make it match NEW-GRAPH.
   This should take in a graph that is exactly the same as the one obtained by `graph` with any changes made as
   needed. The graph is revisioned, so if it has been updated by a third party since you fetched it this function will
   fail and return a 409 (Conflict) exception. If nothing needs to be done, this function returns `nil`; otherwise it
   returns the newly created `PermissionsRevision` entry.

  Code for updating the Collection permissions graph is in [[metabase.models.collection.graph]]."
  ([new-graph :- api.permission-graph/StrictData]
   (let [old-graph (data-perms.graph/api-graph {})
         [old new] (data/diff (:groups old-graph) (:groups new-graph))
         old       (or old {})
         new       (or new {})]
     (when (or (seq old) (seq new))
       (data-perms.graph/log-permissions-changes old new)
       (data-perms.graph/check-revision-numbers old-graph new-graph)
       (data-perms.graph/check-audit-db-permissions new)
       (t2/with-transaction [_conn]
        (doseq [[group-id changes] new]
          (update-group-permissions! group-id changes))
        (data-perms.graph/update-data-perms-graph! new)
        (data-perms.graph/save-perms-revision! PermissionsRevision (:revision old-graph) old new)
        (data-perms.graph/delete-impersonations-if-needed-after-permissions-change! new)
        (data-perms.graph/delete-gtaps-if-needed-after-permissions-change! new)))))

  ;; The following arity is provided soley for convenience for tests/REPL usage
  ([ks :- [:vector :any] new-value]
   (update-data-perms-graph! (assoc-in (data-perms-graph) (cons :groups ks) new-value))))
