(ns metabase.server.middleware.settings-cache
  "Ring middleware to check for settings updates based on a cookie value."
  (:require
   [metabase.settings.core :as setting]
   [metabase.util.log :as log]
   [ring.util.response :as response]))

(def ^:private settings-last-updated-cookie-name "metabase.SETTINGS_LAST_UPDATED")

(def ^:private cookie-options
  {:path      "/"
   :max-age   (* 5 60)
   :same-site :lax})

(defn- check-settings-cache-if-cookie-differs!
  "If the request's cookie holds a marker other than the cached `settings-last-updated` marker, check whether the
  settings cache is stale and reload it if so. Returns truthy iff the cookie differs."
  [request]
  (when-let [cookie-marker (get-in request [:cookies settings-last-updated-cookie-name :value])]
    (when (not= cookie-marker (setting/cached-marker))
      (log/info "Settings cookie differs from the cached settings marker. Checking whether the cache is stale...")
      (setting/restore-cache-if-needed! :force-check? true)
      ::cookie-differed)))

(defn- maybe-set-settings-last-updated-cookie
  "When `cookie-differed?` or when this request changed a setting (the response has
  `:cookie/settings-cache-timestamp`), set the cookie to the cached marker. With no cached marker, expire the cookie if
  `cookie-differed?`."
  [cookie-differed? response]
  (if (or cookie-differed?
          (-> response :mb/cookies :cookie/settings-cache-timestamp))
    (if-let [marker (do
                      ;; A setting written in a transaction leaves a check due after the commit, and the cookie must
                      ;; carry that write's marker.
                      (when-not cookie-differed?
                        (setting/restore-cache-if-needed!))
                      (setting/cached-marker))]
      (response/set-cookie (update response :mb/cookies dissoc :cookie/settings-cache-timestamp)
                           settings-last-updated-cookie-name
                           marker
                           cookie-options)
      ;; A cookie left in place would force a check on every request until it expires.
      (cond-> response
        cookie-differed? (response/set-cookie settings-last-updated-cookie-name "" (assoc cookie-options :max-age 0))))
    response))

(defn wrap-settings-cache-check
  "Middleware that forces a check of the settings cache when the request's settings cookie differs from the cached
  `settings-last-updated` marker, and sets the cookie to the cached marker in the response to such a request or to one
  that changed a setting."
  [handler]
  ;; The cookie carries the marker of a setting change from the instance that made it to the instance that serves the
  ;; user's next request, so that instance sees the change without waiting for the periodic check.
  (fn [request respond raise]
    (let [cookie-differed? (check-settings-cache-if-cookie-differs! request)]
      (handler request (comp respond #(maybe-set-settings-last-updated-cookie cookie-differed? %)) raise))))
