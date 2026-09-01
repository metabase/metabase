(ns metabase-enterprise.agent-api.usage-test
  "Tests for the Agent API (CLI) usage write point — one lean `agent_api_call_log` row per direct
  Agent API HTTP call. Exercises the `defenterprise` dispatch via the OSS entry point in
  `metabase.agent-api.usage`. Collection runs on every EE instance (`:feature :none`); PII is gated
  by `analytics-pii-retention-enabled` (itself `:audit-app`-gated). The end-to-end path through the
  real `routes` wrapper is covered in `metabase-enterprise.agent-api.api-test`."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.agent-api.usage :as usage]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- cleanup-by-ip!
  "Rows are isolated + cleaned up by a unique fake ip_address (PII, so recorded only when retention
  is on) or by a unique operation string, whichever the test keys on."
  [& conditions]
  (apply t2/delete! :model/AgentApiCallLog conditions))

;;; --------------------------------------------- detect-client (pure) --------------------------------------

(deftest ^:parallel detect-client-test
  (testing "the CLI's User-Agent maps to the canonical client key"
    (is (= "metabase-cli" (usage/detect-client "metabase-cli/1.2.3")))
    (is (= "metabase-cli" (usage/detect-client "Metabase-CLI/9")))
    (is (= "metabase-cli" (usage/detect-client "some-wrapper metabase-cli/0.1"))))
  (testing "unknown / missing User-Agents fall back to \"other\""
    (is (= "other" (usage/detect-client "Mozilla/5.0")))
    (is (= "other" (usage/detect-client "")))
    (is (= "other" (usage/detect-client nil))))
  (testing "every value produced is a supported key or the \"other\" fallback"
    (doseq [ua ["metabase-cli/1" "curl/8" "Mozilla/5.0" nil ""]]
      (is (contains? (conj usage/supported-client-keys "other")
                     (usage/detect-client ua))))))

;;; ------------------------------------------ record-agent-api-call! ---------------------------------------

(deftest record-agent-api-call!-writes-row-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
      (let [op (str "GET /api/agent/v1/ping?" (mt/random-name))]
        (try
          (usage/record-agent-api-call!
           {:user-id     (mt/user->id :rasta)
            :tenant-id   nil
            :user-agent  "metabase-cli/1.2.3"
            :operation   op
            :status      "success"
            :duration-ms 12
            :ip-address  "203.0.113.7"})
          (let [row (t2/select-one :model/AgentApiCallLog :operation op)]
            (testing "non-PII columns"
              (is (= "metabase-cli" (:client_name row)))
              (is (= "success" (:status row)))
              (is (= 12 (:duration_ms row)))
              (is (= (mt/user->id :rasta) (:user_id row))))
            (testing "PII column populated when retention is on"
              (is (= "203.0.113.7" (:ip_address row)))))
          (finally (cleanup-by-ip! :operation op)))))))

(deftest record-agent-api-call!-pii-gate-test
  (testing "ip_address / error_message are stored only when retention is on"
    (mt/with-premium-features #{:audit-app}
      (testing "retention on: PII columns populated"
        (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
          (let [op (str "on-" (mt/random-name))]
            (try
              (usage/record-agent-api-call!
               {:user-id (mt/user->id :rasta) :operation op :status "error" :duration-ms 1
                :user-agent "metabase-cli/1" :ip-address "203.0.113.7" :error-message "boom"})
              (let [row (t2/select-one :model/AgentApiCallLog :operation op)]
                (is (= "203.0.113.7" (:ip_address row)))
                (is (= "boom" (:error_message row))))
              (finally (cleanup-by-ip! :operation op))))))
      (testing "retention off: PII columns stay null"
        (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
          (let [op (str "off-" (mt/random-name))]
            (try
              (usage/record-agent-api-call!
               {:user-id (mt/user->id :rasta) :operation op :status "error" :duration-ms 1
                :user-agent "metabase-cli/1" :ip-address "203.0.113.7" :error-message "boom"})
              (let [row (t2/select-one :model/AgentApiCallLog :operation op)]
                (is (nil? (:ip_address row)))
                (is (nil? (:error_message row))))
              (finally (cleanup-by-ip! :operation op)))))))))

(deftest record-agent-api-call!-truncates-operation-test
  (testing "an over-long operation is truncated to the column width so the row still records"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
        (let [ip     (str (random-uuid))
              long-op (apply str (repeat 300 \x))]
          (try
            (usage/record-agent-api-call!
             {:user-id (mt/user->id :rasta) :operation long-op :status "success" :duration-ms 1
              :ip-address ip})
            (is (= 255 (count (:operation (t2/select-one :model/AgentApiCallLog :ip_address ip)))))
            (finally (cleanup-by-ip! :ip_address ip))))))))

;;; --------------------------------------------- Feature gating --------------------------------------------

(deftest collection-runs-on-ee-without-audit-app-test
  (testing "collection happens on any EE instance (:feature :none), but PII stays null without :audit-app"
    (mt/with-premium-features #{}
      (let [op (str "no-audit-" (mt/random-name))]
        (try
          (usage/record-agent-api-call!
           {:user-id (mt/user->id :rasta) :operation op :status "success" :duration-ms 1
            :user-agent "metabase-cli/1" :ip-address "1.2.3.4" :error-message "x"})
          (let [row (t2/select-one :model/AgentApiCallLog :operation op)]
            (testing "non-PII row is written"
              (is (some? row))
              (is (= "metabase-cli" (:client_name row)))
              (is (= (mt/user->id :rasta) (:user_id row))))
            (testing "PII is null because retention can't be enabled without :audit-app"
              (is (nil? (:ip_address row)))
              (is (nil? (:error_message row)))))
          (finally (cleanup-by-ip! :operation op)))))))

;;; ------------------------------------------- Best-effort logging -----------------------------------------

(deftest logging-is-best-effort-test
  (testing "a failed write is swallowed and never propagates"
    (mt/with-premium-features #{:audit-app}
      (mt/with-dynamic-fn-redefs [t2/insert! (fn [& _] (throw (ex-info "boom" {})))]
        (is (nil? (usage/record-agent-api-call!
                   {:user-id 1 :operation "GET /api/agent/v1/ping" :status "success" :duration-ms 1})))))))
