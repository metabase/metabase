(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting workspace-mode
  (deferred-tru "Workspace mode for this instance - :main or :development. The main instance manages workspaces; development instances iterate on transforms in isolation.")
  :type       :keyword
  :visibility :admin
  :export?    false
  :encryption :no
  :default    :main)
