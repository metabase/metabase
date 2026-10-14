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
   [diehard.bulkhead :as dh.bh]
   [diehard.core :as dh]
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
;; can hold a request thread per call for as long as the forward takes. Two bounds, because neither does the other's
;; job: this rate limiter caps how often one source address may call, and [[forward-bulkhead]] caps how many forwards
;; are in flight at once, which is the thread-holding a rate limit cannot bound.
;;
;; 600/min is ~10/s, far above what one browser produces: the SDK sends one request per event with no batching, and
;; component-mount events are deduped per JS load, so a page load is a handful of requests. The headroom is for the
;; key rather than the browser — `request/ip-address` takes the last entry of the forwarded-for chain, so one key
;; can stand for every browser behind a corporate NAT or a multi-hop proxy chain.
;;
;; `initial-delay-ms` and `delay-exponent` are lowered from the library defaults (15s, 1.5), which are tuned for
;; brute-forced logins: past the threshold they black a key out for tens of seconds, and because `throttle/check`
;; measures the delay from the last *admitted* attempt, a key that keeps calling is admitted once per blackout rather
;; than shaved back to the threshold. At 1s and exponent 1 an over-limit key degrades smoothly instead, which is what
;; droppable telemetry wants.
(def ^:private throttler
  (throttle/make-throttler :analytics-proxy
                           :attempts-threshold 600
                           :attempt-ttl-ms     (* 60 1000)
                           :initial-delay-ms   1000
                           :delay-exponent     1))

(def ^:private max-concurrent-forwards
  "Forwards allowed in flight at once. Each one can hold a request thread for as long as `forward-timeout-ms`, and
  ring-jetty's default pool is 50 threads for the whole instance, so this caps what the relay can take of it. The
  sibling relay in [[metabase.analytics.api.metaplow-proxy]] has its own bulkhead of the same size, kept separate so
  that a collector which goes slow starves only its own relay."
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
      ;; the source address is derived server-side, so it is not something the caller can rotate to get a fresh bucket
      (throttle/check throttler (request/ip-address request))
      (handler request respond raise)
      (catch ExceptionInfo e
        (if (u.throttle/throttle-exception? e)
          (respond (u.throttle/throttle-response e {:error (ex-message e)}))
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
                               :throw-exceptions   false})]
      ;; Relay status + body unchanged: 2xx clears the tracker's event, non-2xx schedules a retry.
      {:status (:status response)
       :body   (:body response)})
    (catch Exception e
      ;; 502 is retryable by the tracker; a fake 2xx would silently drop the event.
      (log/errorf "analytics-proxy failed forwarding to %s: %s" collector-url (ex-message e))
      {:status 502 :body nil})))

(defn- do-with-forward-bulkhead
  "Run `thunk` holding a [[forward-bulkhead]] permit, answering 503 when the relay already has
  [[max-concurrent-forwards]] forwards in flight."
  [thunk]
  (try
    ;; `max-wait-ms` 0 sheds rather than queues: a caller waiting for a permit would go on holding the request thread
    ;; this bulkhead exists to protect.
    (dh/with-bulkhead {:bulkhead forward-bulkhead, :max-wait-ms 0}
      (thunk))
    (catch ExceptionInfo e
      (if (:bulkhead (ex-data e))
        (do
          (log/debug "analytics-proxy shed a forward: too many already in flight")
          ;; Deliberately not the limiter's 429 — this caller is within its own rate and the instance is simply
          ;; saturated. 503 is retryable by the tracker, so the event survives in its outbox.
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
