(ns metabase.server.middleware.premium-features-cache
  "Ring middleware to propagate premium-features cache invalidation across instances via a cookie.
  When one instance refreshes features (via POST /api/premium-features/token/refresh), it sets a cookie
  with the current timestamp. Other instances see this cookie and drop their in-process token caches so
  the next feature check re-validates against the shared DB cache, and only re-fetches from the MetaStore
  if that shows the other instance really did get a different token status.

  The cookie is client-controlled and arrives on unauthenticated requests, so it is a hint, never an
  authority: it must parse as a timestamp, must not be in the future, must be newer than the last
  invalidation this instance saw, and can only ever clear this instance's in-memory caches. It never deletes
  the deployment's shared DB cache."
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]
   [ring.util.response :as response])
  (:import
   (java.time Duration Instant)
   (java.time.format DateTimeParseException)))

(set! *warn-on-reflection* true)

(def ^:private cookie-name "metabase.PREMIUM_FEATURES_LAST_UPDATED")

(def ^:private ^Duration max-clock-skew
  "How far in the future a cookie timestamp may be and still be honored, to allow for clock drift between instances."
  (Duration/ofMinutes 1))

(def ^:private max-cookie-length
  "An ISO-8601 instant is at most ~30 characters; anything longer is not one of ours."
  40)

(def ^:private last-known-invalidation
  "The newest invalidation this instance has seen or emitted, as an `Instant`. Any cookie at or before it is ignored,
  so a given cookie value can trigger a local clear at most once."
  (atom nil))

(defn- parse-cookie-timestamp
  "Parse a cookie value as an `Instant`. Returns nil for anything that is not a well-formed, non-future timestamp."
  ^Instant [value]
  (when (and (string? value)
             (<= (count value) max-cookie-length))
    (try
      (let [instant (Instant/parse ^String value)]
        (when-not (.isAfter instant (.plus (Instant/now) max-clock-skew))
          instant))
      (catch DateTimeParseException _e
        (log/debug "Ignoring malformed premium features cookie value")
        nil))))

(defn- check-and-invalidate-features-cache
  "If the request cookie carries a valid timestamp newer than the last invalidation this instance knows about, drop
  this instance's in-process token caches. Never touches the shared DB cache."
  [request]
  (when-let [cookie-timestamp (parse-cookie-timestamp (get-in request [:cookies cookie-name :value]))]
    (let [last-known ^Instant @last-known-invalidation]
      (when (or (nil? last-known)
                (.isAfter cookie-timestamp last-known))
        (log/info "Premium features cookie indicates local cache is out of date. Clearing...")
        (reset! last-known-invalidation cookie-timestamp)
        (premium-features/clear-local-cache!)))))

(defn- maybe-set-premium-features-cookie
  "Set the premium features last-updated cookie if this request refreshed the token status."
  [response]
  (if (-> response :mb/cookies :cookie/premium-features-cache-timestamp)
    (let [timestamp (Instant/now)]
      (reset! last-known-invalidation timestamp)
      (response/set-cookie (update response :mb/cookies dissoc :cookie/premium-features-cache-timestamp)
                           cookie-name
                           (str timestamp)
                           {:path      "/"
                            :max-age   (* 5 60)
                            :same-site :lax}))
    response))

(defn wrap-premium-features-cache-check
  "Middleware that checks if the local premium features cache needs to be invalidated based on a cookie.

  When premium features are refreshed on one instance, the API sets a cookie with the current timestamp.
  This middleware checks that cookie on subsequent requests and clears the local cache if needed,
  ensuring consistency in multi-instance deployments."
  [handler]
  (fn [request respond raise]
    (check-and-invalidate-features-cache request)
    (handler request (comp respond maybe-set-premium-features-cookie) raise)))
