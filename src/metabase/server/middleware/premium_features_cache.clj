(ns metabase.server.middleware.premium-features-cache
  "Ring middleware to propagate premium-features cache invalidation across instances via a cookie.
  When one instance refreshes features (via POST /api/premium-features/token/refresh), it sets a cookie
  with the current timestamp. Other instances see this cookie and clear their local token caches so the
  next feature check reads fresh data from the shared DB cache table."
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def ^:private cookie-name "metabase.PREMIUM_FEATURES_LAST_UPDATED")

(def ^:private last-known-invalidation (atom nil))

(defn- check-and-invalidate-features-cache
  "Check if the cookie timestamp is newer than our last known invalidation, and if so, clear the cache."
  [request]
  (when-let [cookie-timestamp (get-in request [:cookies cookie-name :value])]
    (let [last-known @last-known-invalidation]
      (when (and cookie-timestamp
                 (or (nil? last-known)
                     (try (pos? (compare cookie-timestamp last-known))
                          (catch Exception _e
                            (log/infof "Strange premium features cookie value: %s" cookie-timestamp)
                            false))))
        (log/info "Premium features cookie indicates cache is out of date. Clearing...")
        (premium-features/clear-local-cache!)
        (reset! last-known-invalidation cookie-timestamp)
        ::invalidated))))

(defn- maybe-set-premium-features-cookie
  "Set the premium features last-updated cookie if this request triggered a refresh or propagated an invalidation."
  [invalidated? response]
  (if (or invalidated?
          (-> response :mb/cookies :cookie/premium-features-cache-timestamp))
    (let [timestamp (str (java.time.Instant/now))]
      (reset! last-known-invalidation timestamp)
      (response/set-cookie (update response :mb/cookies dissoc :cookie/premium-features-cache-timestamp)
                           cookie-name
                           timestamp
                           {:path      "/"
                            :max-age   (* 5 60)
                            :same-site :lax}))
    response))

(defn wrap-premium-features-cache-check
  "Middleware that checks if the premium features cache needs to be invalidated based on a cookie.

  When premium features are refreshed on one instance, the API sets a cookie with the current timestamp.
  This middleware checks that cookie on subsequent requests and clears the local cache if needed,
  ensuring consistency in multi-instance deployments."
  [handler]
  (fn [request respond raise]
    (let [invalidated? (check-and-invalidate-features-cache request)]
      (handler request (comp respond #(maybe-set-premium-features-cookie invalidated? %)) raise))))
