(ns metabase.server.middleware.exceptions-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.server.settings :as server.settings]
   [metabase.test :as mt])
  (:import
   (org.eclipse.jetty.io EofException)))

(set! *warn-on-reflection* true)

(defn- create-test-exception
  "Create a test exception with a stacktrace."
  [message]
  (try
    (throw (ex-info message {:custom-data "test-value"}))
    (catch Exception e
      e)))

(deftest api-exception-response-includes-error-message-test
  (testing "When hide-stacktraces is false, exception response includes the error message"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces false]
      (let [exception (create-test-exception "Test error message")
            response (mw.exceptions/api-exception-response exception nil)]
        (is (= 500 (:status response)))
        (is (= "Test error message" (get-in response [:body :message])))))))

(deftest api-exception-response-includes-stacktrace-test
  (testing "When hide-stacktraces is false, exception response includes stacktrace information"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces false]
      (let [exception (create-test-exception "Test error message")
            response (mw.exceptions/api-exception-response exception nil)]
        (is (contains? (:body response) :trace)
            "Response should contain :trace key with stacktrace")
        (is (vector? (get-in response [:body :trace]))
            "Stacktrace should be a vector")))))

(deftest api-exception-response-includes-ex-data-test
  (testing "When hide-stacktraces is false, exception response includes ex-data"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces false]
      (let [exception (create-test-exception "Test error message")
            response (mw.exceptions/api-exception-response exception nil)]
        (is (= "test-value" (get-in response [:body :custom-data]))
            "Response should include custom data from ex-info")))))

(deftest api-exception-response-includes-exception-chain-test
  (testing "When hide-stacktraces is false, exception response includes exception chain information"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces false]
      (let [exception (create-test-exception "Test error message")
            response (mw.exceptions/api-exception-response exception nil)]
        (is (contains? (:body response) :via)
            "Response should contain :via key with exception chain")))))

(deftest api-exception-response-hides-stacktraces-returns-generic-message-test
  (testing "When hide-stacktraces is true, exception response contains only a generic message"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces true]
      (let [exception (create-test-exception "Test error message with sensitive info")
            response (mw.exceptions/api-exception-response exception nil)]
        (is (= 500 (:status response)))
        (is (= "Something went wrong" (get-in response [:body :message]))
            "Should return generic message instead of actual exception message")))))

(deftest api-exception-response-hides-stacktraces-omits-trace-test
  (testing "When hide-stacktraces is true, exception response does not include stacktrace"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces true]
      (let [exception (create-test-exception "Test error message with sensitive info")
            response (mw.exceptions/api-exception-response exception nil)]
        (is (not (contains? (:body response) :trace))
            "Response should not contain :trace key")))))

(deftest api-exception-response-hides-stacktraces-omits-ex-data-test
  (testing "When hide-stacktraces is true, exception response does not include ex-data"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces true]
      (let [exception (create-test-exception "Test error message with sensitive info")
            response (mw.exceptions/api-exception-response exception nil)]
        (is (not (contains? (:body response) :custom-data))
            "Response should not include custom data from ex-info")))))

(deftest api-exception-response-hides-stacktraces-omits-exception-chain-test
  (testing "When hide-stacktraces is true, exception response does not include exception chain"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces true]
      (let [exception (create-test-exception "Test error message with sensitive info")
            response (mw.exceptions/api-exception-response exception nil)]
        (is (not (contains? (:body response) :via))
            "Response should not contain :via key")))))

(deftest api-exception-response-hides-stacktraces-omits-original-message-test
  (testing "When hide-stacktraces is true, exception response does not reveal the original message"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces true]
      (let [exception (create-test-exception "Test error message with sensitive info")
            response (mw.exceptions/api-exception-response exception nil)]
        (is (not (str/includes? (str (:body response)) "sensitive info"))
            "Response should not contain any part of the original error message")))))

(deftest api-exception-response-hides-stacktraces-minimal-body-test
  (testing "When hide-stacktraces is true, exception response body is minimal"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces true]
      (let [exception (create-test-exception "Test error message with sensitive info")
            response (mw.exceptions/api-exception-response exception nil)]
        (is (= {:message "Something went wrong"} (:body response))
            "Response body should only contain the generic message")))))

(deftest api-exception-response-404-without-extra-data-test
  (testing "404 errors with status-code and no extra data return plain message"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces false]
      (let [exception (ex-info "Resource not found" {:status-code 404})
            response (mw.exceptions/api-exception-response exception nil)]
        (is (= 404 (:status response)))
        (is (= "Resource not found" (:body response))
            "Should return plain message for 404s")))))

(deftest api-exception-response-404-with-extra-data-hides-details-test
  (testing "404 errors with extra data hide details when hide-stacktraces is enabled"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces true]
      (let [exception (ex-info "Resource not found with details" {:status-code 404 :resource-id 123})
            response (mw.exceptions/api-exception-response exception nil)]
        (is (= 404 (:status response))
            "Status should remain 404 from exception")
        (is (= "Something went wrong" (get-in response [:body :message]))
            "Should return generic message")
        (is (not (contains? (:body response) :resource-id))
            "Should not include resource-id from ex-data")))))

(deftest api-exception-response-validation-errors-with-stacktraces-disabled-test
  (testing "Validation errors with :errors key are returned when hide-stacktraces is false"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces false]
      (let [exception (ex-info "Validation failed"
                               {:status-code 400
                                :errors {:email "Invalid email format"
                                         :password "Password too short"}})
            response (mw.exceptions/api-exception-response exception nil)]
        (is (= 400 (:status response)))
        (is (= {:email "Invalid email format"
                :password "Password too short"}
               (get-in response [:body :errors]))
            "Should include validation errors")))))

