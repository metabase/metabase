(ns metabase.channel.shared
  "Shared functions for channel implementations."
  (:require
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.util.i18n :refer [tru]]))

(defn validate-channel-details
  "Validate a value against a schema and throw an exception if it's invalid.
  The :errors key are used on the UI to display field-specific error messages."
  [schema value]
  (when-let [errors (some-> (mc/explain schema value)
                            me/humanize)]
    (throw (ex-info (tru "Invalid channel details") {:errors errors}))))

(defn- maybe-retrieve
  [x]
  (if (notification.payload/notification-storage? x)
    (notification.payload/retrieve x)
    x))

(defn realize-data-rows
  "Realize the data rows in a [[metabase.notification.payload.execute/Part]]"
  [part]
  (update-in part [:result :data :rows] maybe-retrieve))
