(ns metabase.server.streaming-response-test
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.server.protocols :as server.protocols]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.server.streaming-response.thread-pool :as thread-pool]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (jakarta.servlet AsyncContext ServletOutputStream)
   (jakarta.servlet.http HttpServletResponse)
   (java.io ByteArrayOutputStream)
   (java.util.concurrent Executors)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)))

(set! *warn-on-reflection* true)

(driver/register! ::test-driver)

(def ^:private canceled? (atom false))

(def ^:private thread-pool-size 5)

(defn- do-with-streaming-response-thread-pool! [thunk]
  (let [pool (Executors/newFixedThreadPool thread-pool-size
                                           (.build
                                            (doto (BasicThreadFactory$Builder.)
                                              (.namingPattern "streaming-response-test-thread-pool-%d")
                                              ;; Daemon threads do not block shutdown of the JVM
                                              (.daemon true))))]
    (with-redefs [thread-pool/thread-pool (constantly pool)]
      (try
        (thunk)
        (finally
          (.shutdownNow pool))))))

(defmacro ^:private with-streaming-response-thread-pool! {:style/indent 0} [& body]
  `(do-with-streaming-response-thread-pool! (fn [] ~@body)))

(defmacro ^:private with-test-driver-db! {:style/indent 0} [& body]
  `(mt/with-temp [:model/Database db# {:engine ::test-driver}]
     (mt/with-db db#
       (with-streaming-response-thread-pool!
         ~@body))))

(def ^:private start-execution-chan
  "A core.async channel that will get a message when query execution starts."
  (atom nil))

(defmacro ^:private with-start-execution-chan
  "Runs body with `chan-binding` bound to a core.async promise channel that will get a message once a query execution
  starts running on the streaming response thread pool."
  [[chan-binding] & body]
  `(mt/with-open-channels [chan# (a/promise-chan)]
     (try
       (reset! start-execution-chan chan#)
       (let [~chan-binding chan#]
         ~@body)
       (finally
         (reset! start-execution-chan nil)))))

(defmethod driver/execute-reducible-query ::test-driver
  [_driver {{{:keys [sleep]} :query} :native, database-id :database} _context respond]
  {:pre [(integer? sleep) (integer? database-id)]}
  (let [futur (future
                (try
                  (when-let [chan @start-execution-chan]
                    (a/>!! chan ::started))
                  (Thread/sleep (long sleep))
                  (respond {:cols [{:name "Sleep", :base_type :type/Integer}]} [[sleep]])
                  (catch InterruptedException e
                    (reset! canceled? ::interrupted-exception)
                    (throw e))))]
    (when-let [canceled-chan qp.pipeline/*canceled-chan*]
      (a/go
        (when (a/<! canceled-chan)
          (reset! canceled? ::canceled-chan-message)
          (future-cancel futur))))
    (u/deref-with-timeout futur 5000)))

(defmethod driver/connection-properties ::test-driver
  [& _]
  [])

(deftest basic-test
  (testing "Make sure our ::test-driver is working as expected"
    (with-test-driver-db!
      (is (= [[10]]
             (mt/rows
              (mt/user-http-request :lucky
                                    :post 202 "dataset"
                                    {:database (mt/id)
                                     :type "native"
                                     :native {:query {:sleep 10}}})))))))

(deftest truly-async-test
  (testing "StreamingResponses should truly be asynchronous, and not block Jetty threads while waiting for results"
    (with-test-driver-db!
      (let [num-requests (+ thread-pool-size 20)
            remaining (atom num-requests)
            session-token (client/authenticate (mt/user->credentials :lucky))
            url (client/build-url "dataset" nil)
            request (client/build-request-map session-token
                                              {:database (mt/id)
                                               :type "native"
                                               :native {:query {:sleep 2000}}}
                                              nil)]
        (testing (format "%d simultaneous queries" num-requests)
          (dotimes [_ num-requests]
            (future (http/post url request)))
          (Thread/sleep 100)
          (let [timer (u/start-timer)]
            (is (= {:status "ok"} (client/client :get 200 "health")))
            (testing "Health endpoint should complete before the first round of queries completes"
              (is (> @remaining (inc (- num-requests thread-pool-size)))))
            (testing "Health endpoint should complete in under 500ms regardless of how many queries are running"
              (testing "(Usually this is under 100ms but might be a little over if CircleCI is being slow)"
                (let [elapsed-ms (u/since-ms timer)]
                  (is (< elapsed-ms 500)))))))))))

(deftest cancelation-test
  (testing "Make sure canceling a HTTP request ultimately causes the query to be canceled"
    (mt/test-helpers-set-global-values!
      (with-redefs [streaming-response/async-cancellation-poll-interval-ms 50]
        (with-test-driver-db!
          (reset! canceled? false)
          (with-start-execution-chan [start-chan]
            (let [url (client/build-url "dataset" nil)
                  session-token (client/authenticate (mt/user->credentials :lucky))
                  request (client/build-request-map session-token
                                                    {:database (mt/id)
                                                     :type "native"
                                                     :native {:query {:sleep 5000}}}
                                                    nil)
                  futur (http/post url (assoc request :async? true) identity (fn [e] (throw e)))]
              (is (future? futur))
             ;; wait a little while for the query to start running -- this should usually happen fairly quickly
              (mt/wait-for-result start-chan (u/seconds->ms 15))
              (future-cancel futur)
             ;; check every 10ms, up to 1000ms, whether `canceled?` is now `true`
              (is (loop [[wait & more] (repeat 10 100)]
                    (or @canceled?
                        (when wait
                          (Thread/sleep (long wait))
                          (recur more))))))))))))

(def ^:private ^:dynamic *number-of-cans* nil)

(deftest ^:parallel preserve-bindings-test
  (testing "Bindings established outside the `streaming-response` should be preserved inside the body"
    (with-open [os (java.io.ByteArrayOutputStream.)]
      (let [streaming-response (binding [*number-of-cans* 2]
                                 (streaming-response/streaming-response nil [os _]
                                   (.write os (.getBytes (format "%s cans" *number-of-cans*) "UTF-8"))))
            complete-promise (promise)]
        (server.protocols/respond streaming-response
                                  {:response (reify HttpServletResponse
                                               (setStatus [_ _])
                                               (setHeader [_ _ _])
                                               (getOutputStream [_]
                                                 (proxy [ServletOutputStream] []
                                                   (write
                                                     ([byytes]
                                                      (.write os ^bytes byytes))
                                                     ([byytes offset length]
                                                      (.write os ^bytes byytes offset length))))))
                                   :async-context (reify AsyncContext
                                                    (complete [_]
                                                      (deliver complete-promise true)))})
        (is (true?
             (deref complete-promise 1000 ::timed-out)))
        (is (= "2 cans"
               (String. (.toByteArray os) "UTF-8")))))))

(deftest write-error-uncommitted-response-test
  (testing "write-error! should set status and content type when response is not committed"
    (let [os (ByteArrayOutputStream.)
          status-called (atom nil)
          content-type-called (atom nil)
          mock-response (reify HttpServletResponse
                          (isCommitted [_] false)
                          (setStatus [_ status] (reset! status-called status))
                          (setContentType [_ content-type] (reset! content-type-called content-type)))]
      (binding [streaming-response/*http-response* mock-response]
        (streaming-response/write-error! os {:error "test error"} :api 400))
      (testing "Status should be set to provided status code"
        (is (= 400 @status-called)))
      (testing "Content type should be set to application/json"
        (is (= "application/json" @content-type-called))))))

(deftest write-error-committed-response-test
  (testing "write-error! should not set status or content type when response is committed"
    (let [os (ByteArrayOutputStream.)
          status-called (atom nil)
          content-type-called (atom nil)
          mock-response (reify HttpServletResponse
                          (isCommitted [_] true)
                          (setStatus [_ status] (reset! status-called status))
                          (setContentType [_ content-type] (reset! content-type-called content-type)))]
      (binding [streaming-response/*http-response* mock-response]
        (streaming-response/write-error! os {:error "test error"} :api 400))
      (testing "Status should not be set when response is committed"
        (is (nil? @status-called)))
      (testing "Content type should not be set when response is committed"
        (is (nil? @content-type-called))))))

(deftest write-error-no-http-response-test
  (testing "write-error! should not attempt to set status when no *http-response* is bound"
    (let [os (ByteArrayOutputStream.)]
      (binding [streaming-response/*http-response* nil]
        ;; Should not throw exception when no response is bound
        (is (some? (streaming-response/write-error! os {:error "test error"} :api 500)))))))

(deftest write-error-default-status-test
  (testing "write-error! should use default status 500 when no status provided"
    (let [os (ByteArrayOutputStream.)
          status-called (atom nil)
          mock-response (reify HttpServletResponse
                          (isCommitted [_] false)
                          (setStatus [_ status] (reset! status-called status))
                          (setContentType [_ _]))]
      (binding [streaming-response/*http-response* mock-response]
        (streaming-response/write-error! os {:error "test error"} :api))
      (testing "Status should default to 500 when not provided"
        (is (= 500 @status-called))))))

(deftest write-error-exception-handling-test
  (testing "write-error! should handle different exception types appropriately"
    (let [os (ByteArrayOutputStream.)
          mock-response (reify HttpServletResponse
                          (isCommitted [_] false)
                          (setStatus [_ _])
                          (setContentType [_ _]))]
      (binding [streaming-response/*http-response* mock-response]
        (testing "InterruptedException should not write to output stream"
          (streaming-response/write-error! os (InterruptedException. "interrupted") :api)
          (is (zero? (.size os))))

        (testing "EofException should not write to output stream"
          (.reset os)
          (streaming-response/write-error! os (org.eclipse.jetty.io.EofException. "eof") :api)
          (is (zero? (.size os))))

        (testing "Other exceptions should be formatted and written"
          (.reset os)
          (streaming-response/write-error! os (RuntimeException. "runtime error") :api)
          (is (pos? (.size os)))
          (let [output (String. (.toByteArray os) "UTF-8")]
            (is (re-find #"runtime error" output))))))))

(deftest write-error-json-output-test
  (testing "write-error! should write valid JSON to output stream"
    (let [os (ByteArrayOutputStream.)
          mock-response (reify HttpServletResponse
                          (isCommitted [_] false)
                          (setStatus [_ _])
                          (setContentType [_ _]))]
      (binding [streaming-response/*http-response* mock-response]
        (streaming-response/write-error! os {:error "test error" :code 123} :api))
      (let [output (String. (.toByteArray os) "UTF-8")]
        (is (re-find #"\"error\":\s*\"test error\"" output))
        (is (re-find #"\"code\":\s*123" output))))))

(deftest write-error-non-api-format-test
  (testing "write-error! should strip sensitive fields for non-API export formats"
    (let [os (ByteArrayOutputStream.)
          mock-response (reify HttpServletResponse
                          (isCommitted [_] false)
                          (setStatus [_ _])
                          (setContentType [_ _]))]
      (binding [streaming-response/*http-response* mock-response]
        (streaming-response/write-error! os {:error "test error"
                                             :json_query "SELECT * FROM table"
                                             :preprocessed "some data"} :csv))
      (let [output (String. (.toByteArray os) "UTF-8")]
        (is (re-find #"\"error\":\s*\"test error\"" output))
        (is (not (re-find #"json_query" output)))
        (is (not (re-find #"preprocessed" output)))))))
(deftest write-error-includes-stacktrace-when-hide-stacktraces-disabled-test
  (testing "write-error! includes stacktrace and exception chain when hide-stacktraces is false"
    (mt/with-temporary-setting-values [hide-stacktraces false]
      (with-open [os (java.io.ByteArrayOutputStream.)]
        (let [exception (ex-info "Test error message" {:custom-data "test-value"})]
          (#'streaming-response/write-error! os exception :api)
          (let [error-response (json/decode (String. (.toByteArray os) "UTF-8") true)]
            (is (= "Test error message" (:cause error-response))
                "Response includes the error message")
            (is (contains? error-response :trace)
                "Response should contain :trace key")
            (is (vector? (:trace error-response))
                "Stacktrace should be a vector")
            (is (contains? error-response :via)
                "Response should contain :via key")
            (is (= "test-value" (get-in error-response [:data :custom-data]))
                "Response should include custom data from ex-info")))))))

(deftest write-error-omits-stacktrace-when-hide-stacktraces-enabled-test
  (testing "write-error! omits stacktrace and exception chain when hide-stacktraces is true"
    (mt/with-temporary-setting-values [hide-stacktraces true]
      (with-open [os (java.io.ByteArrayOutputStream.)]
        (let [exception (ex-info "Test error message with sensitive info" {:custom-data "test-value"})]
          (#'streaming-response/write-error! os exception :api)
          (let [error-response (json/decode (String. (.toByteArray os) "UTF-8") true)]
            (is (= "Test error message with sensitive info" (:cause error-response))
                "Response includes the error message")
            (is (not (contains? error-response :trace))
                "Response should not contain :trace key")
            (is (not (contains? error-response :via))
                "Response should not contain :via key")
            (is (= "test-value" (get-in error-response [:data :custom-data]))
                "Response should include custom data from ex-info")
            (is (contains? error-response :_status)
                "Response should include :_status")))))))

(deftest write-error-nested-exception-with-stacktraces-disabled-test
  (testing "write-error! includes nested exception details when hide-stacktraces is false"
    (mt/with-temporary-setting-values [hide-stacktraces false]
      (with-open [os (java.io.ByteArrayOutputStream.)]
        (let [inner-exception (ex-info "Inner error" {:inner-data "secret"})
              outer-exception (ex-info "Outer error" {:outer-data "visible"} inner-exception)]
          (#'streaming-response/write-error! os outer-exception :api)
          (let [error-response (json/decode (String. (.toByteArray os) "UTF-8") true)]
            (is (contains? error-response :via)
                "Response should contain :via key")
            (is (> (count (:via error-response)) 1)
                "Exception chain should include multiple exceptions")))))))

(deftest write-error-nested-exception-with-stacktraces-enabled-test
  (testing "write-error! omits nested exception details when hide-stacktraces is true"
    (mt/with-temporary-setting-values [hide-stacktraces true]
      (with-open [os (java.io.ByteArrayOutputStream.)]
        (let [inner-exception (ex-info "Inner error" {:inner-data "secret"})
              outer-exception (ex-info "Outer error" {:outer-data "visible"} inner-exception)]
          (#'streaming-response/write-error! os outer-exception :api)
          (let [error-response (json/decode (String. (.toByteArray os) "UTF-8") true)]
            (is (not (contains? error-response :via))
                "Response should not contain :via key with nested exception information")))))))

(deftest write-error-map-preserves-sensitive-keys-when-hide-stacktraces-disabled-test
  (testing "write-error! preserves sensitive keys when a map is supplied and hide-stacktraces is false"
    (mt/with-temporary-setting-values [hide-stacktraces false]
      (with-open [os (java.io.ByteArrayOutputStream.)]
        (let [error-map {:message "Error occurred"
                         :stacktrace ["line1" "line2" "line3"]
                         :trace ["frame1" "frame2"]
                         :via [{:type "Exception1"} {:type "Exception2"}]
                         :custom-data "preserve-me"}]
          (#'streaming-response/write-error! os error-map :api)
          (let [error-response (json/decode (String. (.toByteArray os) "UTF-8") true)]
            (is (= "Error occurred" (:message error-response))
                "Response should include the message")
            (is (contains? error-response :stacktrace)
                "Response should contain :stacktrace key")
            (is (contains? error-response :trace)
                "Response should contain :trace key")
            (is (contains? error-response :via)
                "Response should contain :via key")
            (is (= "preserve-me" (:custom-data error-response))
                "Response should include custom data")))))))

(deftest write-error-map-omits-sensitive-keys-when-hide-stacktraces-enabled-test
  (testing "write-error! omits sensitive keys when a map is supplied and hide-stacktraces is true"
    (mt/with-temporary-setting-values [hide-stacktraces true]
      (with-open [os (java.io.ByteArrayOutputStream.)]
        (let [error-map {:message "Error occurred"
                         :stacktrace ["line1" "line2" "line3"]
                         :trace ["frame1" "frame2"]
                         :via [{:type "Exception1"} {:type "Exception2"}]
                         :custom-data "preserve-me"}]
          (#'streaming-response/write-error! os error-map :api)
          (let [error-response (json/decode (String. (.toByteArray os) "UTF-8") true)]
            (is (= "Error occurred" (:message error-response))
                "Response should include the message")
            (is (not (contains? error-response :stacktrace))
                "Response should not contain :stacktrace key")
            (is (not (contains? error-response :trace))
                "Response should not contain :trace key")
            (is (not (contains? error-response :via))
                "Response should not contain :via key")
            (is (= "preserve-me" (:custom-data error-response))
                "Response should still include custom data")))))))