(deftest api-exception-response-validation-errors-with-stacktraces-enabled-test
  (testing "Validation errors with :errors key are returned even when hide-stacktraces is true"
    (mt/with-temporary-setting-values [server.settings/hide-stacktraces true]
      (let [exception (ex-info "Validation failed"
                               {:status-code 400
                                :errors {:email "Invalid email format"
                                         :password "Password too short"}})
            response (mw.exceptions/api-exception-response exception nil)]
        (is (= 400 (:status response)))
        (is (= {:email "Invalid email format"
                :password "Password too short"}
               (get-in response [:body :errors]))
            "Should still include validation errors even with hide-stacktraces enabled")))))

(deftest catch-api-exceptions-middleware-with-stacktraces-disabled-test
  (testing "catch-api-exceptions middleware with hide-stacktraces disabled returns full error details"
    (let [test-exception (create-test-exception "Middleware test error")
          handler (mw.exceptions/catch-api-exceptions
                   (fn [_request _respond raise]
                     (raise test-exception)))]
      (mt/with-temporary-setting-values [server.settings/hide-stacktraces false]
        (let [captured-response (atom nil)]
          (handler
           {:uri "/api/test"}
           (fn [response] (reset! captured-response response))
           (fn [_e] (is false "Should not call raise")))
          (is (= 500 (:status @captured-response)))
          (is (contains? (:body @captured-response) :trace)
              "Response should include stacktrace"))))))

(deftest catch-api-exceptions-middleware-with-stacktraces-enabled-test
  (testing "catch-api-exceptions middleware with hide-stacktraces enabled returns only generic message"
    (let [test-exception (create-test-exception "Middleware test error")
          handler (mw.exceptions/catch-api-exceptions
                   (fn [_request _respond raise]
                     (raise test-exception)))]
      (mt/with-temporary-setting-values [server.settings/hide-stacktraces true]
        (let [captured-response (atom nil)]
          (handler
           {:uri "/api/test"}
           (fn [response] (reset! captured-response response))
           (fn [_e] (is false "Should not call raise")))
          (is (= 500 (:status @captured-response)))
          (is (= "Something went wrong" (get-in @captured-response [:body :message]))
              "Response should only include generic message")
          (is (not (contains? (:body @captured-response) :trace))
              "Response should not include stacktrace"))))))

(deftest catch-api-exceptions-middleware-eof-exception-logs-request-info-test
  (testing "EofException (request canceled) log line includes the HTTP method, URI, and client IP"
    (let [handler (mw.exceptions/catch-api-exceptions
                   (fn [_request _respond raise]
                     (raise (EofException. "canceled"))))
          captured-response (atom nil)]
      (mt/with-log-messages-for-level [messages [metabase.server.middleware.exceptions :info]]
        (handler
         {:request-method :post
          :uri            "/api/dataset"
          :remote-addr    "10.1.2.3"
          :headers        {}}
         (fn [response] (reset! captured-response response))
         (fn [_e] (is false "Should not call raise")))
        (let [log-message (->> (messages) (map :message) (str/join "\n"))]
          (is (str/includes? log-message "Request canceled before finishing"))
          (is (str/includes? log-message "POST /api/dataset")
              "Log message should include the HTTP method and URI")
          (is (str/includes? log-message "10.1.2.3")
              "Log message should include the client IP address")))
      (is (= 204 (:status-code @captured-response))))))

(deftest catch-api-exceptions-middleware-eof-exception-logs-forwarded-ip-test
  (testing "EofException log line uses X-Forwarded-For to identify the client behind a proxy"
    (let [handler (mw.exceptions/catch-api-exceptions
                   (fn [_request _respond raise]
                     (raise (EofException. "canceled"))))]
      (mt/with-log-messages-for-level [messages [metabase.server.middleware.exceptions :info]]
        (handler
         {:request-method :get
          :uri            "/api/card/1/query"
          :remote-addr    "127.0.0.1"
          :headers        {"x-forwarded-for" "203.0.113.7"}}
         (fn [_response])
         (fn [_e] (is false "Should not call raise")))
        (let [log-message (->> (messages) (map :message) (str/join "\n"))]
          (is (str/includes? log-message "GET /api/card/1/query"))
          (is (str/includes? log-message "203.0.113.7")
              "Log message should report the forwarded client IP, not the proxy's"))))))

(deftest catch-uncaught-exceptions-middleware-test
  (testing "catch-uncaught-exceptions middleware routes exceptions to raise handler"
    (let [test-exception (create-test-exception "Uncaught exception test")
          handler (mw.exceptions/catch-uncaught-exceptions
                   (fn [_request _respond _raise]
                     (throw test-exception)))
          captured-exception (atom nil)]
      (handler
       {:uri "/api/test"}
       (fn [_response] (is false "Should not call respond"))
       (fn [e] (reset! captured-exception e)))
      (is (= test-exception @captured-exception)
          "Exception should be routed to raise handler"))))

(deftest unhandled-error-increments-prometheus-counter-test
  (testing "An unhandled exception (no status-code in ex-data) increments :metabase-api/unhandled-errors"
    (mt/with-prometheus-system! [_ system]
      (let [initial (mt/metric-value system :metabase-api/unhandled-errors)]
        (mw.exceptions/api-exception-response (Exception. "boom") nil)
        (is (< initial (mt/metric-value system :metabase-api/unhandled-errors))))))
  (testing "An exception with an explicit status-code does NOT increment the counter"
    (mt/with-prometheus-system! [_ system]
      (let [initial (mt/metric-value system :metabase-api/unhandled-errors)]
        (mw.exceptions/api-exception-response (ex-info "not found" {:status-code 404}) nil)
        (is (= initial (mt/metric-value system :metabase-api/unhandled-errors)))))))
