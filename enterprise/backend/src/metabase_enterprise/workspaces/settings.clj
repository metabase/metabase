(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase-enterprise.workspaces.models.table-remapping :as table-remapping]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(def keep-me
  "Marker so callers can `(comment ...keep-me)` to retain the require that registers the settings in this ns."
  nil)

(defsetting database-enable-workspaces
  (deferred-tru "Whether to enable Workspaces for a specific Database.")
  :default        false
  :type           :boolean
  :feature        :workspaces
  :driver-feature :workspace
  :visibility     :public
  :export?        false
  :database-local :only)

(defsetting instance-workspace
  (deferred-tru "The workspace loaded on this instance. Populated at boot from a config.yml `:workspace` section or at runtime via `POST /api/ee/advanced-config`. `nil` on parent and unconfigured instances. Read by the QP, transform hooks, and the EE `workspace-mode?` predicate via `metabase-enterprise.workspaces.core/instance-workspace`.")
  :type       :json
  :encryption :no
  :visibility :internal
  :export?    false
  :audit      :never
  :doc        false
  ;; Outside workspace mode a node trusts its cache of the Databases with remappings, and rows may have changed
  ;; while it was in workspace mode. Fires on every node when its settings cache picks up the change.
  :on-change  (fn [_old _new] (table-remapping/invalidate-database-ids!)))
