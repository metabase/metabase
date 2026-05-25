(ns metabase.workspaces.core
  "OSS-side public API for workspace mode.

   ## Three related-but-distinct concepts

   1. **Workspace mode** — an *instance-level boot state*. True iff the instance
      loaded a `:workspace` section from `config.yml` at boot. Set once, doesn't
      change. The `workspace-mode?` predicate.

   2. **Workspace-managed database** — a *database-scoped state*. True iff this
      instance is in workspace mode AND the workspace's `:databases` map includes
      this database. The `(ws/db-workspace-namespace db-id)` predicate (EE only).

   3. **Table remapping engaged** — a *query-time data state*. True iff
      `:model/TableRemapping` rows exist for the database. The
      `(ws.remapping/enabled-for-db? db-id)` predicate. Today this implies
      workspace-managed (transforms create the rows when the database is in
      the workspace map), but the rewriting machinery responds purely to row
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
   reads the `instance-workspace` setting."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.malli.registry :as mr]))

;;; ----------------------------- Workspace config schemas ----------------------------------

(mr/def ::table-namespace
  "A `{:db ?, :schema ?}` namespace map. Either or both keys may be present
   depending on the driver's `qualified-name-components`; at least one must
   populate. Empty-string `\"\"` is reserved for the storage layer; the atom
   carries `nil`/missing for absent slots."
  [:and
   [:map
    [:db     {:optional true} [:maybe :string]]
    [:schema {:optional true} [:maybe :string]]]
   [:fn {:error/message "table namespace must populate at least one of :db or :schema"}
    (fn [m] (or (some? (:db m)) (some? (:schema m))))]])

(mr/def ::workspace-database-config
  "Per-database workspace config: `:input_schemas` is a vector of driver-opaque
   schema names (the source schemas the workspace reads from) — may be empty
   on drivers with no schema layer (e.g. MySQL), where the bound DB itself acts
   as the implicit input namespace; `:output` is a single namespace map (the
   workspace's isolation schema, expanded with the warehouse catalog at boot)."
  [:map
   [:input_schemas [:vector :string]]
   [:output        ::table-namespace]])

(mr/def ::workspace-instance-config
  "The shape stored in the EE `instance-workspace` setting after the `:workspace`
   config.yml loader has resolved database names to ids. Database keys are integer
   ids (post-resolution); the wire format with name keys lives in
   `metabase-enterprise.advanced-config.file.workspace`."
  [:map
   [:name      [:string {:min 1}]]
   [:databases [:map-of
                {:decode/json #(update-keys % (fn [k] (cond-> k (keyword? k) (-> name parse-long))))}
                :int ::workspace-database-config]]])

(defenterprise workspace-mode?
  "True if this instance is running in workspace mode — a `:workspace` section
   was loaded from `config.yml` at boot. Instance-level state set once at boot.

   For the per-database check, use the EE function
   `metabase-enterprise.workspaces.core/db-workspace-namespace` (returns the
   workspace-isolated output namespace map if this instance is in workspace mode
   AND the workspace's `:databases` map includes this database).

   The OSS fallback returns false."
  metabase-enterprise.workspaces.core
  []
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
