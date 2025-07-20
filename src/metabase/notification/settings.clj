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
