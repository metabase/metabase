(ns metabase.workspaces.core
  "OSS-side public API for workspace mode.

   ## Three related-but-distinct concepts

   1. **Workspace mode** — an *instance-level state*. True iff the EE
      `workspaces-enabled` setting is on. The `workspace-mode?` predicate.

   2. **Workspace-managed database** — a *database-scoped state*. True iff this
      instance is in workspace mode AND the database has a `database-workspace-schema`
      database-local setting. The `(ws/db-workspace-namespace db-id)` predicate (EE only).

   3. **Table remapping engaged** — a *query-time data state*. True iff
      `:model/TableRemapping` rows exist for the database. The
      `(ws.remapping/enabled-for-db? db-id)` predicate. Today this implies
      workspace-managed (transforms create the rows when the database has a
      workspace schema), but the rewriting machinery responds purely to row
      existence — it doesn't check workspace mode.

   ## What this namespace gates

   `check-not-in-workspace-mode!` uses concept (1) — the *instance-level*
   check. Features blocked here (DB routing, impersonation, writeback, CSV
   upload, model persistence enable) are refused on a child instance entirely,
   not per-database. Rationale: workspace children boot with empty everything
   except content; per Dan in proj-workspaces 2026-04-30, those features can't
   already be configured. The instance-level gate is simpler and defensive —
   no escape hatch.

   If a future use case requires running a feature against a non-workspace-
   managed database on a child, refine the call sites to per-database checks
   using the EE `db-workspace-namespace` predicate.

   ## OSS vs EE

   The OSS jar has no workspace mode (`workspace-mode?` returns false), so
   the gates are no-ops. The EE impl in `metabase-enterprise.workspaces.core`
   reads the `workspaces-enabled` setting."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise workspace-mode?
  "True if this instance is running in workspace mode — the EE `workspaces-enabled`
   setting is on.

   For the per-database check, use the EE function
   `metabase-enterprise.workspaces.core/db-workspace-namespace` (returns the
   workspace-isolated output namespace map if this instance is in workspace mode
   AND the database has a `database-workspace-schema`).

   The OSS fallback returns false."
  metabase-enterprise.workspaces.core
  []
  false)

(defenterprise workspace-database-exists?
  "True if any workspace has a database row for the Database with `database-id`. The OSS
   fallback returns false, since OSS has no workspaces."
  metabase-enterprise.workspaces.core
  [_database-id]
  false)

(defn check-not-in-workspace-mode!
  "Throws an HTTP 400 `ex-info` if this instance is running in workspace mode.

   Use at API entry points for features that must be refused on a workspace
   child instance (DB routing, connection impersonation, writeback, CSV upload,
   model persistence enable). The check is *instance-level*, not per-database
   — see namespace docstring for the rationale."
  [feature-name]
  (when (workspace-mode?)
    (throw (ex-info (str feature-name " is not supported on a workspace instance.")
                    {:status-code 400
                     :feature feature-name
                     :workspace-mode true}))))
