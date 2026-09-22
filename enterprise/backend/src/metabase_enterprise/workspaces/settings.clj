(ns metabase-enterprise.workspaces.settings
  "Settings for workspaces.

  There is deliberately no instance-wide on/off setting. An instance holds many workspaces at once, so \"are
  workspaces on\" is not a property it has: what matters is whether the caller is *in* one, which
  [[metabase.workspaces.core/*current-workspace-id*]] answers per request. A boolean here could only say
  \"someone, somewhere\", and would have to agree with the binding everywhere both were read.

  The token feature is the instance-level gate."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting workspaces-schema
  (deferred-tru "The schema transforms write their output tables to while running in a workspace. Metabase does not create it.")
  :type           :string
  :visibility     :admin
  :feature        :workspaces
  :driver-feature :schemas
  :export?        false
  :encryption     :no
  :database-local :only)
