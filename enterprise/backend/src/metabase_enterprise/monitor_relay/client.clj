(ns metabase-enterprise.monitor-relay.client
  "Posts the relay's JSON to the Monitor's receiver at `<base>/ingest/v1/<endpoint>`, with the token in the
  `Authorization` header, never in the path. A body over [[gzip-above-bytes]] goes gzipped. It uses
  `java.net.http.HttpClient`, which logs only when a JVM option turns its log on at start, so no logger adjustment
  through the API can make it log a request."
  (:require
   [metabase.util.json :as json])
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

(defn encoded
  "`row` with its JSON in its metadata. A request body sends that JSON as it is, so the relay encodes each row once:
  change no row after this."
  [row]
  (cond-> row
    (not (::json (meta row))) (vary-meta assoc ::json (json/encode row))))

(defn json-size
  "The bytes the [[encoded]] `row` takes in a request body, with its separator."
  ^long [row]
  (inc (alength (.getBytes ^String (::json (meta row)) StandardCharsets/UTF_8))))

(defn- json-bytes
  "`body` as UTF-8 JSON. Its `:rows` that are [[encoded]] go as the JSON they hold."
  ^bytes [body]
  (let [raw  #(if-let [s (::json (meta %))] (json/raw-json-generator s) %)
        body (cond-> body
               (:rows body) (update :rows #(mapv raw %)))]
    (.getBytes (json/encode body) StandardCharsets/UTF_8)))

(defn- gzip ^bytes [^bytes data]
  (let [out (ByteArrayOutputStream.)]
    (with-open [gz (GZIPOutputStream. out)]
      (.write gz data))
    (.toByteArray out)))

(defn request
  "The POST of `body` as JSON to `endpoint`, such as `\"sync\"` or `\"rows/login\"`, of `target`, a parsed ingestion
  URL. It times out after `timeout`, 60 s by default, connecting included."
  (^HttpRequest [target endpoint body]
   (request target endpoint body request-timeout))

  (^HttpRequest [{:keys [base token]} endpoint body ^Duration timeout]
   (let [data  (json-bytes body)
         gzip? (> (alength data) gzip-above-bytes)]
     (-> (HttpRequest/newBuilder (URI/create (str base "/ingest/v1/" endpoint)))
         (.timeout timeout)
         (.header "Content-Type" "application/json")
         (cond-> gzip? (.header "Content-Encoding" "gzip"))
         (.header "Authorization" (str "Bearer " token))
         (.POST (HttpRequest$BodyPublishers/ofByteArray (if gzip? (gzip data) data)))
         (.build)))))

(defn- json-body [^String s]
  (try
    (json/decode+kw s)
    (catch Exception _
      nil)))

(defn- retry-after-seconds [^HttpResponse response]
  (some-> (.firstValue (.headers response) "Retry-After") (.orElse nil) parse-long))

(defn response
  "`{:status n, :body m, :retry-after s}` of `http-response`: `:body` is its decoded JSON, or nil when it holds none,
  and `:retry-after` the seconds its `Retry-After` header asks for, or nil."
  [^HttpResponse http-response]
  {:status      (.statusCode http-response)
   :body        (json-body (.body http-response))
   :retry-after (retry-after-seconds http-response)})

(defn ok?
  "Whether `response` is a 200."
  [response]
  (= 200 (:status response)))

(defn post!
  "Posts `body` to `endpoint` of `target` and returns its [[response]]. Throws on a network error or when `timeout`
  passes, 60 s by default."
  ([target endpoint body]
   (post! target endpoint body request-timeout))

  ([target endpoint body timeout]
   (response (.send ^HttpClient @http-client
                    (request target endpoint body timeout)
                    (HttpResponse$BodyHandlers/ofString)))))
