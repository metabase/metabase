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

(defn- check-and-update-settings-cache
  "If the request's cookie holds a marker other than the cached `settings-last-updated` marker, check whether the
  settings cache is stale and reload it if so. Returns truthy iff the cookie differs."
  [request]
  (when-let [cookie-marker (get-in request [:cookies settings-last-updated-cookie-name :value])]
    (when (not= cookie-marker (setting/cache-last-updated-at))
      (log/info "Settings cookie differs from the cached settings marker. Checking whether the cache is stale...")
      (setting/restore-cache-if-needed! :force-check? true)
      ::checked)))

(defn- maybe-set-settings-last-updated-cookie
  "When `checked?` (the request's cookie differed from the cached marker) or when this request changed a setting (the
  response has `:cookie/settings-cache-timestamp`), set the cookie to the cached marker. With no cached marker,
  expire the cookie if `checked?`."
  [checked? response]
  (if (or checked?
          (-> response :mb/cookies :cookie/settings-cache-timestamp))
    (if-let [marker (setting/cache-last-updated-at)]
      (response/set-cookie (update response :mb/cookies dissoc :cookie/settings-cache-timestamp)
                           settings-last-updated-cookie-name
                           marker
                           cookie-options)
      ;; A cookie left in place would force a check on every request until it expires.
      (cond-> response
        checked? (response/set-cookie settings-last-updated-cookie-name "" (assoc cookie-options :max-age 0))))
    response))

(defn wrap-settings-cache-check
  "Middleware that checks if settings need to be refreshed based on a cookie value.

  When a request changes a setting, its response sets a cookie holding the cached `settings-last-updated` marker. A
  later request whose cookie differs from this instance's cached marker forces a check of the settings cache, so an
  instance sees another instance's change without waiting for the periodic check."
  [handler]
  (fn [request respond raise]
    (let [checked? (check-and-update-settings-cache request)]
      (handler request (comp respond #(maybe-set-settings-last-updated-cookie checked? %)) raise))))
