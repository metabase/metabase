(ns metabase.workspaces.core
  "OSS-side public API for workspace mode.

   Workspace mode is an instance-level state set at boot from `config.yml`'s
   `:workspace` section. A workspace child instance reads/writes through the
   workspace-isolated schema; certain features (DB routing, connection
   impersonation, writeback, CSV upload, model persistence) are incompatible
   with workspace remapping and must be refused on a workspace child.

   The OSS jar has no workspace mode (always returns false), so these
   `defenterprise` shims are no-ops there. The EE impl reads
   `metabase-enterprise.workspaces.core/instance-workspace`."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise workspace-mode?
  "True iff this instance is running in workspace mode (a `:workspace` section
   was loaded from `config.yml` at boot).

   Use this as the single gate for refusing features that conflict with
   workspace table remapping. The OSS fallback returns false."
  metabase-enterprise.workspaces.core
  []
  false)

(defn check-not-in-workspace-mode!
  "Throws an HTTP 400 `ex-info` if this instance is running in workspace mode.
   Use at API entry points for features that must be refused on a workspace
   child instance (DB routing, connection impersonation, writeback, CSV upload,
   model persistence enable)."
  [feature-name]
  (when (workspace-mode?)
    (throw (ex-info (str feature-name " is not supported on a workspace instance.")
                    {:status-code 400
                     :feature feature-name
                     :workspace-mode true}))))
