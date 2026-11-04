(ns metabase.server.middleware.body-limit-test
  (:require
   [clojure.test :refer :all]
   [metabase.server.middleware.body-limit :as mw.body-limit]
   [metabase.server.test-handler :as server.test-handler]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures])
  (:import
   (java.io ByteArrayInputStream InputStream)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn counting-stream
  "Wrap `in` so every byte read from it is counted in the `counter` atom."
  ^InputStream [^InputStream in counter]
  (proxy [InputStream] []
    (read
      ([]
       (let [b (.read in)]
         (when (>= b 0) (swap! counter inc))
         b))
      ([^bytes buf off len]
       (let [n (.read in buf (int off) (int len))]
         (when (pos? n) (swap! counter + n))
         n)))
    (close [] (.close in))))

(defn- body-of-size
  "A request body of `n` bytes of `x`, wrapped so reads are counted in `counter`."
  [n counter]
  (counting-stream (ByteArrayInputStream. (.getBytes ^String (apply str (repeat n "x")) "UTF-8")) counter))

(defn- ex-status [^Throwable e]
  (:status-code (ex-data e)))

(deftest bounded-input-stream-test
  (testing "a body of exactly the maximum size reads through to EOF without complaint"
    (let [counter (atom 0)
          s       (mw.body-limit/bounded-input-stream (body-of-size 16 counter) 16)]
      (is (= (apply str (repeat 16 "x")) (slurp s)))
      (is (= 16 @counter))))
  (testing "one byte over the maximum throws a 413, and reading stops there"
    (let [counter (atom 0)
          s       (mw.body-limit/bounded-input-stream (body-of-size 1000 counter) 16)]
      (is (= 413 (ex-status (is (thrown? clojure.lang.ExceptionInfo (slurp s))))))
      (is (<= @counter 17))))
  (testing "single-byte reads are bounded too, and never pull more than one byte past the limit"
    (let [counter (atom 0)
          s       (mw.body-limit/bounded-input-stream (body-of-size 1000 counter) 4)]
      (dotimes [_ 5] (.read s))
      (is (= 413 (ex-status (is (thrown? clojure.lang.ExceptionInfo (.read s))))))
      (is (= 5 @counter))))
  (testing "once the limit is reached, further reads keep throwing instead of returning 0 bytes or EOF"
    (let [counter (atom 0)
          s       (mw.body-limit/bounded-input-stream (body-of-size 1000 counter) 4)]
      (.read s (byte-array 100) 0 100)
      (is (= 413 (ex-status (is (thrown? clojure.lang.ExceptionInfo (.read s (byte-array 100) 0 100))))))
      (is (= 413 (ex-status (is (thrown? clojure.lang.ExceptionInfo (.read s (byte-array 100) 0 100))))))
      (is (= 5 @counter)))))

(defn- slurping-handler
  "A handler that reads the whole body and echoes it back in a 200 response."
  [request respond _raise]
  (respond {:status 200, :body (some-> (:body request) slurp)}))

(defn- call-limited
  "Run `request` through [[mw.body-limit/wrap-limit-request-body]] wrapped around [[slurping-handler]], with the
  unauthenticated limit set to `max-bytes`, returning the response. `request` is treated as authenticated when it
  carries a `:metabase-user-id`."
  [request max-bytes]
  (mt/with-temp-env-var-value! [mb-max-unauthenticated-request-body-bytes (str max-bytes)]
    ((mw.body-limit/wrap-limit-request-body slurping-handler)
     (merge {:request-method :post, :uri "/api/card", :headers {"content-type" "application/json"}} request)
     identity
     (fn [e] (throw e)))))

(deftest wrap-limit-request-body-test
  (testing "a Content-Length over the limit is rejected before a single byte is read"
    (let [counter  (atom 0)
          response (call-limited {:body (body-of-size 1000 counter), :content-length 1000} 16)]
      (is (= 413 (:status response)))
      (is (string? (:body response)))
      (is (= 0 @counter))))
  (testing "without a Content-Length (chunked), reading past the limit is rejected"
    (let [counter  (atom 0)
          response (call-limited {:body (body-of-size 1000 counter)} 16)]
      (is (= 413 (:status response)))
      (is (<= @counter 17))))
  (testing "a body within the limit reaches the handler intact"
    (let [counter  (atom 0)
          response (call-limited {:body (body-of-size 16 counter), :content-length 16} 16)]
      (is (= 200 (:status response)))
      (is (= (apply str (repeat 16 "x")) (:body response)))))
  (testing "a request with no body passes through"
    (is (= 200 (:status (call-limited {:body nil} 16)))))
  (testing "an unauthenticated multipart body is bounded like any other: the content type is caller-supplied, and
           every endpoint that accepts multipart requires authentication anyway"
    (let [counter  (atom 0)
          response (call-limited {:body           (body-of-size 1000 counter)
                                  :content-length 1000
                                  :headers        {"content-type" "multipart/form-data; boundary=xyz"}}
                                 16)]
      (is (= 413 (:status response)))
      (is (= 0 @counter))))
  (testing "an authenticated multipart body is still left to the endpoint's own multipart limits"
    (let [counter  (atom 0)
          response (call-limited {:body             (body-of-size 1000 counter)
                                  :content-length   1000
                                  :metabase-user-id 1
                                  :headers          {"content-type" "multipart/form-data; boundary=xyz"}}
                                 16)]
      (is (= 200 (:status response)))
      (is (= 1000 @counter))))
  (testing "other exceptions from the handler are not swallowed"
    (mt/with-temp-env-var-value! [mb-max-unauthenticated-request-body-bytes "16"]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                            ((mw.body-limit/wrap-limit-request-body (fn [_ _ _] (throw (ex-info "boom" {}))))
                             {:request-method :post, :uri "/api/card", :body (body-of-size 1 (atom 0))}
                             identity
                             (fn [e] (throw e))))))))

