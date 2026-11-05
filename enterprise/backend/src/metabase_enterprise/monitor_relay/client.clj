(ns metabase-enterprise.monitor-relay.client
  "Posts the relay's JSON to the Monitor's receiver at `<base>/ingest/v1/<endpoint>`, with the token in the
  `Authorization` header, never in the path. A body over [[gzip-above-bytes]] goes gzipped. It uses
  `java.net.http.HttpClient`, which logs only when a JVM option turns its log on at start, so no logger adjustment
  through the API can make it log a request, and with it the token."
  (:require
   [metabase-enterprise.monitor-relay.settings :as relay.settings]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io ByteArrayOutputStream)
   (java.net URI)
   (java.net.http HttpClient HttpClient$Redirect HttpRequest HttpRequest$BodyPublishers HttpResponse
                  HttpResponse$BodyHandlers)
   (java.nio.charset StandardCharsets)
   (java.time Duration)
   (java.util.zip GZIPOutputStream)))

(set! *warn-on-reflection* true)

(def ^:private connect-timeout (Duration/ofSeconds 10))

(def ^:private request-timeout (Duration/ofSeconds 60))

(def ^:private gzip-above-bytes 4096)

(def ^:private http-client
  (delay (-> (HttpClient/newBuilder)
             (.connectTimeout connect-timeout)
             (.followRedirects HttpClient$Redirect/NEVER)
             (.build))))

(defn- gzip ^bytes [^bytes data]
  (let [out (ByteArrayOutputStream.)]
    (with-open [gz (GZIPOutputStream. out)]
      (.write gz data))
    (.toByteArray out)))

(defn- request
  "The POST of `body` as JSON to `endpoint`, such as `\"sync\"` or `\"rows/login\"`, of `target`, a parsed ingestion
  URL. It times out after `timeout`, or 60 s when it is nil, connecting included."
  ^HttpRequest [{:keys [base token]} endpoint body ^Duration timeout]
  (let [data  (.getBytes (json/encode body) StandardCharsets/UTF_8)
        gzip? (> (alength data) gzip-above-bytes)]
    (-> (HttpRequest/newBuilder (URI/create (str base "/ingest/v1/" endpoint)))
        (.timeout (or timeout request-timeout))
        (.header "Content-Type" "application/json")
        (cond-> gzip? (.header "Content-Encoding" "gzip"))
        (.header "Authorization" (str "Bearer " token))
        (.POST (HttpRequest$BodyPublishers/ofByteArray (if gzip? (gzip data) data)))
        (.build))))

(defn- json-body [^String s]
  (try
    (json/decode+kw s)
    (catch Exception _
      nil)))

(defn- retry-after-seconds [^HttpResponse response]
  (some-> (.firstValue (.headers response) "Retry-After") (.orElse nil) parse-long))

(mr/def ::response
  "The receiver's answer: its HTTP `:status`, its `:body` as decoded JSON, or nil when it holds none, and the seconds
  its `Retry-After` header asks for, or nil."
  [:map {:closed true}
   [:status      :int]
   [:body        :any]
   [:retry-after [:maybe :int]]])

(defn- response
  "The `::response` of `http-response`."
  [^HttpResponse http-response]
  {:status      (.statusCode http-response)
   :body        (json-body (.body http-response))
   :retry-after (retry-after-seconds http-response)})

(defn ok?
  "Whether `response` is a 200."
  [response]
  (= 200 (:status response)))

(mu/defn post! :- ::response
  "Posts `body` to `endpoint` of `target`. Throws on a network error or when `timeout` passes, 60 s when it is nil
  ([[request]])."
  [target   :- ::relay.settings/target
   endpoint :- :string
   body     :- [:map {::mr/deliberately-open true, :description "the endpoint's JSON body"}]
   timeout  :- [:maybe (ms/InstanceOfClass Duration)]]
  (response (.send ^HttpClient @http-client
                   (request target endpoint body timeout)
                   (HttpResponse$BodyHandlers/ofString))))
