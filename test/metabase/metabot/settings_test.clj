(ns metabase.metabot.settings-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest customization-settings-require-ai-controls-test
  (testing "without :ai-controls feature, customization settings return defaults and reject writes"
    (mt/with-premium-features #{}
      (testing "branding settings return defaults"
        (is (= "Metabot" (metabot.settings/metabot-name)))
        (is (= "metabot" (metabot.settings/metabot-icon)))
        (is (true? (metabot.settings/metabot-show-illustrations))))
      (testing "system prompt settings return defaults"
        (is (= "" (metabot.settings/metabot-chat-system-prompt)))
        (is (= "" (metabot.settings/metabot-nlq-system-prompt)))
        (is (= "" (metabot.settings/metabot-sql-system-prompt))))
      (testing "branding settings reject writes"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting metabot-name is not enabled because feature :ai-controls is not available"
             (metabot.settings/metabot-name! "Custom Bot")))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting metabot-icon is not enabled because feature :ai-controls is not available"
             (metabot.settings/metabot-icon! "custom-icon")))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting metabot-show-illustrations is not enabled because feature :ai-controls is not available"
             (metabot.settings/metabot-show-illustrations! false))))
      (testing "system prompt settings reject writes"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting metabot-chat-system-prompt is not enabled because feature :ai-controls is not available"
             (metabot.settings/metabot-chat-system-prompt! "custom prompt")))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting metabot-nlq-system-prompt is not enabled because feature :ai-controls is not available"
             (metabot.settings/metabot-nlq-system-prompt! "custom prompt")))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting metabot-sql-system-prompt is not enabled because feature :ai-controls is not available"
             (metabot.settings/metabot-sql-system-prompt! "custom prompt")))))))

(deftest customization-settings-writable-with-ai-controls-test
  (mt/with-premium-features #{:ai-controls}
    (testing "branding settings are writable with :ai-controls"
      (mt/discard-setting-changes [metabot-name]
        (metabot.settings/metabot-name! "Custom Bot")
        (is (= "Custom Bot" (metabot.settings/metabot-name))))
      (mt/discard-setting-changes [metabot-icon]
        (metabot.settings/metabot-icon! "custom-icon")
        (is (= "custom-icon" (metabot.settings/metabot-icon))))
      (mt/discard-setting-changes [metabot-show-illustrations]
        (metabot.settings/metabot-show-illustrations! false)
        (is (= false (metabot.settings/metabot-show-illustrations)))))
    (testing "system prompt settings are writable with :ai-controls"
      (mt/discard-setting-changes [metabot-chat-system-prompt]
        (metabot.settings/metabot-chat-system-prompt! "Always respond in French.")
        (is (= "Always respond in French." (metabot.settings/metabot-chat-system-prompt))))
      (mt/discard-setting-changes [metabot-nlq-system-prompt]
        (metabot.settings/metabot-nlq-system-prompt! "Be concise.")
        (is (= "Be concise." (metabot.settings/metabot-nlq-system-prompt))))
      (mt/discard-setting-changes [metabot-sql-system-prompt]
        (metabot.settings/metabot-sql-system-prompt! "Use CTEs.")
        (is (= "Use CTEs." (metabot.settings/metabot-sql-system-prompt)))))))

(deftest ^:parallel operational-settings-not-gated-test
  (testing "core operational settings remain functional without :ai-controls"
    (mt/with-premium-features #{}
      (is (boolean? (metabot.settings/metabot-enabled?)))
      (is (boolean? (metabot.settings/embedded-metabot-enabled?)))
      (is (string? (metabot.settings/llm-metabot-provider)))
      (is (string? (metabot.settings/llm-metabot-provider-lite))))))

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
