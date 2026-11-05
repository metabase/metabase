(ns metabase-enterprise.monitor-relay.client-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.monitor-relay.client :as relay.client]
   [metabase.util.json :as json])
  (:import
   (com.sun.net.httpserver HttpExchange HttpHandler HttpServer)
   (java.io ByteArrayInputStream)
   (java.net InetSocketAddress ServerSocket)
   (java.net.http HttpHeaders HttpRequest HttpResponse HttpTimeoutException)
   (java.time Duration)
   (java.util Map)
   (java.util.function BiPredicate)
   (java.util.zip GZIPInputStream)))

(set! *warn-on-reflection* true)

(def ^:private target {:status :ok, :base "http://monitor:8080", :token "s3cret-token"})

(defn- target-at [base]
  {:status :ok, :base base, :token "t"})

(deftest ^:parallel request-test
  (let [^HttpRequest request (#'relay.client/request target "rows/login" {:rows []} nil)]
    (testing "the relay posts JSON under <base>/ingest/v1/"
      (is (= "POST" (.method request)))
      (is (= "http://monitor:8080/ingest/v1/rows/login" (str (.uri request))))
      (is (= ["application/json"] (.allValues (.headers request) "Content-Type"))))
    (testing "the token goes in the Authorization header, never in the path"
      (is (= ["Bearer s3cret-token"] (.allValues (.headers request) "Authorization")))
      (is (not (str/includes? (str (.uri request)) "s3cret-token"))))
    (testing "a request times out after 60 s, or after the timeout it is given"
      (is (= (Duration/ofSeconds 60) (.get (.timeout request))))
      (is (= (Duration/ofSeconds 5)
             (.get (.timeout ^HttpRequest (#'relay.client/request target "status" {} (Duration/ofSeconds 5)))))))))

(defn- server!
  "A started server on a free local port, which answers each request with `respond`, a function of its
  `HttpExchange`."
  ^HttpServer [respond]
  (doto (HttpServer/create (InetSocketAddress. "127.0.0.1" 0) 0)
    (.createContext "/" (reify HttpHandler
                          (handle [_ exchange]
                            (respond exchange))))
    (.start)))

(defn- base-of [^HttpServer server]
  (str "http://127.0.0.1:" (.getPort (.getAddress server))))

(defn- received!
  "What a server gets when the relay posts `body`: its `Content-Encoding`, its `Content-Length`, and its body as JSON,
  decompressed."
  [body]
  (let [seen   (promise)
        server (server! (fn [^HttpExchange exchange]
                          (let [headers  (.getRequestHeaders exchange)
                                data     (.readAllBytes (.getRequestBody exchange))
                                encoding (.getFirst headers "Content-Encoding")
                                json     (if (= "gzip" encoding)
                                           (.readAllBytes (GZIPInputStream. (ByteArrayInputStream. data)))
                                           data)]
                            (deliver seen {:encoding encoding
                                           :length   (parse-long (.getFirst headers "Content-Length"))
                                           :sent     (count data)
                                           :json     (json/decode+kw (String. ^bytes json "UTF-8"))})
                            (.sendResponseHeaders exchange 200 -1)
                            (.close exchange))))]
    (try
      (relay.client/post! (target-at (base-of server)) "rows/login" body nil)
      (deref seen 5000 nil)
      (finally
        (.stop server 0)))))

(deftest gzip-test
  (testing "a body up to 4 KB goes as it is"
    (is (=? {:encoding nil, :json {:rows [{:id 1}]}} (received! {:rows [{:id 1}]}))))
  (testing "a larger body goes gzipped, with the length of what is sent"
    (let [rows     (vec (for [id (range 200)] {:id id, :name (str "row " id)}))
          received (received! {:rows rows})]
      (is (=? {:encoding "gzip", :length #(< % 4096), :json {:rows rows}} received))
      (is (apply = ((juxt :length :sent) received))))))

(deftest redirect-test
  (testing "a redirect is not followed, so the token goes to no other address"
    (let [asked  (atom 0)
          other  (server! (fn [^HttpExchange exchange]
                            (swap! asked inc)
                            (.sendResponseHeaders exchange 200 -1)
                            (.close exchange)))
          server (server! (fn [^HttpExchange exchange]
                            (.add (.getResponseHeaders exchange) "Location" (str (base-of other) "/ingest/v1/sync"))
                            (.sendResponseHeaders exchange 307 -1)
                            (.close exchange)))]
      (try
        (is (= 307 (:status (relay.client/post! (target-at (base-of server)) "sync" {} nil))))
        (is (= 0 @asked))
        (finally
          (.stop server 0)
          (.stop other 0))))))

(deftest post-timeout-test
  (testing "a receiver that never answers makes the post throw when its timeout passes"
    (with-open [server (ServerSocket. 0)]
      (let [start (System/nanoTime)]
        (is (thrown? HttpTimeoutException
                     (relay.client/post! (target-at (str "http://127.0.0.1:" (.getLocalPort server)))
                                         "status" {} (Duration/ofMillis 500))))
        (is (< (quot (- (System/nanoTime) start) 1000000) 5000))))))

(defn- http-response ^HttpResponse [status body headers]
  (let [http-headers (HttpHeaders/of ^Map (update-vals headers vector)
                                     (reify BiPredicate (test [_ _ _] true)))]
    (reify HttpResponse
      (statusCode [_] status)
      (body [_] body)
      (headers [_] http-headers))))

(deftest ^:parallel response-test
  (testing "a JSON body is decoded"
    (is (= {:status 200, :body {:instance_id "i1", :streams {:login nil}}, :retry-after nil}
           (#'relay.client/response (http-response 200 "{\"instance_id\":\"i1\",\"streams\":{\"login\":null}}" {})))))
  (testing "Retry-After in seconds"
    (is (= {:status 429, :body nil, :retry-after 30}
           (#'relay.client/response (http-response 429 "" {"Retry-After" "30"})))))
  (testing "a body that is not JSON, and a Retry-After that is not a number, read as nil"
    (is (= {:status 503, :body nil, :retry-after nil}
           (#'relay.client/response (http-response 503 "<html>busy</html>"
                                                   {"Retry-After" "Wed, 28 Oct 2026 07:28:00 GMT"}))))))
