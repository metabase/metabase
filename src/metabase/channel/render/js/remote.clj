;; The remote (HTTP) static-viz backend.
(ns metabase.channel.render.js.remote
  "The `:remote` [[metabase.channel.render.js.protocol/StaticVizRenderer]]: renders by POSTing to an
  external static-viz service (see frontend/src/static-viz-server/app.ts) rather than running JS in
  process. Each method JSON-encodes its argument map as the request body and returns the service's
  response body (the raw JSON string the corresponding bundle function produced)."
  (:require
   [clj-http.client :as http]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.util.json :as json]
   [metabase.util.retry :as retry]))

(set! *warn-on-reflection* true)

(def ^:private socket-timeout-ms 30000)
(def ^:private connection-timeout-ms 5000)

(defn- post
  "POST the JSON `body` string to `url`+`path` and return the service's raw response body string. Retries
  any error — 5xx responses (clj-http throws on non-2xx), connection/socket timeouts, connection refused,
  etc. — with the default exponential backoff (see [[metabase.util.retry/retry-configuration]])."
  ^String [url path body]
  (:body (retry/with-retry (retry/retry-configuration)
           (http/post (str url path)
                      {:body               body
                       :content-type       :json
                       :as                 :string
                       :socket-timeout     socket-timeout-ms
                       :connection-timeout connection-timeout-ms}))))

(defn renderer
  "The `:remote` renderer, POSTing to the static-viz service at `url`."
  [url]
  (reify js.protocol/StaticVizRenderer
    (chart [_ input]
      (post url "/api/v1/chart" (json/encode input)))
    (cell-background-colors [_ input]
      (post url "/api/v1/cell-background-colors" (json/encode input)))))
