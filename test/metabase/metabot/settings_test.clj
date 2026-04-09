(ns metabase.metabot.settings-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]))

(deftest metabot-configured-with-metabase-provider-and-proxy-url-test
  (testing "returns true when metabase-proxied provider and proxy URL is set"
    (mt/with-premium-features #{:metabase-ai-provider}
      (mt/with-temporary-setting-values [llm-metabot-provider "metabase/anthropic/claude-sonnet-4"
                                         llm-proxy-base-url   "https://proxy.example.com"]
        (is (true? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-with-metabase-provider-no-proxy-url-test
  (testing "returns false when metabase-proxied provider and no proxy URL"
    (mt/with-premium-features #{:metabase-ai-provider}
      (mt/with-temporary-setting-values [llm-metabot-provider "metabase/anthropic/claude-sonnet-4"
                                         llm-proxy-base-url   nil]
        (is (false? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-with-direct-provider-and-api-key-test
  (testing "returns true when direct provider has API key set"
    (mt/with-temporary-setting-values [llm-metabot-provider  "anthropic/claude-sonnet-4"
                                       llm-anthropic-api-key "sk-ant-test"]
      (is (true? (metabot.settings/llm-metabot-configured?))))))

(deftest metabot-configured-with-direct-provider-no-api-key-test
  (testing "returns false when direct provider has no API key"
    (with-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
      (mt/with-temporary-setting-values [llm-metabot-provider "anthropic/claude-sonnet-4"]
        (is (false? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-proxy-url-not-fallback-for-direct-provider-test
  (testing "proxy URL alone does not make a direct provider configured"
    (mt/with-premium-features #{:metabase-ai-provider}
      (with-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
        (mt/with-temporary-setting-values [llm-metabot-provider "anthropic/claude-sonnet-4"
                                           llm-proxy-base-url   "https://proxy.example.com"]
          (is (false? (metabot.settings/llm-metabot-configured?))))))))

;;; ------------------------------------------- validate-metabot-provider! Tests -------------------------------------------
;; The validator is private; exercise it through the setting setter.

(deftest validate-metabot-provider-rejects-non-string-test
  (testing "rejects non-string input"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"must be a string"
         (metabot.settings/llm-metabot-provider! 42)))))

(deftest validate-metabot-provider-rejects-unknown-provider-test
  (testing "rejects unknown top-level provider"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Unknown provider"
         (metabot.settings/llm-metabot-provider! "foobar/some-model")))))

(deftest validate-metabot-provider-rejects-blank-model-test
  (testing "rejects provider-only string with no model"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Model name is required"
         (metabot.settings/llm-metabot-provider! "anthropic/")))))

(deftest validate-metabot-provider-rejects-unknown-inner-provider-test
  (testing "rejects unknown inner provider under metabase/ prefix"
    (mt/with-premium-features #{:metabase-ai-provider}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Unknown inner provider"
           (metabot.settings/llm-metabot-provider! "metabase/foobar/some-model"))))))

(deftest validate-metabot-provider-rejects-metabase-prefix-without-model-test
  (testing "rejects metabase/provider with no model"
    (mt/with-premium-features #{:metabase-ai-provider}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Model name is required"
           (metabot.settings/llm-metabot-provider! "metabase/anthropic/"))))))

(deftest validate-metabot-provider-accepts-valid-direct-providers-test
  (testing "accepts valid direct provider strings"
    (mt/with-temporary-setting-values [llm-metabot-provider "anthropic/claude-sonnet-4"]
      (is (= "anthropic/claude-sonnet-4" (metabot.settings/llm-metabot-provider))))
    (mt/with-temporary-setting-values [llm-metabot-provider "openai/gpt-4.1-mini"]
      (is (= "openai/gpt-4.1-mini" (metabot.settings/llm-metabot-provider))))
    (mt/with-temporary-setting-values [llm-metabot-provider "openrouter/anthropic/claude-haiku-4-5"]
      (is (= "openrouter/anthropic/claude-haiku-4-5" (metabot.settings/llm-metabot-provider))))))

(deftest validate-metabot-provider-accepts-valid-metabase-prefixed-test
  (testing "accepts valid metabase/ prefixed provider strings"
    (mt/with-premium-features #{:metabase-ai-provider}
      (mt/with-temporary-setting-values [llm-metabot-provider "metabase/anthropic/claude-sonnet-4"]
        (is (= "metabase/anthropic/claude-sonnet-4" (metabot.settings/llm-metabot-provider))))
      (mt/with-temporary-setting-values [llm-metabot-provider "metabase/openrouter/anthropic/claude-haiku-4-5"]
        (is (= "metabase/openrouter/anthropic/claude-haiku-4-5" (metabot.settings/llm-metabot-provider)))))))

;;; ------------------------------------------- Internal Tasks Tests -------------------------------------------

(deftest internal-tasks-disabled-by-default-test
  (testing "returns false when the setting is not explicitly enabled"
    (mt/with-temporary-setting-values [llm-metabot-internal-tasks-enabled? nil
                                       llm-anthropic-api-key               "sk-ant-test"]
      (is (false? (metabot.settings/llm-metabot-internal-tasks-enabled?))))))

(deftest internal-tasks-requires-lite-api-key-test
  (testing "returns false when enabled but lite provider has no api key"
    (with-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
      (mt/with-temporary-setting-values [llm-metabot-internal-tasks-enabled? true
                                         llm-metabot-provider-lite           "anthropic/claude-haiku-4-5"]
        (is (false? (metabot.settings/llm-metabot-internal-tasks-enabled?)))))))

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
