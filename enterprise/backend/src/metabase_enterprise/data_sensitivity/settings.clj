(ns metabase-enterprise.data-sensitivity.settings
  "Settings for the data-sensitivity classifier."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting data-sensitivity-jev-api-key
  (deferred-tru "API key for the TypeSafe Jev model used by the data-sensitivity classifier.")
  :type       :string
  :sensitive? true
  :visibility :internal
  :export?    false
  :doc        false)
