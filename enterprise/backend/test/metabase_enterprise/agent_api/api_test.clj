(ns metabase-enterprise.agent-api.api-test
  "Integration tests for the Agent API usage instrumentation in `metabase.agent-api.api` — driving
  the real `routes` wrapper so the recording happens on the same synchronous thread, where
  identity, status, duration, and PII are all in scope. Recording runs on every EE instance
  (`:feature :none`); PII is gated by `analytics-pii-retention-enabled` (itself `:audit-app`-gated)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.agent-api.api :as agent-api.api]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- cleanup-by-ip!
  "Isolate + clean up a test's rows by the unique fake ip_address it recorded (PII, so present only
  when retention is on)."
  [& conditions]
  (apply t2/delete! :model/AgentApiCallLog conditions))

(defn- random-ip
  "A random, well-formed IPv4 address for test-row isolation. Well-formed so it survives
  `request/ip-address`'s non-IP-character stripping unchanged, and thus round-trips into
  `ip_address` for a precise lookup/cleanup key."
  []
  (format "10.%d.%d.%d" (rand-int 250) (rand-int 250) (rand-int 250)))

(defn- invoke-routes
  "Drive `agent-api.api/routes` synchronously and return the response. `extra` is merged onto a
  minimal authenticated GET /api/agent/v1/ping request. `:uri` is the full public path (what the
  recorder stores as `operation`); `:path-info` is the context-stripped path the router matches on."
  [extra]
  (let [p (promise)]
    (agent-api.api/routes
     (merge {:request-method   :get
             :uri              "/api/agent/v1/ping"
             :path-info        "/v1/ping"
             :metabase-user-id (mt/user->id :rasta)}
            extra)
     (fn [resp] (deliver p resp))
     (fn [e] (deliver p e)))
    (deref p 5000 :timeout)))

(deftest routes-records-direct-http-call-test
  (testing "a direct Agent API call is recorded with client classified from the User-Agent"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
        (let [ip (random-ip)]
          (try
            (let [resp (invoke-routes {:headers {"user-agent" "metabase-cli/4.5.6"}
                                       :remote-addr ip})]
              (is (= 200 (:status resp))))
            (let [row (t2/select-one :model/AgentApiCallLog :ip_address ip)]
              (is (some? row) "a row is recorded for the direct HTTP call")
              (is (= "metabase-cli" (:client_name row)))
              (is (= "GET /api/agent/v1/ping" (:operation row)))
              (is (= "success" (:status row)))
              (is (= (mt/user->id :rasta) (:user_id row)))
              (is (nat-int? (:duration_ms row))))
            (finally (cleanup-by-ip! :ip_address ip))))))))

(deftest routes-skips-synthetic-internal-request-test
  (testing "MCP's synthetic in-process dispatch (:agent-api-internal-request? true) is NOT recorded,
           so it never double-counts against the row already written to mcp_tool_call_log"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
        (let [ip (random-ip)]
          (try
            (let [resp (invoke-routes {:headers {"user-agent" "metabase-cli/4.5.6"}
                                       :remote-addr ip
                                       :agent-api-internal-request? true})]
              (is (= 200 (:status resp))))
            (is (nil? (t2/select-one :model/AgentApiCallLog :ip_address ip))
                "no agent_api_call_log row is written for the synthetic internal request")
            (finally (cleanup-by-ip! :ip_address ip))))))))
