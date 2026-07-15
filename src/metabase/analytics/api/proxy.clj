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
   [metabase.analytics.settings :as analytics.settings]
   [metabase.api.macros :as api.macros]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(def ^:private forward-timeout-ms 5000)

;; No response schema: the body is an opaque relay of the collector's own response. The tracker drives its retry
;; outbox off the HTTP status, so we forward status + body verbatim; a fabricated schema would be misleading.
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Forward a Snowplow `tp2` payload to `sp.metabase.com` server-side, bypassing the customer page's
  `connect-src` CSP."
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
        ;; Relay status + body unchanged: 2xx clears the tracker's event, non-2xx schedules a retry.
        {:status (:status response)
         :body   (:body response)})
      (catch Exception e
        ;; 502 is retryable by the tracker; a fake 2xx would silently drop the event.
        (log/errorf e "analytics-proxy failed forwarding to %s" collector-url)
        {:status 502 :body nil}))))
