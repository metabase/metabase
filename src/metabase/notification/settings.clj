(ns metabase.notification.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting notification-thread-pool-size
  "The size of the thread pool used to send notifications."
  :default    3
  :export?    false
  :type       :integer
  :visibility :internal
  :doc "If Metabase stops sending notifications like alerts, it may be because long-running
  queries are clogging the notification queue. You may be able to unclog the queue by
  increasing the size of the thread pool dedicated to notifications.")

(defsetting notification-system-event-thread-pool-size
  "The size of the thread pool used to send system event notifications."
  :default    5
  :export?    false
  :type       :integer
  :visibility :internal)

(defsetting notification-temp-file-size-max-bytes
  "The maximum file size that will be created when storing notification query results on disk.
  Note this is in BYTES. Default value is 10485760 which is `10 * 1024 * 1024`. To disable this size limit set the
  value to 0."
  :type :integer
  :default (* 10 1024 1024)
  :export? false
  :setter :none
  :visibility :internal
  :can-read-from-env? true
  :doc true)
