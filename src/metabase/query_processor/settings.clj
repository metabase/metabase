(ns metabase.query-processor.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting enable-pivoted-exports
  (deferred-tru "Enable pivoted exports and pivoted subscriptions")
  :type       :boolean
  :default    true
  :export?    true
  :visibility :authenticated
  :audit      :getter)
