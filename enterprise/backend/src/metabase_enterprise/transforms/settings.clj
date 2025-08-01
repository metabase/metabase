(ns metabase-enterprise.transforms.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting transform-schedule
  (deferred-tru "The schedule for automatic execution of scheduled transforms")
  :type       :string
  :visibility :settings-manager
  :default    "0 0 0 * * ? *"
  #_#_:feature    :transform
  :doc        false
  :export?    true
  :encryption :no
  :audit      :getter)
