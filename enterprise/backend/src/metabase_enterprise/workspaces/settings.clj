(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting instance-workspace
  (deferred-tru "The workspace installed on this instance, as WorkspaceInstance JSON. Set by `POST /api/ee/workspace-instance/current` or the `MB_INSTANCE_WORKSPACE` env var; unset on an instance that is not a workspace sidecar.")
  ;; A string, not `:json`: `:json` keywordizes every key, and the keys here are database and schema names.
  :type       :string
  :encryption :no
  :visibility :internal
  :export?    false
  :audit      :never
  :doc        false)
