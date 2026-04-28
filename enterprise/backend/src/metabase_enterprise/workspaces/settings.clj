(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase-enterprise.workspaces.models.table-remapping]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.table-remapping/keep-me)

(defsetting has-remappings-enabled
  (deferred-tru "Whether the table remapping feature is available on this instance. True when at least one TableRemapping row exists.")
  :type       :boolean
  :visibility :authenticated
  :export?    false
  :setter     :none
  :getter     (fn [] (t2/exists? :model/TableRemapping))
  :audit      :never
  :doc        false)
