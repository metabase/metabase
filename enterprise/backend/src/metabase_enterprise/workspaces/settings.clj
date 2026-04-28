(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase-enterprise.workspaces.models.table-remapping]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.workspaces.models.table-remapping/keep-me
  metabase-enterprise.workspaces.models.workspace-database/keep-me)

(defsetting has-remappings-enabled
  (deferred-tru "Whether the table remapping feature is available on this instance. True on instances configured as workspace children (any provisioned workspace_database row) or whenever at least one TableRemapping row exists.")
  :type       :boolean
  :visibility :authenticated
  :export?    false
  :setter     :none
  :getter     (fn []
                (or (t2/exists? :model/WorkspaceDatabase :status :provisioned)
                    (t2/exists? :model/TableRemapping)))
  :audit      :never
  :doc        false)
