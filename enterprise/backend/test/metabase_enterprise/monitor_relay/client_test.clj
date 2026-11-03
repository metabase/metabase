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

(def ^:private target {:base "http://monitor:8080", :token "s3cret-token"})

(deftest ^:parallel request-test
  (let [^HttpRequest request (relay.client/request target "rows/login" {:rows []})]
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
             (.get (.timeout (relay.client/request target "status" {} (Duration/ofSeconds 5)))))))))

(defn- received!
  "What a server gets when the relay posts `body`: its `Content-Encoding`, its `Content-Length`, and its body as JSON,
  decompressed."
  [body]
  (let [seen    (promise)
        server  (doto (HttpServer/create (InetSocketAddress. "127.0.0.1" 0) 0)
                  (.createContext "/" (reify HttpHandler
                                        (handle [_ exchange]
                                          (let [^HttpExchange exchange exchange
                                                headers  (.getRequestHeaders exchange)
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
                                            (.close exchange)))))
                  (.start))]
    (try
      (relay.client/post! {:base (str "http://127.0.0.1:" (.getPort (.getAddress server))), :token "t"}
                          "rows/login"
                          body)
      (deref seen 5000 nil)
      (finally
        (.stop server 0)))))

(deftest gzip-test
  (testing "a body up to 4 KB goes as it is"
    (is (=? {:encoding nil, :json {:rows [{:id 1}]}} (received! {:rows [{:id 1}]}))))
  (testing "a larger body goes gzipped, with the length of what is sent"
    (let [rows (vec (for [id (range 200)] {:id id, :name (str "row " id)}))]
      (is (=? {:encoding "gzip", :length #(< % 4096), :json {:rows rows}} (received! {:rows rows})))
      (is (apply = ((juxt :length :sent) (received! {:rows rows})))))))

(deftest ^:parallel encoded-row-test
  (testing "a row keeps the JSON it was first encoded as, which a body sends as it is"
    (let [row (relay.client/encoded {:id 1, :name "é"})]
      (is (= {:id 1, :name "é"} row))
      (is (= (inc (count (.getBytes "{\"id\":1,\"name\":\"é\"}" "UTF-8"))) (relay.client/json-size row)))
      (is (identical? row (relay.client/encoded row))))))

(deftest raw-rows-test
  (testing "a body's encoded rows are sent as the JSON they hold, not encoded again"
    (let [row (vary-meta {:id 1} assoc ::relay.client/json "{\"id\":2}")]
      (is (=? {:json {:rows [{:id 2} {:id 3}], :sequence 9}} (received! {:rows [row {:id 3}], :sequence 9}))))))

(deftest post-timeout-test
  (testing "a receiver that never answers makes the post throw when its timeout passes"
    (with-open [server (ServerSocket. 0)]
      (let [start (System/nanoTime)]
        (is (thrown? HttpTimeoutException
                     (relay.client/post! {:base (str "http://127.0.0.1:" (.getLocalPort server)), :token "t"}
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
           (relay.client/response (http-response 200 "{\"instance_id\":\"i1\",\"streams\":{\"login\":null}}" {})))))
  (testing "Retry-After in seconds"
    (is (= {:status 429, :body nil, :retry-after 30}
           (relay.client/response (http-response 429 "" {"Retry-After" "30"})))))
  (testing "a body that is not JSON, and a Retry-After that is not a number, read as nil"
    (is (= {:status 503, :body nil, :retry-after nil}
           (relay.client/response (http-response 503 "<html>busy</html>"
                                                 {"Retry-After" "Wed, 28 Oct 2026 07:28:00 GMT"}))))))
