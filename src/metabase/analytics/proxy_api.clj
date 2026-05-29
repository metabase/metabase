(ns metabase.analytics.proxy-api
  "Public, anonymous Snowplow telemetry passthrough for the Embedding SDK.

  The SDK runs inside the customer's page, where the customer's `connect-src` CSP blocks a direct browser POST to
  the Snowplow collector (`sp.metabase.com`). The SDK instead POSTs the tracker's `tp2` payload here — the same
  instance host its data calls already go to, so it is already CSP-allowlisted — and we forward it to the configured
  collector server-side, where no browser CSP applies.

  Mounted WITHOUT `+auth` (see `metabase.api-routes.routes`) so the public posture is obvious in the route map. This
  is anonymous by construction: the browser-tracker can't carry a Metabase session cross-origin, and the collector it
  fronts is itself public, so a rogue direct POST here behaves identically to a rogue POST to the collector.

  Body handling caveat (EMB-1758): Metabase's `wrap-json-body` middleware parses the request body before this handler
  runs, so `body` arrives as a parsed map and we re-encode it with `json/encode`. That is safe for `tp2` — it has no
  body signature/checksum, all its field values are JSON strings (base64 blobs are opaque string values preserved by a
  parse->encode round-trip), and the pipeline does not preserve client bytes anyway. This holds only while the tracker
  uses `eventMethod: \"post\"` with a JSON content-type (v1 pins this). A future GET/pixel or non-JSON config would
  arrive as an unparsed `InputStream` and need a raw-stream branch instead."
  (:require
   [clj-http.client :as http]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.api.macros :as api.macros]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(def ^:private forward-timeout-ms
  "Connection and socket timeout for the outbound forward to the collector. A hung collector must not tie up a request
  thread indefinitely. The tracker retries on failure, so a few seconds is plenty."
  5000)

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
;; No response schema: the body is an opaque relay of the collector's own response. The tracker drives its retry
;; outbox off the HTTP status, so we forward status + body verbatim; a fabricated schema would be misleading.
(api.macros/defendpoint :post "/"
  "Forward a Snowplow `tp2` payload to the configured collector server-side, so SDK telemetry dodges the customer
  page's `connect-src` CSP. Mounted at `POST /api/analytics-proxy`; public and anonymous. Relays the collector's
  status and body verbatim so the tracker's retry outbox keeps working."
  [_route-params
   _query-params
   body]
  (let [collector-url (str (analytics.settings/snowplow-url) "/com.snowplowanalytics.snowplow/tp2")]
    (try
      (let [response (http/post collector-url
                                {:body               (json/encode body)
                                 :content-type       :json
                                 :connection-timeout forward-timeout-ms
                                 :socket-timeout     forward-timeout-ms
                                 :throw-exceptions   false})]
        (log/infof "analytics-proxy -> %s : %s" collector-url (:status response))
        ;; Relay status + body unchanged: 2xx clears the tracker's event, non-2xx schedules a retry.
        {:status (:status response)
         :body   (:body response)})
      (catch Exception e
        ;; Collector unreachable (connection refused / timeout). Return a deliberate 502 (retryable by the tracker)
        ;; and log the cause server-side rather than synthesizing a fake 2xx that would drop the event.
        (log/errorf e "analytics-proxy failed forwarding to %s" collector-url)
        {:status 502
         :body   {:error (ex-message e)}}))))
