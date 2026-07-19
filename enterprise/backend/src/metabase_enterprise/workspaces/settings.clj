(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting database-enable-workspaces
  (deferred-tru "Whether to enable Workspaces for a specific Database.")
  :default        false
  :type           :boolean
  :feature        :workspaces
  :driver-feature :workspace
  :visibility     :public
  :export?        false
  :database-local :only)

(defsetting workspace-instance-user-password
  (deferred-tru "Default password for the workspace creator''s superuser account on workspace child instances.")
  :type       :string
  :visibility :admin
  :encryption :when-encryption-key-set
  :sensitive? true
  :audit      :never
  :export?    false
  :doc        false)

(defsetting instance-workspace
  (deferred-tru "The workspace loaded on this instance. Populated at boot from a config.yml `:workspace` section or at runtime via `POST /api/ee/advanced-config`. `nil` on parent and unconfigured instances. Read by the QP, transform hooks, and the EE `workspace-mode?` predicate via `metabase-enterprise.workspaces.instance/instance-workspace`.")
  :type       :json
  :encryption :no
  :visibility :internal
  :export?    false
  :audit      :never
  :doc        false)
