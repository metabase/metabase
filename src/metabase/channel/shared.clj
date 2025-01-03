(ns metabase.channel.shared
  "Shared functions for channel implementations."
  (:require
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.notification.payload.disk-map :as notification.disk-map]
   [metabase.util.i18n :refer [tru]]))

(defn validate-channel-details
  "Validate a value against a schema and throw an exception if it's invalid.
  The :errors key are used on the UI to display field-specific error messages."
  [schema value]
  (when-let [errors (some-> (mc/explain schema value)
                            me/humanize)]
    (throw (ex-info (tru "Invalid channel details") {:errors errors}))))

(defn- maybe-realize
  [x]
  (cond->> x
    (notification.disk-map/disk-map? x)
    (into {})))

(defn realize-qp-data
  [part]
  (update-in part [:result :data] maybe-realize))
