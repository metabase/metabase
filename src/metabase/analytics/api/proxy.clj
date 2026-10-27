(ns metabase.analytics.api.proxy
  "Public, anonymous Snowplow telemetry passthrough for the Embedding SDK.

  The SDK runs inside the customer's page, where the customer's `connect-src` CSP blocks a direct browser POST to
  the Snowplow collector (`sp.metabase.com`). The SDK instead POSTs the tracker's `tp2` payload here — the same
  instance host its data calls already go to, so it is already CSP-allowlisted — and we forward it to `sp.metabase.com` server-side, where no browser CSP applies.

  Body handling: `wrap-json-body` parses the body before this handler runs, so `body` arrives as a map and we
  re-encode it — not a byte-exact relay. Safe for `tp2` because it has no checksum, all field values are JSON strings
  (base64 blobs survive a parse→encode round-trip), and v1 pins `eventMethod: \"post\"` with a JSON content-type."
  (:require
   [clj-http.client :as http]
   [clj-http.conn-mgr :as conn-mgr]
   [diehard.bulkhead :as dh.bh]
   [diehard.core :as dh]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.api.macros :as api.macros]
   [metabase.request.core :as request]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [metabase.util.throttle :as u.throttle]
   [throttle.core :as throttle])
  (:import
   (clojure.lang ExceptionInfo)))

(def ^:private forward-timeout-ms 5000)

;; This endpoint is unauthenticated and makes its outbound call inline on the request thread, so an anonymous caller
;; can hold a request thread per call for as long as the forward takes.
(def ^:private throttler
  (throttle/make-throttler :analytics-proxy
                           :attempts-threshold 600
                           :attempt-ttl-ms     (* 60 1000)
                           ;; don't punish when throttling, just shed load
                           :initial-delay-ms   1000
                           :delay-exponent     1))

(def ^:private max-concurrent-forwards
  "Forwards allowed in flight at once."
  8)

(defonce ^:private
  ^{:doc "Process-wide bulkhead bounding concurrent forwards; see [[max-concurrent-forwards]]."}
  forward-bulkhead
  (dh.bh/bulkhead {:concurrency max-concurrent-forwards}))

(defonce ^:private
  ^{:doc "Reuses TCP/TLS connections to the collector across forwards. Sized to [[max-concurrent-forwards]]: the
         bulkhead already caps forwards in flight, and every request goes to one host, so `:default-per-route` is the
         actual cap. Wrapped in `delay` so the pool isn't created until the first forward."}
  connection-manager
  (delay (conn-mgr/make-reusable-conn-manager {:threads           max-concurrent-forwards
                                               :default-per-route max-concurrent-forwards})))

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
          (do
            (analytics/inc! :metabase-analytics-relay/rejected {:relay :snowplow, :reason :throttled})
            (respond (u.throttle/throttle-response e {:error (ex-message e)})))
          (raise e))))))

(def ^:private Tp2Payload
  "Schema for the Snowplow `tp2` request envelope, mirroring the collector's own `payload_data` JSON schema: the iglu
  URI of that schema plus one entry per event, keyed by tracker field name (`e`, `p`, `tv`, `ue_px`, ...). The tracker
  stringifies every field value, so the values are always strings."
  [:map {:closed true}
   [:schema ms/NonBlankString]
   [:data [:sequential {:max 100} (ms/string-keyed-map :string)]]])

(defn- forward!
  [collector-url body]
  (try
    (let [response (http/post collector-url
                              {:body               (json/encode body)
                               :content-type       :json
                               :connection-timeout forward-timeout-ms
                               :socket-timeout     forward-timeout-ms
                               :throw-exceptions   false
                               :connection-manager @connection-manager})]
      {:status (:status response)
       :body   (:body response)})
    (catch Exception e
      (log/errorf "analytics-proxy failed forwarding to %s: %s" collector-url (ex-message e))
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
          (analytics/inc! :metabase-analytics-relay/rejected {:relay :snowplow, :reason :shed})
          (log/debug "analytics-proxy shed a forward: too many already in flight")
          {:status 503 :body nil})
        (throw e)))))

;; No response schema: the body is an opaque relay of the collector's own response. The tracker drives its retry
;; outbox off the HTTP status, so we forward status + body verbatim; a fabricated schema would be misleading.
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Forward a Snowplow `tp2` payload to `sp.metabase.com` server-side, bypassing the customer page's
  `connect-src` CSP."
  [_route-params
   _query-params
   body :- Tp2Payload]
  (let [collector-url (str (analytics.settings/snowplow-url) "/com.snowplowanalytics.snowplow/tp2")]
    (do-with-forward-bulkhead
     (fn []
       (forward! collector-url body)))))

(def ^{:arglists '([request respond raise])} routes
  "Routes for the public Snowplow telemetry relay."
  (api.macros/ns-handler *ns* +throttle))
