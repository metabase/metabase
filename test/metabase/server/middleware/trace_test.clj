(ns metabase.server.middleware.trace-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.server.middleware.trace :as mw.trace]
   [metabase.tracing.core :as tracing]))

(set! *warn-on-reflection* true)

(defn- call-handler
  "Call wrap-trace middleware with a mock handler, returning the response or exception.
   The mock handler immediately calls respond with {:status 200}."
  [request]
  (let [handler   (fn [_req respond _raise] (respond {:status 200}))
        wrapped   (mw.trace/wrap-trace handler)
        result    (promise)]
    (wrapped request #(deliver result %) #(deliver result %))
    (deref result 1000 :timeout)))

(deftest non-api-requests-skipped-test
  (testing "non-API requests are passed through without tracing"
    (try
      (tracing/init-enabled-groups! "all" "INFO")
      ;; Static files, root page, and other non-API paths should be passed through
      (is (= 200 (:status (call-handler {:uri "/app/fonts/lato.woff2" :request-method :get :headers {}}))))
      (is (= 200 (:status (call-handler {:uri "/app/dist/app-main.js" :request-method :get :headers {}}))))
      (is (= 200 (:status (call-handler {:uri "/favicon.ico" :request-method :get :headers {}}))))
      (is (= 200 (:status (call-handler {:uri "/" :request-method :get :headers {}}))))
      ;; API requests should also work (they go through tracing)
      (is (= 200 (:status (call-handler {:uri "/api/health" :request-method :get :headers {}}))))
      (finally
        (tracing/shutdown-groups!)))))

(deftest tracing-disabled-passthrough-test
  (testing "when tracing is disabled, requests are passed through directly"
    (tracing/shutdown-groups!)
    (is (= 200 (:status (call-handler {:uri "/api/health" :request-method :get :headers {}}))))))

(deftest traceparent-parsing-test
  (testing "valid traceparent header is parsed and trace ID is forced"
    (try
      (tracing/init-enabled-groups! "all" "INFO")
      (let [trace-id "abcdef1234567890abcdef1234567890"
            request  {:uri "/api/health"
                      :request-method :get
                      :headers {"traceparent" (str "00-" trace-id "-1234567890abcdef-01")}}]
        ;; Ensure forced trace ID is clean before test
        (tracing/clear-forced-trace-id!)
        (is (= 200 (:status (call-handler request))))
        ;; After the request, the forced trace ID should be consumed (cleared)
        (is (nil? (tracing/get-and-clear-forced-trace-id!))))
      (finally
        (tracing/shutdown-groups!)))))

(deftest invalid-traceparent-ignored-test
  (testing "invalid traceparent headers are silently ignored"
    (try
      (tracing/init-enabled-groups! "all" "INFO")
      ;; Malformed headers should not cause errors
      (is (= 200 (:status (call-handler {:uri "/api/health" :request-method :get
                                         :headers {"traceparent" "garbage"}}))))
      (is (= 200 (:status (call-handler {:uri "/api/health" :request-method :get
                                         :headers {"traceparent" ""}}))))
      (is (= 200 (:status (call-handler {:uri "/api/health" :request-method :get
                                         :headers {"traceparent" "00-short-id-01"}}))))
      (finally
        (tracing/shutdown-groups!)))))

(deftest exception-handling-test
  (testing "exceptions in the handler are propagated via raise"
    (try
      (tracing/init-enabled-groups! "all" "INFO")
      (let [handler  (fn [_req _respond raise] (raise (ex-info "boom" {})))
            wrapped  (mw.trace/wrap-trace handler)
            result   (promise)]
        (wrapped {:uri "/api/test" :request-method :get :headers {}}
                 #(deliver result %)
                 #(deliver result %))
        (let [r (deref result 1000 :timeout)]
          (is (instance? clojure.lang.ExceptionInfo r))
          (is (= "boom" (.getMessage ^Exception r)))))
      (finally
        (tracing/shutdown-groups!)))))

(deftest sync-exception-handling-test
  (testing "synchronous exceptions from handler are caught and raised"
    (try
      (tracing/init-enabled-groups! "all" "INFO")
      (let [handler  (fn [_req _respond _raise] (throw (ex-info "sync-boom" {})))
            wrapped  (mw.trace/wrap-trace handler)
            result   (promise)]
        (wrapped {:uri "/api/test" :request-method :get :headers {}}
                 #(deliver result %)
                 #(deliver result %))
        (let [r (deref result 1000 :timeout)]
          (is (instance? clojure.lang.ExceptionInfo r))
          (is (= "sync-boom" (.getMessage ^Exception r)))))
      (finally
        (tracing/shutdown-groups!)))))