(deftest authenticated-requests-are-not-limited-test
  (testing "authenticated: a body over the unauthenticated limit reaches the handler intact"
    (let [counter  (atom 0)
          response (call-limited {:body (body-of-size 1000 counter), :content-length 1000, :metabase-user-id 1} 16)]
      (is (= 200 (:status response)))
      (is (= (apply str (repeat 1000 "x")) (:body response)))))
  (testing "authenticated: a chunked body over the unauthenticated limit reaches the handler intact"
    (let [counter  (atom 0)
          response (call-limited {:body (body-of-size 1000 counter), :metabase-user-id 1} 16)]
      (is (= 200 (:status response)))
      (is (= 1000 @counter))))
  (testing "authenticated: the body is handed through unwrapped"
    (let [body     (body-of-size 1 (atom 0))
          captured (atom nil)]
      (mt/with-temp-env-var-value! [mb-max-unauthenticated-request-body-bytes "16"]
        ((mw.body-limit/wrap-limit-request-body (fn [request respond _] (reset! captured (:body request)) (respond {:status 200})))
         {:request-method :post, :uri "/api/card", :body body, :metabase-user-id 1}
         identity
         (fn [e] (throw e))))
      (is (identical? body @captured)))))

(defn- request-through-full-stack
  "POST `body-bytes` bytes to `uri` (`/api/card` by default) through the real middleware stack with `headers`,
  returning `[response bytes-read]`."
  [headers body-bytes & {:keys [declare-length? uri], :or {uri "/api/card"}}]
  (let [counter  (atom 0)
        response (promise)]
    ((server.test-handler/test-handler)
     (cond-> {:request-method :post
              :uri            uri
              :headers        headers
              :body           (body-of-size body-bytes counter)}
       declare-length? (assoc :content-length body-bytes))
     #(deliver response %)
     (fn [e] (deliver response e)))
    [(deref response 10000 ::timeout) @counter]))

(deftest json-body-is-bounded-before-auth-test
  (mt/with-temp-env-var-value! [mb-max-unauthenticated-request-body-bytes "1024"]
    (testing "an unauthenticated JSON POST larger than the unauthenticated limit is refused with 413 without buffering it"
      (let [[response bytes-read] (request-through-full-stack {"content-type" "application/json"} 2048)]
        (is (= 413 (:status response)))
        (is (<= bytes-read 1025))))
    (testing "with a declared Content-Length, nothing on the stack ahead of the limit reads a single byte"
      (let [[response bytes-read] (request-through-full-stack {"content-type" "application/json"} 2048
                                                              :declare-length? true)]
        (is (= 413 (:status response)))
        (is (= 0 bytes-read))))
    (testing "a form-encoded body is bounded the same way"
      (let [[response bytes-read] (request-through-full-stack {"content-type" "application/x-www-form-urlencoded"} 2048)]
        (is (= 413 (:status response)))
        (is (<= bytes-read 1025))))
    (testing "a caller-supplied multipart content type does not lift the bound"
      (let [[response bytes-read] (request-through-full-stack
                                   {"content-type" "multipart/form-data; boundary=xyz"} 2048
                                   :declare-length? true)]
        (is (= 413 (:status response)))
        (is (= 0 bytes-read))))
    (testing "Slack signature verification, which slurps the body before it can trust the caller, stays bounded even
             when the caller claims to be sending multipart"
      (mt/with-temporary-raw-setting-values [metabot-slack-signing-secret "test-slack-signing-secret-12345"]
        (let [[response bytes-read] (request-through-full-stack
                                     {"content-type"              "multipart/form-data; boundary=xyz"
                                      "x-slack-signature"         "v0=not-a-real-signature"
                                      "x-slack-request-timestamp" "1700000000"}
                                     2048
                                     :uri "/api/metabot/slack/events")]
          (is (= 413 (:status response)))
          (is (<= bytes-read 1025)))))
    (testing "the same body with a valid session is not limited (and fails validation instead)"
      (let [[response bytes-read] (request-through-full-stack {"content-type"       "application/json"
                                                               "x-metabase-session" (test.users/username->token :rasta)}
                                                              8192)]
        (is (= 400 (:status response)))
        (is (= 8192 bytes-read))))))
