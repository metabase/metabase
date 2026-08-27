(ns metabase-enterprise.agent-api.api-test
  "Integration tests for CLI usage recording via the `wrap-record-cli-usage` middleware in
  `metabase.agent-api.usage`. Drives the middleware directly so recording fires on the same
  synchronous thread, where identity, status, duration, and PII are all in scope. Recording
  runs on every EE instance (`:feature :none`); PII is gated by `analytics-pii-retention-enabled`
  (itself `:audit-app`-gated)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.agent-api.usage :as agent-api.usage]
   [metabase.api.common :as api]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- cleanup-by-ip!
  [& conditions]
  (apply t2/delete! :model/AgentApiCallLog conditions))

(defn- random-ip []
  (format "10.%d.%d.%d" (rand-int 250) (rand-int 250) (rand-int 250)))

(defn- invoke-middleware
  "Drive `wrap-record-cli-usage` synchronously and return the response. Wraps a stub handler that
  returns the given `handler-response` (default 200 OK). The middleware's respond callback fires
  on the same thread so identity/PII/duration are in scope."
  ([request]
   (invoke-middleware request {:status 200, :body "ok"}))
  ([request handler-response]
   (let [p       (promise)
         handler (agent-api.usage/wrap-record-cli-usage
                  (fn [_req respond _raise]
                    (respond handler-response)))]
     (binding [api/*current-user-id* (:metabase-user-id request)]
       (handler request
                (fn [resp] (deliver p resp))
                (fn [e] (deliver p e))))
     (deref p 5000 :timeout))))

(deftest middleware-records-cli-request-test
  (testing "a CLI REST API call is recorded with client classified from the User-Agent"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
        (let [ip (random-ip)]
          (try
            (let [resp (invoke-middleware {:request-method   :get
                                           :uri              "/api/card/42"
                                           :headers          {"user-agent" "metabase-cli/4.5.6"}
                                           :remote-addr      ip
                                           :metabase-user-id (mt/user->id :rasta)})]
              (is (= 200 (:status resp))))
            (let [row (t2/select-one :model/AgentApiCallLog :ip_address ip)]
              (is (some? row) "a row is recorded for the CLI call")
              (is (= "metabase-cli" (:client_name row)))
              (is (= "GET /api/card/:id" (:operation row)) "numeric segments are templatized")
              (is (= "success" (:status row)))
              (is (= (mt/user->id :rasta) (:user_id row)))
              (is (nat-int? (:duration_ms row))))
            (finally (cleanup-by-ip! :ip_address ip))))))))

(deftest middleware-skips-non-cli-request-test
  (testing "a non-CLI request does not produce a row"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
        (let [ip (random-ip)]
          (try
            (let [resp (invoke-middleware {:request-method   :get
                                           :uri              "/api/card"
                                           :headers          {"user-agent" "Mozilla/5.0"}
                                           :remote-addr      ip
                                           :metabase-user-id (mt/user->id :rasta)})]
              (is (= 200 (:status resp))))
            (is (nil? (t2/select-one :model/AgentApiCallLog :ip_address ip))
                "no row is written for a non-CLI request")
            (finally (cleanup-by-ip! :ip_address ip))))))))

(deftest middleware-skips-non-api-request-test
  (testing "a CLI request to a non-/api/ path does not produce a row"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
        (let [ip (random-ip)]
          (try
            (let [resp (invoke-middleware {:request-method   :get
                                           :uri              "/health"
                                           :headers          {"user-agent" "metabase-cli/4.5.6"}
                                           :remote-addr      ip
                                           :metabase-user-id (mt/user->id :rasta)})]
              (is (= 200 (:status resp))))
            (is (nil? (t2/select-one :model/AgentApiCallLog :ip_address ip))
                "no row is written for a non-/api/ path")
            (finally (cleanup-by-ip! :ip_address ip))))))))

(deftest middleware-records-error-response-test
  (testing "an error response is recorded with status=error and error_message (when PII is on)"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
        (let [ip (random-ip)]
          (try
            (let [resp (invoke-middleware {:request-method   :get
                                           :uri              "/api/card/999999"
                                           :headers          {"user-agent" "metabase-cli/4.5.6"}
                                           :remote-addr      ip
                                           :metabase-user-id (mt/user->id :rasta)}
                                          {:status 404, :body "Not found."})]
              (is (= 404 (:status resp))))
            (let [row (t2/select-one :model/AgentApiCallLog :ip_address ip)]
              (is (some? row) "a row is recorded for the error call")
              (is (= "error" (:status row)))
              (is (= "Not found." (:error_message row)) "error_message is captured from the body")
              (is (= "GET /api/card/:id" (:operation row))))
            (finally (cleanup-by-ip! :ip_address ip))))))))

(deftest middleware-pii-gating-test
  (testing "ip_address and error_message are nil when PII retention is off"
    (mt/with-premium-features #{}
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
        (let [ip    (random-ip)
              count-before (t2/count :model/AgentApiCallLog)]
          (invoke-middleware {:request-method   :get
                              :uri              "/api/card/999999"
                              :headers          {"user-agent" "metabase-cli/4.5.6"}
                              :remote-addr      ip
                              :metabase-user-id (mt/user->id :rasta)}
                             {:status 404, :body "Not found."})
          ;; Can't look up by ip (it's nil when PII is off), so check by count
          (let [count-after (t2/count :model/AgentApiCallLog)]
            (when (is (= (inc count-before) count-after) "a row was still recorded")
              (let [row (t2/select-one :model/AgentApiCallLog {:order-by [[:id :desc]]})]
                (is (nil? (:ip_address row)) "ip_address is nil when PII is off")
                (is (nil? (:error_message row)) "error_message is nil when PII is off")))))))))
