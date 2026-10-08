(ns metabase.analytics.llm-token-usage-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.llm-token-usage :as llm-token-usage]
   [metabase.analytics.metaplow-test :as metaplow-test]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   (com.github.erosb.jsonsKema FormatValidationPolicy JsonParser SchemaLoader Validator ValidatorConfig)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- track-snowplow! -------------------------------------------

(def ^:private base-usage
  {:request-id          "abc123"
   :model-id            "anthropic/claude-haiku-4-5"
   :provider            "anthropic"
   :model-name          "claude-haiku-4-5"
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

(defn- schema-violation
  [event-data]
  (let [path   (str "snowplow/iglu-client-embedded/schemas/com.metabase/token_usage/jsonschema/"
                    (#'snowplow/schema->version :snowplow/token_usage))
        ;; Otherwise the loader would fetch the meta-schema that `$schema` names over the network
        schema (-> (json/decode (slurp path)) (dissoc "$schema") json/encode)]
    (.validate (Validator/create (.load (SchemaLoader. schema))
                                 (ValidatorConfig. FormatValidationPolicy/ALWAYS))
               (.parse (JsonParser. (json/encode event-data))))))

(deftest track-snowplow!-all-fields-test
  (testing "all Snowplow event fields are present and correct"
    (mt/with-temporary-setting-values [premium-embedding-token nil
                                       analytics-uuid           "uuid-for-test"]
      (snowplow-test/with-fake-snowplow-collector
        (llm-token-usage/track-snowplow! {:request-id            "deadbeef00"
                                          :model-id              "openai/gpt-4"
                                          :provider              "openai"
                                          :model-name            "gpt-4"
                                          :total-tokens          300
                                          :prompt-tokens         200
                                          :completion-tokens     100
                                          :cache-creation-tokens 250
                                          :cache-read-tokens     900
                                          :estimated-costs-usd   0.0
                                          :user-id               42
                                          :duration-ms           1234
                                          :source                "oss_metabot"
                                          :tag                   "oss-sqlgen"
                                          :session-id            "session-abc"
                                          :profile               "internal"})
        (let [events (snowplow-test/pop-event-data-and-user-id!)]
          (is (=? [{:user-id "42"
                    :data    {"hashed_metabase_license_token" "oss__uuid-for-test"
                              "request_id"                   "deadbeef00"
                              "model_id"                     "openai/gpt-4"
                              "total_tokens"                 300
                              "prompt_tokens"                200
                              "completion_tokens"            100
                              "cache_creation_tokens"        250
                              "cache_read_tokens"            900
                              "estimated_costs_usd"          0.0
                              "duration_ms"                  1234
                              "source"                       "oss_metabot"
                              "tag"                          "oss-sqlgen"
                              "session_id"                   "session-abc"
                              "profile"                      "internal"}}]
                  events))
          (testing "and it validates against its schema"
            (is (nil? (schema-violation (:data (first events)))))))))))

(deftest track-snowplow!-matches-schema-test
  (testing "an event without any optional field validates against its schema"
    (snowplow-test/with-fake-snowplow-collector
      (llm-token-usage/track-snowplow! base-usage)
      (let [event (->> (snowplow-test/pop-event-data-and-user-id!)
                       (map :data)
                       (some #(when (contains? % "total_tokens") %)))]
        (is (nil? (schema-violation event)))
        (testing "and the schema rejects a field it does not declare"
          (is (some? (schema-violation (assoc event "undeclared_field" "value")))))))))

(deftest track-snowplow!-metaplow-only-fields-test
  (testing "Metaplow gets the provider and the model name, which the Snowplow schema doesn't declare"
    (is (=? [{:name "token_usage"
              :data {"request_id" "abc123"
                     "model_id"   "anthropic/claude-haiku-4-5"
                     "provider"   "anthropic"
                     "model_name" "claude-haiku-4-5"}}]
            (metaplow-test/events-sent-by! #(llm-token-usage/track-snowplow! base-usage))))))

;;; ------------------------------------------- track-prometheus! -------------------------------------------

(defn- clear-llm-metrics! []
  ;; mt/with-prometheus-system! is slow, so prefer to clear metrics between test cases
  (analytics/clear! :metabase-metabot/llm-input-tokens)
  (analytics/clear! :metabase-metabot/llm-output-tokens)
  (analytics/clear! :metabase-metabot/llm-cache-creation-tokens)
  (analytics/clear! :metabase-metabot/llm-cache-read-tokens)
  (analytics/clear! :metabase-metabot/llm-tokens-per-call))

(deftest track-prometheus!-test
  (mt/with-prometheus-system! [_ system]
    (let [labels {:model "anthropic/claude-haiku-4-5" :source "test-tag" :provider "anthropic"}]
      (testing "increments prometheus metrics with correct labels and values"
        (llm-token-usage/track-prometheus! {:model-id          "anthropic/claude-haiku-4-5"
                                            :provider          "anthropic"
                                            :tag               "test-tag"
                                            :prompt-tokens     100
                                            :completion-tokens 50})
        (is (= 100.0 (mt/metric-value system :metabase-metabot/llm-input-tokens labels)))
        (is (= 50.0  (mt/metric-value system :metabase-metabot/llm-output-tokens labels)))
        (is (= 150.0 (:sum (mt/metric-value system :metabase-metabot/llm-tokens-per-call labels))))
        (testing "cache counters are untouched when cache fields are omitted"
          (is (zero? (mt/metric-value system :metabase-metabot/llm-cache-creation-tokens labels)))
          (is (zero? (mt/metric-value system :metabase-metabot/llm-cache-read-tokens labels)))))
      (clear-llm-metrics!)
      (testing "positive cache token fields increment their counters"
        (llm-token-usage/track-prometheus! {:model-id              "anthropic/claude-haiku-4-5"
                                            :provider              "anthropic"
                                            :tag                   "test-tag"
                                            :prompt-tokens         100
                                            :completion-tokens     50
                                            :cache-creation-tokens 400
                                            :cache-read-tokens     1600})
        (is (= 400.0  (mt/metric-value system :metabase-metabot/llm-cache-creation-tokens labels)))
        (is (= 1600.0 (mt/metric-value system :metabase-metabot/llm-cache-read-tokens labels))))
      (clear-llm-metrics!)
      (testing "a call with no provider is counted under the unknown provider"
        (llm-token-usage/track-prometheus! {:model-id          "anthropic/claude-haiku-4-5"
                                            :tag               "test-tag"
                                            :prompt-tokens     100
                                            :completion-tokens 50})
        (is (= 100.0 (mt/metric-value system :metabase-metabot/llm-input-tokens
                                      (assoc labels :provider "unknown")))))
      (clear-llm-metrics!)
      (testing "the provider label separates series that would otherwise share a model and source"
        (llm-token-usage/track-prometheus! {:model-id          "anthropic/claude-haiku-4-5"
                                            :provider          "openrouter"
                                            :tag               "test-tag"
                                            :prompt-tokens     100
                                            :completion-tokens 50})
        (is (zero? (mt/metric-value system :metabase-metabot/llm-input-tokens labels)))
        (is (= 100.0 (mt/metric-value system :metabase-metabot/llm-input-tokens
                                      (assoc labels :provider "openrouter")))))
      (clear-llm-metrics!)
      (testing "zero / nil cache token fields do not increment their counters"
        (llm-token-usage/track-prometheus! {:model-id              "anthropic/claude-haiku-4-5"
                                            :provider              "anthropic"
                                            :tag                   "test-tag"
                                            :prompt-tokens         100
                                            :completion-tokens     50
                                            :cache-creation-tokens 0
                                            :cache-read-tokens     nil})
        (is (zero? (mt/metric-value system :metabase-metabot/llm-cache-creation-tokens labels)))
        (is (zero? (mt/metric-value system :metabase-metabot/llm-cache-read-tokens labels)))))))

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
            :provider            "anthropic"
            :model-name          "claude-haiku-4-5"
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
            (let [labels {:model "anthropic/claude-haiku-4-5" :source "test-tag" :provider "anthropic"}]
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
                                        {:model "anthropic/claude-haiku-4-5" :source "test-tag" :provider "unknown"}))))))
    (clear-llm-metrics!)
    (testing "Prometheus suppressed when :prometheus false"
      (mt/with-temporary-setting-values [premium-embedding-token nil
                                         analytics-uuid           "uuid-prometheus-false"]
        (snowplow-test/with-fake-snowplow-collector
          (llm-token-usage/track-token-usage! {:snowplow            true
                                               :prometheus          false
                                               :request-id          "req-456"
                                               :model-id            "openai/gpt-4"
                                               :provider            "openai"
                                               :model-name          "gpt-4"
                                               :prompt-tokens       200
                                               :completion-tokens   100
                                               :total-tokens        300
                                               :estimated-costs-usd 0.0})
          (testing "Snowplow event fired"
            (is (=? [{:data {"request_id" "req-456"}}]
                    (snowplow-test/pop-event-data-and-user-id!))))
          (testing "no Prometheus metrics incremented"
            (is (= 0.0 (mt/metric-value system :metabase-metabot/llm-input-tokens
                                        {:model "openai/gpt-4" :source "none" :provider "openai"})))))))))

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
