(ns metabase.health-inspector.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting health-inspector-enabled
  (deferred-tru "Enable or disable all health inspector checks.")
  :type       :boolean
  :default    false
  :doc        false
  :visibility :admin
  :export?    false
  :audit      :getter)
