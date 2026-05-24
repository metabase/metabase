(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(def keep-me
  "Marker so callers can `(comment ...keep-me)` to retain the require that registers the settings in this ns."
  nil)

(defsetting workspace-instance
  (deferred-tru "The workspace loaded on this instance. Populated at boot from a config.yml `:workspace` section or at runtime via `POST /api/ee/workspace-instance/current`. `nil` on parent and unconfigured instances. Read by the QP and transform hooks via `metabase-enterprise.workspaces.core/instance-workspace`.")
  :type       :json
  :encryption :no
  :visibility :internal
  :export?    false
  :audit      :never
  :doc        false)

(defsetting workspace-mode?
  (deferred-tru "True if a workspace is loaded on this instance. Read-only projection of `workspace-instance`; false on parent and unconfigured instances. Single source of truth for the EE `metabase-enterprise.workspaces.core/workspace-mode?` predicate.")
  :type       :boolean
  :visibility :admin
  :export?    false
  :setter     :none
  :getter     (fn [] (some? (workspace-instance)))
  :audit      :never
  :doc        false)
