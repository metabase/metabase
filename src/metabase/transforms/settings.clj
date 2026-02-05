(ns metabase.transforms.settings
  (:require
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(setting/defsetting transform-timeout
  (deferred-tru "The timeout for a transform job, in minutes.")
  :type       :integer
  :visibility :internal
  :default    (* 4 60)
  :feature    :transforms
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting transforms-enabled
  (deferred-tru "Enable transforms for instances that have not explicetly purchased the transform add-on")
  :type       :boolean
  :visibility :authenticated
  :default    false
  :feature    :transforms
  :audit      :getter)
