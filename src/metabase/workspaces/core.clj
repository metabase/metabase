(ns metabase.workspaces.core
  "OSS-side public API for workspace mode.

   ## Three related-but-distinct concepts

   1. **Workspace mode** — a state of the current thread. True iff the EE
      `workspaces-enabled` setting is on, which makes the whole instance a workspace,
      or the current request names a workspace of this instance with its
      `X-Metabase-Workspace-Id` header ([[current-workspace-id]]). The
      `workspace-mode?` predicate; `workspace-bound?` tells the second case.

   2. **Workspace-managed database** — a *database-scoped state*. True iff the
      thread is in workspace mode AND the database has a `database-workspace-schema`
      database-local setting, or is a provisioned database of the workspace that the
      request names. The `(ws/db-workspace-namespace db-id)` predicate (EE only).

   3. **Table remapping engaged** — a *query-time data state*. True iff
      `:model/TableRemapping` rows exist for the database. The
      `(ws.remapping/enabled-for-db? db-id)` predicate. Transforms create the
      rows only while the database is workspace-managed, but rows can outlive
      that state. The rewriting responds to row existence alone; it does not
      check workspace mode.

   ## What this namespace gates

   `check-not-in-workspace-mode!` uses concept (1). Features blocked here (DB
   routing, actions, editing table data, CSV upload, model persistence) are
   refused on a child instance entirely, and in every request that names a
   workspace, not per-database. Rationale: workspace children boot with empty everything
   except content; per Dan in proj-workspaces 2026-04-30, those features can't
   already be configured. The instance-level gate is simpler and defensive —
   no escape hatch.

   If a future use case requires running a feature against a non-workspace-
   managed database on a child, refine the call sites to per-database checks
   using the EE `db-workspace-namespace` predicate.

   ## OSS vs EE

   The OSS jar has no workspace mode (`workspace-mode?` returns false, and a
   request can't name a workspace), so the gates are no-ops. The EE impl in
   `metabase-enterprise.workspaces.core` reads the `workspaces-enabled` setting and
   the workspace that the request names."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]))

(defenterprise workspace-mode?
  "True if the current thread works in a workspace: the EE `workspaces-enabled` setting
   is on, or the current request names a workspace ([[current-workspace-id]]).

   For the per-database check, use the EE function
   `metabase-enterprise.workspaces.core/db-workspace-namespace` (returns the
   workspace-isolated output namespace map if the thread is in workspace mode
   AND the database is one of the workspace's).

   The OSS fallback returns false."
  metabase-enterprise.workspaces.core
  []
  false)

(defenterprise workspace-bound?
  "True when the current request works in a workspace that it names ([[current-workspace-id]]), while other requests
   of this instance work in other workspaces or in none. Then the results of a query hold that workspace's data, so
   nothing that other requests read, such as the query cache, may keep them. False on a sidecar, whose every request
   works in the instance's own workspace. The OSS fallback returns false."
  metabase-enterprise.workspaces.core
  []
  false)

(defenterprise sync-copy-of-table!
  "In a workspace that the current request names ([[workspace-bound?]]), record how the copy of `table` in
   `database` that the request's transform wrote differs from the shared metadata, for that workspace only, and return
   true: the Table and Fields that every workspace shares are not synced from the copy. Otherwise return false, and
   the caller syncs `table` as usual. The OSS fallback returns false."
  metabase-enterprise.workspaces.core
  [_database _table]
  false)

(defenterprise apply-copy-metadata
  "`tables`, each with its hydrated `:fields`, as the workspace that the current request names ([[workspace-bound?]])
   has them: with the columns and types of its copies, and the Tables only it has active. Hydrates a Field it adds
   with `hydrate-fields`, a fn of a sequence of Fields. Elsewhere `tables` as they are. The OSS fallback returns
   `tables`."
  metabase-enterprise.workspaces.core
  [tables _hydrate-fields]
  tables)

;;; ---------------------------------------- The workspace a request names -----------------------------------------

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *workspace-id*
  "The id of the workspace the current request names with its `X-Metabase-Workspace-Id` header
   ([[metabase.server.middleware.workspace]]), or nil. Threads that `bound-fn` starts, such as a transform run's,
   keep it."
  nil)

(defn current-workspace-id
  "The id of the workspace the current request names, or nil when it names none."
  []
  *workspace-id*)

(defn do-with-workspace-id
  "Impl for [[with-workspace-id]] and [[without-workspace]]."
  [workspace-id thunk]
  (binding [*workspace-id* workspace-id]
    (thunk)))

(defmacro with-workspace-id
  "Run `body` in the workspace with `workspace-id`, or in none when it is nil."
  [workspace-id & body]
  `(do-with-workspace-id ~workspace-id (^:once fn* [] ~@body)))

(defmacro without-workspace
  "Run `body` in no workspace that a request names: with the Databases' own logins, and the instance's own table
   remappings. Use it around work whose results everyone shares, such as a sync of a Database."
  [& body]
  `(with-workspace-id nil ~@body))

(defenterprise request-workspace-problem
  "Why a request can't work in the workspace with `workspace-id`, or nil when it can. The OSS fallback refuses every
   workspace."
  metabase-enterprise.workspaces.core
  [_workspace-id]
  (tru "This instance has no workspaces."))

(defenterprise workspace-connection-details
  "The connection details the current workspace uses for the Database with `database-id`, which go over that
   Database's own details, or nil when they are the Database's own. The OSS fallback returns nil."
  metabase-enterprise.workspaces.core
  [_database-id]
  nil)

(defenterprise workspace-database-exists?
  "True if any workspace has a database row for the Database with `database-id`. The OSS
   fallback returns false, since OSS has no workspaces."
  metabase-enterprise.workspaces.core
  [_database-id]
  false)

(defenterprise check-database-workspace-schema-write!
  "Throws an HTTP 400 `ex-info` when a write would change a database's `database-workspace-schema` from
   `stored-schema` to `new-schema` while the `MB_WORKSPACES_ENABLED` env var is set. Does nothing when the two are
   equal. The OSS fallback does nothing."
  metabase-enterprise.workspaces.core
  [_stored-schema _new-schema]
  nil)

(defn check-not-in-workspace-mode!
  "Throws an HTTP 400 `ex-info` if the current thread works in a workspace
   ([[workspace-mode?]]).

   Use at API entry points and at write points for features that must be refused
   on a workspace child instance, and in a request that names a workspace (DB
   routing, actions, editing table data, CSV upload, model persistence). The check
   is not per-database — see namespace docstring for the rationale."
  [feature-name]
  (when (workspace-mode?)
    (throw (ex-info (str feature-name " is not supported on a workspace instance.")
                    {:status-code 400
                     :feature feature-name
                     :workspace-mode true}))))
