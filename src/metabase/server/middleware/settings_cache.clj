(ns metabase.server.middleware.settings-cache
  "Ring middleware to check for settings updates based on a cookie value."
  (:require
   [clojure.core :as core]
   [metabase.settings.models.setting.cache :as setting.cache]
   [metabase.util.log :as log]))

(def ^:private settings-last-updated-cookie-name "metabase.SETTINGS_LAST_UPDATED")

(defn- check-and-update-settings-cache
  "Check if the cookie timestamp is newer than our cached timestamp, and if so, update the cache."
  [request]
  (when-let [cookie-timestamp (get-in request [:cookies settings-last-updated-cookie-name :value])]
    (let [current-cache        (setting.cache/cache)
          last-known-update    (core/get current-cache setting.cache/settings-last-updated-key)]
      ;; If the cookie timestamp is newer than our cached timestamp, restore the cache
      (when (and last-known-update
                 (> (compare cookie-timestamp last-known-update) 0))
        (log/debug "Settings cookie indicates cache is out of date. Refreshing...")
        (setting.cache/restore-cache!)))))

(defn wrap-settings-cache-check
  "Middleware that checks if settings need to be refreshed based on a cookie value.

  When a setting is updated, the API sets a cookie with the settings-last-updated timestamp.
  This middleware checks that cookie on subsequent requests and updates the local cache if needed,
  ensuring consistency in multi-instance deployments without waiting for the 60-second polling interval."
  [handler]
  (fn [request respond raise]
    (check-and-update-settings-cache request)
    (handler request respond raise)))
