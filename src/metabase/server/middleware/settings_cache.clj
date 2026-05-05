(ns metabase.server.middleware.settings-cache
  "Ring middleware to check for settings updates based on a cookie value."
  (:require
   [metabase.settings.core :as setting]
   [metabase.util.log :as log]
   [ring.util.response :as response]))

(def ^:private settings-last-updated-cookie-name "metabase.SETTINGS_LAST_UPDATED")

(defn- check-and-update-settings-cache
  "Check if the cookie timestamp is newer than our cached timestamp, and if so, update the cache."
  [request]
  (when-let [cookie-timestamp (get-in request [:cookies settings-last-updated-cookie-name :value])]
    (let [last-known-update   (setting/cache-last-updated-at)]
      ;; If the cookie timestamp is newer than our cached timestamp, restore the cache
      (when (and last-known-update
                 (try (pos? (compare cookie-timestamp last-known-update))
                      (catch Exception _e
                        (log/infof "Strange last known update cookie: %s" cookie-timestamp)
                        false)))
        (log/info "Settings cookie indicates cache is out of date. Refreshing...")
        (setting/restore-cache!)
        ::restored))))

(defn- maybe-set-settings-last-updated-cookie
  "Set the most recent settings cache update timestamp if this request changed a setting (it will have
  the :cookie/settings-cache-timestamp) or if this request caused a cache to be updated."
  [restored? response]
  (if (or restored?
          (-> response :mb/cookies :cookie/settings-cache-timestamp))
    (if-let [timestamp (setting/cache-last-updated-at)]
      (response/set-cookie (update response :mb/cookies dissoc :cookie/settings-cache-timestamp)
                           settings-last-updated-cookie-name
                           timestamp
                           {:path      "/"
                            :max-age   (* 5 60)
                            :same-site :lax})
      response)
    response))

(defn wrap-settings-cache-check
  "Middleware that checks if settings need to be refreshed based on a cookie value.

  When a setting is updated, the API sets a cookie with the settings-last-updated timestamp.
  This middleware checks that cookie on subsequent requests and updates the local cache if needed,
  ensuring consistency in multi-instance deployments without waiting for the 60-second polling interval."
  [handler]
  (fn [request respond raise]
    (let [restored? (check-and-update-settings-cache request)]
      (handler request (comp respond #(maybe-set-settings-last-updated-cookie restored? %)) raise))))
