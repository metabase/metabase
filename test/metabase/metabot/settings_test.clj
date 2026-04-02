(ns metabase.metabot.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]))

(deftest internal-tasks-disabled-by-default-test
  (testing "returns false when the setting is not explicitly enabled"
    (mt/with-temporary-setting-values [llm-metabot-internal-tasks-enabled? nil
                                       llm-anthropic-api-key               "sk-ant-test"]
      (is (false? (metabot.settings/llm-metabot-internal-tasks-enabled?))))))

(deftest internal-tasks-requires-lite-api-key-test
  (testing "returns false when enabled but lite provider has no api key"
    (mt/with-temporary-setting-values [llm-metabot-internal-tasks-enabled? true
                                       llm-metabot-provider-lite           "anthropic/claude-haiku-4-5"
                                       llm-anthropic-api-key               nil]
      (is (false? (metabot.settings/llm-metabot-internal-tasks-enabled?))))))

(deftest internal-tasks-enabled-with-anthropic-test
  (testing "returns true when enabled and anthropic lite provider api key is configured"
    (mt/with-temporary-setting-values [llm-metabot-internal-tasks-enabled? true
                                       llm-metabot-provider-lite           "anthropic/claude-haiku-4-5"
                                       llm-anthropic-api-key               "sk-ant-test"]
      (is (true? (metabot.settings/llm-metabot-internal-tasks-enabled?))))))

(deftest internal-tasks-enabled-with-openai-test
  (testing "works with openai lite provider"
    (mt/with-temporary-setting-values [llm-metabot-internal-tasks-enabled? true
                                       llm-metabot-provider-lite           "openai/gpt-4.1-mini"
                                       llm-openai-api-key                  "sk-openai-test"]
      (is (true? (metabot.settings/llm-metabot-internal-tasks-enabled?))))))
