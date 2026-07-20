(ns metabase-enterprise.workspaces.instance
  "Instance-side workspace state. When a Metabase boots in workspace mode, the
   `:workspace` section loader (`metabase-enterprise.advanced-config.file.workspace`)
   parses `config.yml` and stores the resulting workspace map in the
   `instance-workspace` setting. Workspace-aware code (transform target
   rewriting, table-remapping QP middleware) reads from the setting via
   [[workspace-mode?]] / [[db-workspace-namespace]]. The setting lives in the
   instance's own application database — child instances have their own app DB,
   so storing it there persists the workspace across restarts without leaking
   between parent and child."
  (:require
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.malli :as mu]
   [metabase.workspaces.core :as ws]))

(set! *warn-on-reflection* true)

(defn- coerce-database-id-key
  "JSON round-trips through the `instance-workspace` setting return integer
   `Database.id` keys as keywords (e.g. `:1`). Coerce them back to ints."
  [k]
  (cond
    (int? k)     k
    (keyword? k) (parse-long (name k))
    (string? k)  (parse-long k)))

(defn- normalize-database-keys
  "Coerce the `:databases` map keys to ints. See [[coerce-database-id-key]]."
  [config]
  (some-> config
          (update :databases #(update-keys % coerce-database-id-key))))

(mu/defn set-instance-workspace! :- :nil
  "Store the workspace config in the `instance-workspace` setting. Replaces any
   prior value. The shape is validated against `::ws/workspace-instance-config`."
  [config :- ::ws/workspace-instance-config]
  (ws.settings/instance-workspace! config)
  nil)

(defn clear-instance-workspace!
  "Clear the `instance-workspace` setting."
  []
  (ws.settings/instance-workspace! nil)
  nil)

(defn instance-workspace
  "Return the workspace loaded on this instance, or nil if none."
  []
  (normalize-database-keys (ws.settings/instance-workspace)))

(defenterprise workspace-mode?
  "EE impl: true iff this instance is running in workspace mode (the
   `instance-workspace` setting is populated — either from a `:workspace` section
   of `config.yml` at boot or by a `POST /api/ee/advanced-config`). Single
   source of truth for gating features that conflict with workspace remapping
   (DB routing, impersonation, writeback, CSV upload, model persistence). Use
   [[db-workspace-namespace]] when you need per-database scoping.

   Deliberately ungated on premium features: a workspace child instance bootstraps
   from `config.yml` *before* its token is installed; if the workspace map is
   loaded, we refuse incompatible features regardless of token state."
  :feature :none
  []
  (some? (ws.settings/instance-workspace)))

(defn db-workspace-namespace
  "Return the workspace-isolated output namespace map for `db-id` on this
   instance, or `nil` when this instance is not running a workspace or the
   workspace has no entry for `db-id`. The namespace map is
   `{:db ?, :schema ?}` - either or both keys may be absent depending on
   the driver's `qualified-name-components`. Reads from the `instance-workspace`
   setting."
  [db-id]
  (get-in (instance-workspace) [:databases db-id :output]))
