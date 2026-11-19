(ns metabase.notification.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.log :as log]))

(defsetting notification-thread-pool-size
  "The size of the thread pool used to send notifications."
  :default    3
  :export?    false
  :type       :integer
  :visibility :internal
  :doc "If Metabase stops sending notifications like alerts, it may be because long-running
  queries are clogging the notification queue. You may be able to unclog the queue by
  increasing the size of the thread pool dedicated to notifications.")

(def ^:private default-shutdown-timeout-seconds 20)

(defsetting notification-shutdown-timeout-seconds
  "How long shutdown waits for queued and running notifications to send before it abandons them."
  :default    default-shutdown-timeout-seconds
  :export?    false
  :type       :integer
  :setter     :none
  :visibility :internal
  ;; read during shutdown, where a value that does not parse must not stop the drain; a day at most, so the
  ;; deadline in nanoseconds cannot overflow
  :getter     (fn []
                (try
                  (-> (setting/get-value-of-type :integer :notification-shutdown-timeout-seconds)
                      (max 0)
                      (min 86400))
                  (catch Exception e
                    (log/warnf "Could not read the notification shutdown timeout, so shutdown waits %d seconds: %s"
                               default-shutdown-timeout-seconds
                               (ex-message e))
                    default-shutdown-timeout-seconds)))
  :doc "Metabase stops sending notifications when it shuts down. It sends what is already queued for up to this many
  seconds, then abandons the rest and logs how many were left. The default leaves room for the other shutdown steps
  within the 30-second grace period Kubernetes gives a pod by default. Raise it if your deployment allows a longer
  shutdown and you'd rather wait for slow subscriptions to finish.")

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
