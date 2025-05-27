(ns metabase.notification.settings
  (:require
   [java-time.api :as t]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.date-2 :as u.date])
  (:import
   (java.time ZonedDateTime)))

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

(defsetting notification-suppression-cutoff
  "Timestamp that serves as an anchor point for notifications.
  Timestamp should be ISO 8601 format and in UTC.
  Tip: Use the `date -u -Iseconds` command to get the current time in UTC.

  Used for staging instances to skip sending existing notifications."
  :type       :string
  :default    nil
  :encryption :no
  :export?    false
  :cache?     false
  :getter     (fn []
                (when-let [timestamp (some-> (setting/get-value-of-type :string :notification-suppression-cutoff)
                                             u.date/parse ;; expects ISO 8601 format
                                             (#(.toOffsetDateTime ^ZonedDateTime %)))]
                  (assert (t/< timestamp (t/offset-date-time)) "Cutoff timestamp must be in the past")
                  timestamp))
  :visibility :internal)
