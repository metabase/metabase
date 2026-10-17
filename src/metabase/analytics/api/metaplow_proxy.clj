(ns metabase.analytics.api.metaplow-proxy
  "Public, anonymous Metabase Track telemetry relay for the Embedding SDK.

  The SDK runs inside the customer's page, where the customer's `connect-src` CSP blocks a direct browser POST to the
  Metabase Track collector. The SDK instead points its tracker at this instance — the same host its data calls
  already go to, so it is already CSP-allowlisted — and we forward the payload to the collector server-side, where no
  browser CSP applies. Same arrangement as [[metabase.analytics.api.proxy]], which does this for Snowplow.

  The route is `/send` rather than `/` because the tracker library composes its endpoint as its configured host URL
  plus `/send`; the SDK configures `<instance>/api/metaplow-proxy` as that host URL.

  Status and body are relayed verbatim: the tracker reads a `disabled` flag and a `cache` token out of the
  collector's response body, so a synthesized response would break that protocol.

  Unlike the Snowplow `tp2` payload, Metabase Track event data is arbitrary nested JSON by design, so there is no
  closed schema to validate it against. We validate the envelope the tracker always wraps it in and bound the rest
  with an explicit size cap.

  Body handling: `wrap-json-body` parses the body before this handler runs, so `body` arrives as a map and we
  re-encode it — not a byte-exact relay. Safe here because the tracker produces the body with `JSON.stringify` and
  the collector reads it as JSON, so a parse→encode round trip is semantically lossless."
  (:require
   [clj-http.client :as http]
   [diehard.bulkhead :as dh.bh]
   [diehard.core :as dh]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.api.macros :as api.macros]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.throttle :as u.throttle]
   [throttle.core :as throttle])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(def ^:private forward-timeout-ms 5000)

;; This endpoint is unauthenticated and makes its outbound call inline on the request thread, so an anonymous caller
;; can hold a request thread per call for as long as the forward takes. Same settings as the throttler
;; on [[metabase.analytics.api.proxy]], the sibling relay, so the two public relays do not differ. This bounds the
;; request *rate* per key, not the number of requests in flight; [[forward-bulkhead]] bounds that.
(def ^:private throttler
  (throttle/make-throttler :metaplow-proxy
                           :attempts-threshold 600
                           :attempt-ttl-ms     (* 60 1000)
                           ;; don't punish when throttling, just shed load
                           :initial-delay-ms   1000
                           :delay-exponent     1))

(def ^:private max-concurrent-forwards
  "Total concurrent forwards allowed in flight at once."
  8)

(defonce ^:private
  ^{:doc "Process-wide bulkhead bounding concurrent forwards; see [[max-concurrent-forwards]]."}
  forward-bulkhead
  (dh.bh/bulkhead {:concurrency max-concurrent-forwards}))

(defn- +throttle
  "Middleware that answers 429 for a source address over the rate limit, before request validation and the forward."
  [handler]
  (fn [request respond raise]
    (try
      ;; The bucket key is only as good as the deployment: `ip-address` reads the source-address header
      ;; (`X-Forwarded-For` by default) unless `MB_NOT_BEHIND_PROXY` is set, so it is the real client behind a proxy
      ;; that overwrites that header, and something a caller can pick for itself on a directly-exposed instance. It
      ;; is still the key every other unauthenticated endpoint here throttles on, and the only one available.
      (throttle/check throttler (request/ip-address request))
      (handler request respond raise)
      (catch ExceptionInfo e
        (if (u.throttle/throttle-exception? e)
          ;; No body, unlike the sibling relay's `{:error ...}`. The tracker assigns `cache` from any response it can
          ;; parse as JSON, so a JSON error body would clear the collector's cache token on every throttled send.
          ;; Every other synthesized status in this ns sends no body for the same reason; `Retry-After` carries the
          ;; detail a caller needs.
          (do
            (analytics/inc! :metabase-analytics-relay/rejected {:relay :metaplow, :reason :throttled})
            (respond (u.throttle/throttle-response e nil)))
          (raise e))))))

(def ^:private max-body-bytes
  "Largest payload we will relay. The tracker truncates strings at 500 characters and objects at 50 properties, so a
  real event is a few KB; 64KB leaves generous headroom while still bounding what an anonymous caller can push
  through the instance."
  (* 64 1024))

