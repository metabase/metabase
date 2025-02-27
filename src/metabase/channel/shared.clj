(ns metabase.channel.shared
  "Shared functions for channel implementations."
  (:require
   [malli.error :as me]
   [medley.core :as m]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]))

(defn validate-channel-details
  "Validate a value against a schema and throw an exception if it's invalid.
  The :errors key are used on the UI to display field-specific error messages."
  [schema value]
  (when-let [errors (some-> (mr/explain schema value)
                            me/humanize)]
    (throw (ex-info (tru "Invalid channel details") {:errors errors}))))

(defn- maybe-deref
  [x]
  (if (instance? clojure.lang.IDeref x)
    @x
    x))

(defn realize-data-rows
  "Realize the data rows in a [[metabase.notification.payload.execute/Part]]"
  [part]
  (when part
    (m/update-existing-in part [:result :data :rows] maybe-deref)))
