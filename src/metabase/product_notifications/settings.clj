(ns metabase.product-notifications.settings
  "Internal synchronization settings for product notifications."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting product-notifications-last-synced-at
  (deferred-tru "Timestamp of the last successful product notification sync.")
  :type               :timestamp
  :default            nil
  :encryption         :no
  :visibility         :internal
  :export?            false
  :doc                false
  :audit              :never
  :include-in-list?   false
  :can-read-from-env? false)
