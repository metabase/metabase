(ns metabase-enterprise.transforms.settings
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

(setting/defsetting transforms-seeded
  (deferred-tru "Indicates whether default transform tags and jobs have been seeded.")
  :type       :boolean
  :default    false
  :visibility :internal
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)
