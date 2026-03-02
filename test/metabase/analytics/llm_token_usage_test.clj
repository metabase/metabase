(ns metabase.analytics.llm-token-usage-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.llm-token-usage :as llm-token-usage]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- uuid->token-usage-request-id -------------------------------------------

(deftest uuid->token-usage-request-id-test
  (testing "UUID string produces 32-char hex string"
    (is (re-matches #"[0-9a-f]{32}" (llm-token-usage/uuid->token-usage-request-id (str (random-uuid))))))
  (testing "UUID object produces 32-char hex string"
    (is (re-matches #"[0-9a-f]{32}" (llm-token-usage/uuid->token-usage-request-id (random-uuid))))))

;;; ------------------------------------------- track-snowplow! -------------------------------------------

(def ^:private base-usage
  {:request-id          "abc123"
   :model-id            "anthropic/claude-haiku-4-5"
   :total-tokens        150
   :prompt-tokens       100
   :completion-tokens   50
   :estimated-costs-usd 0.0})

(deftest track-snowplow!-oss-fallback-test
  (testing "no premium token → hashed_metabase_license_token is oss__<uuid>"
    (let [test-uuid "test-analytics-uuid-12345"]
      (mt/with-temporary-setting-values [premium-embedding-token nil
                                         analytics-uuid           test-uuid]
        (snowplow-test/with-fake-snowplow-collector
          (llm-token-usage/track-snowplow! base-usage)
          (is (=? [{:data {"hashed_metabase_license_token" (str "oss__" test-uuid)}}]
                  (snowplow-test/pop-event-data-and-user-id!))))))))

(deftest track-snowplow!-premium-token-test
  (testing "premium token set → 64-char SHA-256 hex (no oss__ prefix)"
    (mt/with-random-premium-token! [premium-token]
      (mt/with-temporary-setting-values [premium-embedding-token premium-token]
        (snowplow-test/with-fake-snowplow-collector
          (llm-token-usage/track-snowplow! base-usage)
          (is (=? [{:data {"hashed_metabase_license_token" #"[0-9a-f]{64}"}}]
                  (snowplow-test/pop-event-data-and-user-id!))))))))

(deftest track-snowplow!-explicit-token-test
  (testing "caller-provided :hashed-metabase-license-token is used as-is"
    (mt/with-temporary-setting-values [premium-embedding-token nil]
      (snowplow-test/with-fake-snowplow-collector
        (llm-token-usage/track-snowplow! (assoc base-usage :hashed-metabase-license-token "my-custom-hash"))
        (is (=? [{:data {"hashed_metabase_license_token" "my-custom-hash"}}]
                (snowplow-test/pop-event-data-and-user-id!)))))))

(deftest track-snowplow!-all-fields-test
  (testing "all Snowplow event fields are present and correct"
    (mt/with-temporary-setting-values [premium-embedding-token nil
                                       analytics-uuid           "uuid-for-test"]
      (snowplow-test/with-fake-snowplow-collector
        (llm-token-usage/track-snowplow! {:request-id          "deadbeef00"
                                          :model-id            "openai/gpt-4"
                                          :total-tokens        300
                                          :prompt-tokens       200
                                          :completion-tokens   100
                                          :estimated-costs-usd 0.0
                                          :user-id             42
                                          :duration-ms         1234
                                          :source              "oss_metabot"
                                          :tag                 "oss-sqlgen"
                                          :session-id          "session-abc"
                                          :profile             "internal"})
        (is (=? [{:user-id "42"
                  :data    {"hashed_metabase_license_token" "oss__uuid-for-test"
                            "request_id"                   "deadbeef00"
                            "model_id"                     "openai/gpt-4"
                            "total_tokens"                 300
                            "prompt_tokens"                200
                            "completion_tokens"            100
                            "estimated_costs_usd"          0.0
                            "duration_ms"                  1234
                            "source"                       "oss_metabot"
                            "tag"                          "oss-sqlgen"
                            "session_id"                   "session-abc"
                            "profile"                      "internal"}}]
                (snowplow-test/pop-event-data-and-user-id!)))))))

;;; ------------------------------------------- track-prometheus! -------------------------------------------

(defn- clear-llm-metrics! []
  ;; mt/with-prometheus-system! is slow, so prefer to clear metrics between test cases
  (prometheus/clear! :metabase-metabot/llm-input-tokens)
  (prometheus/clear! :metabase-metabot/llm-output-tokens)
  (prometheus/clear! :metabase-metabot/llm-tokens-per-call))

(deftest track-prometheus!-test
  (mt/with-prometheus-system! [_ system]
    (testing "increments prometheus metrics with correct labels and values"
      (llm-token-usage/track-prometheus! {:model-id          "anthropic/claude-haiku-4-5"
                                          :tag               "test-tag"
                                          :prompt-tokens     100
                                          :completion-tokens 50})
      (let [labels {:model "anthropic/claude-haiku-4-5" :source "test-tag"}]
        (is (= 100.0 (mt/metric-value system :metabase-metabot/llm-input-tokens labels)))
        (is (= 50.0  (mt/metric-value system :metabase-metabot/llm-output-tokens labels)))
        (is (= 150.0 (:sum (mt/metric-value system :metabase-metabot/llm-tokens-per-call labels))))))))

;;; ------------------------------------------- track-token-usage! -------------------------------------------

(deftest track-token-usage!-test
  (mt/with-prometheus-system! [_ system]
    (testing "both Snowplow and Prometheus fire when both are true"
      (mt/with-temporary-setting-values [premium-embedding-token nil
                                         analytics-uuid           "uuid-for-track-usage"]
        (snowplow-test/with-fake-snowplow-collector
          (llm-token-usage/track-token-usage!
           {:snowplow            true
            :prometheus          true
            :request-id          "req-123"
            :model-id            "anthropic/claude-haiku-4-5"
            :tag                 "test-tag"
            :prompt-tokens       100
            :completion-tokens   50
            :total-tokens        150
            :estimated-costs-usd 0.0})
          (testing "Snowplow event fired"
            (is (=? [{:data {"request_id"    "req-123"
                             "model_id"      "anthropic/claude-haiku-4-5"
                             "total_tokens"  150
                             "prompt_tokens" 100}}]
                    (snowplow-test/pop-event-data-and-user-id!))))
          (testing "Prometheus metrics incremented"
            (let [labels {:model "anthropic/claude-haiku-4-5" :source "test-tag"}]
              (is (= 100.0 (mt/metric-value system :metabase-metabot/llm-input-tokens labels)))
              (is (= 50.0  (mt/metric-value system :metabase-metabot/llm-output-tokens labels)))
              (is (= 150.0 (:sum (mt/metric-value system :metabase-metabot/llm-tokens-per-call labels)))))))))

    (clear-llm-metrics!)

    (testing "Snowplow suppressed when :snowplow false"
      (snowplow-test/with-fake-snowplow-collector
        (llm-token-usage/track-token-usage! {:snowplow            false
                                             :prometheus          true
                                             :request-id          "req-123"
                                             :model-id            "anthropic/claude-haiku-4-5"
                                             :tag                 "test-tag"
                                             :prompt-tokens       100
                                             :completion-tokens   50
                                             :total-tokens        150
                                             :estimated-costs-usd 0.0})
        (testing "no Snowplow event"
          (is (empty? (snowplow-test/pop-event-data-and-user-id!))))
        (testing "Prometheus still fires"
          (is (= 100.0 (mt/metric-value system :metabase-metabot/llm-input-tokens
                                        {:model "anthropic/claude-haiku-4-5" :source "test-tag"}))))))

    (clear-llm-metrics!)

    (testing "Prometheus suppressed when :prometheus false"
      (mt/with-temporary-setting-values [premium-embedding-token nil
                                         analytics-uuid           "uuid-prometheus-false"]
        (snowplow-test/with-fake-snowplow-collector
          (llm-token-usage/track-token-usage! {:snowplow            true
                                               :prometheus          false
                                               :request-id          "req-456"
                                               :model-id            "openai/gpt-4"
                                               :prompt-tokens       200
                                               :completion-tokens   100
                                               :total-tokens        300
                                               :estimated-costs-usd 0.0})
          (testing "Snowplow event fired"
            (is (=? [{:data {"request_id" "req-456"}}]
                    (snowplow-test/pop-event-data-and-user-id!))))
          (testing "no Prometheus metrics incremented"
            (is (= 0.0 (mt/metric-value system :metabase-metabot/llm-input-tokens
                                        {:model "openai/gpt-4" :source "none"})))))))))

(deftest track-token-usage!-both-false-error-test
  (testing "throws when both :snowplow and :prometheus are false"
    (is (thrown? Exception
                 (llm-token-usage/track-token-usage! {:model-id            "openai/gpt-4"
                                                      :prompt-tokens       100
                                                      :completion-tokens   50
                                                      :total-tokens        150
                                                      :estimated-costs-usd 0.0
                                                      :snowplow            false
                                                      :prometheus          false})))))
