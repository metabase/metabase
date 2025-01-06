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
  [x data-provider]
  (if (notification.payload/entry-ref? x)
    (notification.payload/retrieve-by-path data-provider x)
    x))

(defn realize-qp-data-rows
  "Sometimes rows of a query result are stored on disk to reduce memory usage, so we need to read it on-demand."
  [part data-provider]
  (update-in part [:data :rows] maybe-retrieve data-provider))
