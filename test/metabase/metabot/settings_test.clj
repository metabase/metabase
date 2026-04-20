(ns metabase.metabot.settings-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]))

(deftest metabot-configured-with-metabase-provider-and-proxy-url-test
  (testing "returns true when metabase-proxied provider and proxy URL is set"
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-temporary-setting-values [llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"
                                         llm-proxy-base-url   "https://proxy.example.com"]
        (is (true? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-with-metabase-provider-no-proxy-url-test
  (testing "returns false when metabase-proxied provider and no proxy URL"
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-temporary-setting-values [llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"
                                         llm-proxy-base-url   nil]
        (is (false? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-with-direct-provider-and-api-key-test
  (testing "returns true when direct provider has API key set"
    (mt/with-temporary-setting-values [llm-metabot-provider  "anthropic/claude-sonnet-4-6"
                                       llm-anthropic-api-key "sk-ant-test"]
      (is (true? (metabot.settings/llm-metabot-configured?))))))

(deftest metabot-configured-with-direct-provider-no-api-key-test
  (testing "returns false when direct provider has no API key"
    (with-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
      (mt/with-temporary-setting-values [llm-metabot-provider "anthropic/claude-sonnet-4-6"]
        (is (false? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-proxy-url-not-fallback-for-direct-provider-test
  (testing "proxy URL alone does not make a direct provider configured"
    (mt/with-premium-features #{:metabase-ai-managed}
      (with-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
        (mt/with-temporary-setting-values [llm-metabot-provider "anthropic/claude-sonnet-4-6"
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

(deftest validate-metabot-provider-rejects-unknown-metabase-managed-provider-test
  (testing "rejects unknown inner provider under metabase/ prefix"
    (mt/with-premium-features #{:metabase-ai-managed}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Unsupported provider \"foobar\" for metabase managed AI"
           (metabot.settings/llm-metabot-provider! "metabase/foobar/some-model"))))))

(deftest validate-metabot-provider-rejects-direct-only-provider-as-managed-openai-test
  (testing "rejects openai under metabase/ prefix (not in the managed allow-list)"
    (mt/with-premium-features #{:metabase-ai-managed}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Unsupported provider \"openai\" for metabase managed AI"
           (metabot.settings/llm-metabot-provider! "metabase/openai/gpt-4.1-mini"))))))

(deftest validate-metabot-provider-rejects-direct-only-provider-as-managed-openrouter-test
  (testing "rejects openrouter under metabase/ prefix (not in the managed allow-list)"
    (mt/with-premium-features #{:metabase-ai-managed}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Unsupported provider \"openrouter\" for metabase managed AI"
           (metabot.settings/llm-metabot-provider! "metabase/openrouter/anthropic/claude-haiku-4-5"))))))

(deftest validate-metabot-provider-rejects-unsupported-metabase-managed-model-test
  (testing "rejects unsupported model for an allowed metabase managed provider"
    (mt/with-premium-features #{:metabase-ai-managed}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Unsupported model \"claude-haiku-4-5\" for metabase managed provider \"anthropic\""
           (metabot.settings/llm-metabot-provider! "metabase/anthropic/claude-haiku-4-5"))))))

(deftest validate-metabot-provider-rejects-metabase-prefix-without-model-test
  (testing "rejects metabase/provider with no model"
    (mt/with-premium-features #{:metabase-ai-managed}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Model name is required"
           (metabot.settings/llm-metabot-provider! "metabase/anthropic/"))))))

(deftest validate-metabot-provider-accepts-valid-direct-anthropic-test
  (testing "accepts valid direct anthropic provider string"
    (mt/with-temporary-setting-values [llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (is (= "anthropic/claude-sonnet-4-6" (metabot.settings/llm-metabot-provider))))))

(deftest validate-metabot-provider-accepts-valid-direct-openai-test
  (testing "accepts valid direct openai provider string"
    (mt/with-temporary-setting-values [llm-metabot-provider "openai/gpt-4.1-mini"]
      (is (= "openai/gpt-4.1-mini" (metabot.settings/llm-metabot-provider))))))

(deftest validate-metabot-provider-accepts-valid-direct-openrouter-test
  (testing "accepts valid direct openrouter provider string"
    (mt/with-temporary-setting-values [llm-metabot-provider "openrouter/anthropic/claude-haiku-4-5"]
      (is (= "openrouter/anthropic/claude-haiku-4-5" (metabot.settings/llm-metabot-provider))))))

(deftest validate-metabot-provider-accepts-allowed-metabase-managed-provider-and-model-test
  (testing "accepts allow-listed metabase managed provider/model"
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-temporary-setting-values [llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"]
        (is (= "metabase/anthropic/claude-sonnet-4-6" (metabot.settings/llm-metabot-provider)))))))
