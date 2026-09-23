(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting workspaces-enabled
  (deferred-tru "Whether transforms write their output tables into the workspace schema of each database instead of their configured target schema.")
  :type       :boolean
  :default    false
  :visibility :admin
  :feature    :workspaces
  :export?    false
  :audit      :getter)

(defsetting workspaces-schema
  (deferred-tru "The schema transforms write their output tables to while workspaces are enabled. Metabase does not create it.")
  :type           :string
  :visibility     :admin
  :feature        :workspaces
  :driver-feature :schemas
  :export?        false
  :encryption     :no
  :database-local :only)