(def ^:private cache-token-re
  "Shape a cache token has to have before we pass it upstream. The collector issues the token, but it reaches us by
  way of the customer's page, so treat it as caller-controlled and keep it to a bounded run of token characters."
  #"[A-Za-z0-9._~+/=-]{1,512}")

(def ^:private TrackEnvelope
  "The `{:type :payload}` wrapper the tracker library puts around every send. `identify` is not accepted: nothing in
  Metabase calls it, and an anonymous relay has no reason to carry it. Otherwise deliberately open — `:payload`
  carries browser-derived fields the library may add to over time, and `:data` inside it is arbitrary nested JSON."
  ;; `{:closed false}` is what opts a map out of `defendpoint`'s strip-extra-keys decoding — without it the event
  ;; data would be stripped off before we ever forwarded it.
  [:map {:closed false, ::mr/deliberately-open true, :description "a Metabase Track send envelope"}
   [:type    [:enum "event"]]
   [:payload [:map {:closed false, ::mr/deliberately-open true, :description "a Metabase Track event payload"}
              [:website ms/NonBlankString]]]])

(defn- cache-token
  "The tracker echoes the collector's cache token back in `x-track-cache` on later sends, letting the collector skip a
  session lookup. Forward it when it looks like a token, drop it otherwise."
  []
  (when-let [token (some-> (request/current-request) :headers (get "x-track-cache"))]
    (when (re-matches cache-token-re token)
      token)))

(defn- forward!
  [collector-url ^String encoded-body token]
  (try
    (let [response (http/post collector-url
                              (cond-> {:body               encoded-body
                                       :content-type       :json
                                       :connection-timeout forward-timeout-ms
                                       :socket-timeout     forward-timeout-ms
                                       ;; Each redirect hop would get its own full timeout, and the hop target is
                                       ;; chosen by the collector rather than by us. One request, one destination.
                                       :redirect-strategy  :none
                                       :throw-exceptions   false}
                                token (assoc :headers {"x-track-cache" token})))]
      {:status (:status response)
       :body   (:body response)})
    (catch Exception e
      ;; Debug, not warn: the call rate here is set by anonymous callers, so a collector that is down would otherwise
      ;; flood the log. The error counter is the signal, with a stage label that separates relayed SDK events from
      ;; the instance's own sends in [[metabase.analytics.metaplow]].
      (analytics/inc! :metabase-metaplow/errors {:stage :relay-forward!})
      (log/debugf "metaplow-proxy failed forwarding to %s: %s" collector-url (ex-message e))
      ;; The tracker ignores the response on failure, but a fake 2xx would still be a lie about delivery.
      {:status 502 :body nil})))

(defn- do-with-forward-bulkhead
  "Run `thunk` holding a [[forward-bulkhead]] permit, answering 503 when the relay already has
  [[max-concurrent-forwards]] forwards in flight."
  [thunk]
  (try
    (dh/with-bulkhead {:bulkhead forward-bulkhead, :max-wait-ms 0}
      (thunk))
    (catch ExceptionInfo e
      (if (:bulkhead (ex-data e))
        (do
          (analytics/inc! :metabase-analytics-relay/rejected {:relay :metaplow, :reason :shed})
          (log/debug "metaplow-proxy shed a forward: too many already in flight")
          {:status 503 :body nil})
        (throw e)))))

;; No response schema: the body is an opaque relay of the collector's own response. The tracker reads its `disabled`
;; flag and `cache` token straight out of it, so a fabricated schema would be misleading.
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/send"
  "Forward a Metabase Track payload to the configured collector server-side, bypassing the customer page's
  `connect-src` CSP."
  [_route-params
   _query-params
   body :- TrackEnvelope]
  (if-not (analytics.settings/metaplow-tracking-enabled)
    ;; Gated on the same switch as the instance's own emission — anonymous tracking on and a collector configured.
    ;; An admin who opted out must not have the instance relaying a caller's events either.
    {:status 503 :body nil}
    (let [encoded (json/encode body)]
      (if (> (alength (u/string-to-bytes encoded)) max-body-bytes)
        {:status 413 :body nil}
        ;; `cache-token` reads the current request, so it has to be called on this thread, not inside the forward.
        (let [token (cache-token)]
          (do-with-forward-bulkhead
           (fn []
             (forward! (analytics.settings/metaplow-url) encoded token))))))))

(def ^{:arglists '([request respond raise])} routes
  "Routes for the public Metabase Track telemetry relay."
  (api.macros/ns-handler *ns* +throttle))
