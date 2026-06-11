(ns metabase.llm.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- llm-anthropic-api-key Setter Tests -------------------------------------------

(deftest llm-anthropic-api-key-setter-test
  (testing "accepts valid sk-ant- key and trims whitespace"
    (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key nil]
      (mt/discard-setting-changes [llm-anthropic-api-key]
        (llm.settings/llm-anthropic-api-key! "  sk-ant-abc123  ")
        (is (= "sk-ant-abc123" (llm.settings/llm-anthropic-api-key))))))
  (testing "rejects keys without sk-ant- prefix"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid Anthropic API key format"
         (llm.settings/llm-anthropic-api-key! "invalid-key"))))
  (testing "empty/nil clears the setting"
    (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key nil]
      (mt/discard-setting-changes [llm-anthropic-api-key]
        (llm.settings/llm-anthropic-api-key! "sk-ant-abc123")
        (llm.settings/llm-anthropic-api-key! "")
        (is (nil? (llm.settings/llm-anthropic-api-key)))))))

;;; ------------------------------------------- llm-anthropic-api-key-configured? Tests -------------------------------------------

(deftest llm-anthropic-api-key-configured?-test
  (testing "returns false when no API key is set"
    (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
      (is (false? (llm.settings/llm-anthropic-api-key-configured?)))))
  (testing "returns true when API key is set"
    (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-test"]
      (is (true? (llm.settings/llm-anthropic-api-key-configured?))))))

;;; ------------------------------------------- Base URL Normalization Tests -------------------------------------------

(deftest ^:parallel normalize-llm-base-url-test
  (testing "URLs pass through with whitespace and trailing slashes trimmed"
    (is (= "https://api.openai.com"
           (llm.settings/normalize-llm-base-url "  https://api.openai.com/  ")))
    (is (= "https://my-gateway.internal/llm"
           (llm.settings/normalize-llm-base-url "https://my-gateway.internal/llm")))
    (is (= "https://res.services.ai.azure.com/api/projects/my-project"
           (llm.settings/normalize-llm-base-url "https://res.services.ai.azure.com/api/projects/my-project"))
        "Azure URLs are persisted exactly as entered, not rewritten"))
  (testing "blank input normalizes to nil (clears the setting)"
    (is (nil? (llm.settings/normalize-llm-base-url "   ")))
    (is (nil? (llm.settings/normalize-llm-base-url nil)))))

(deftest llm-base-url-setter-test
  (mt/with-temp-env-var-value! [mb-llm-openai-api-base-url nil]
    (mt/discard-setting-changes [llm-openai-api-base-url]
      (llm.settings/llm-openai-api-base-url! "https://res.openai.azure.com/openai/v1/")
      (is (= "https://res.openai.azure.com/openai/v1"
             (llm.settings/llm-openai-api-base-url))
          "trailing slashes are trimmed; the path is otherwise saved verbatim")))
  (mt/with-temp-env-var-value! [mb-llm-anthropic-api-base-url nil]
    (mt/discard-setting-changes [llm-anthropic-api-base-url]
      (llm.settings/llm-anthropic-api-base-url! "https://res.services.ai.azure.com/anthropic")
      (is (= "https://res.services.ai.azure.com/anthropic"
             (llm.settings/llm-anthropic-api-base-url))))))

;;; ------------------------------------------- llm-openai-api-key Setter Tests -------------------------------------------

(deftest llm-openai-api-key-prefix-validation-test
  (testing "rejects non-sk- keys when using the default base URL"
    (mt/with-temp-env-var-value! [mb-llm-openai-api-key      nil
                                  mb-llm-openai-api-base-url nil]
      (mt/discard-setting-changes [llm-openai-api-key llm-openai-api-base-url]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid OpenAI API key format"
             (llm.settings/llm-openai-api-key! "azure-key"))))))
  (testing "accepts non-prefixed keys when a custom base URL is configured"
    (mt/with-temp-env-var-value! [mb-llm-openai-api-key      nil
                                  mb-llm-openai-api-base-url nil]
      (mt/discard-setting-changes [llm-openai-api-key llm-openai-api-base-url]
        (llm.settings/llm-openai-api-base-url! "https://res.services.ai.azure.com")
        (llm.settings/llm-openai-api-key! "azure-key")
        (is (= "azure-key" (llm.settings/llm-openai-api-key))))))
  (testing "accepts non-prefixed keys when the base URL is overridden via env var"
    (mt/with-temp-env-var-value! [mb-llm-openai-api-key      nil
                                  mb-llm-openai-api-base-url "https://res.services.ai.azure.com/openai"]
      (mt/discard-setting-changes [llm-openai-api-key]
        (llm.settings/llm-openai-api-key! "azure-key")
        (is (= "azure-key" (llm.settings/llm-openai-api-key)))))))

;;; ------------------------------------------- llm-proxy-base-url Feature Guard Tests -------------------------------------------

(deftest llm-proxy-base-url-feature-guard-test
  (testing "can be set and read when :metabase-ai-managed feature is enabled"
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-temporary-setting-values [llm-proxy-base-url "https://proxy.example"]
        (is (= "https://proxy.example" (llm.settings/llm-proxy-base-url)))
        (testing "returns default (nil) when :metabase-ai-managed feature is not enabled, even if a value is set"
          (mt/with-premium-features #{}
            (is (nil? (llm.settings/llm-proxy-base-url))))))))
  (testing "can be set and read when :metabot-v3 feature is enabled"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [llm-proxy-base-url "https://proxy.example"]
        (is (= "https://proxy.example" (llm.settings/llm-proxy-base-url)))
        (testing "returns default (nil) when neither managed-ai feature is enabled, even if a value is set"
          (mt/with-premium-features #{}
            (is (nil? (llm.settings/llm-proxy-base-url))))))))
  (testing "cannot be set when neither managed-ai feature is enabled"
    (mt/with-premium-features #{}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting llm-proxy-base-url is not enabled"
           (llm.settings/llm-proxy-base-url! "https://proxy.example"))))))

(deftest ai-service-base-url-feature-guard-test
  (testing "can be set and read when :metabase-ai-managed feature is enabled"
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-temporary-setting-values [ai-service-base-url "https://ai-service.example"]
        (is (= "https://ai-service.example" (llm.settings/ai-service-base-url)))
        (testing "returns default (nil) when :metabase-ai-managed feature is not enabled, even if a value is set"
          (mt/with-premium-features #{}
            (is (nil? (llm.settings/ai-service-base-url))))))))
  (testing "can be set and read when :metabot-v3 feature is enabled"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [ai-service-base-url "https://ai-service.example"]
        (is (= "https://ai-service.example" (llm.settings/ai-service-base-url)))
        (testing "returns default (nil) when neither managed-ai feature is enabled, even if a value is set"
          (mt/with-premium-features #{}
            (is (nil? (llm.settings/ai-service-base-url))))))))
  (testing "cannot be set when neither managed-ai feature is enabled"
    (mt/with-premium-features #{}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting ai-service-base-url is not enabled"
           (llm.settings/ai-service-base-url! "https://ai-service.example"))))))

;;; ------------------------------------------- Settings Defaults Tests -------------------------------------------

(deftest llm-max-tokens-test
  (testing "default value is 4096"
    (mt/with-temporary-setting-values [llm-max-tokens nil]
      (is (= 4096 (llm.settings/llm-max-tokens)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-max-tokens 8192]
      (is (= 8192 (llm.settings/llm-max-tokens))))))

(deftest llm-request-timeout-ms-test
  (testing "default value is 60000 (60 seconds)"
    (mt/with-temporary-setting-values [llm-request-timeout-ms nil]
      (is (= 60000 (llm.settings/llm-request-timeout-ms)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-request-timeout-ms 120000]
      (is (= 120000 (llm.settings/llm-request-timeout-ms))))))

(deftest llm-connection-timeout-ms-test
  (testing "default value is 5000 (5 seconds)"
    (mt/with-temporary-setting-values [llm-connection-timeout-ms nil]
      (is (= 5000 (llm.settings/llm-connection-timeout-ms)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-connection-timeout-ms 10000]
      (is (= 10000 (llm.settings/llm-connection-timeout-ms))))))

(deftest llm-rate-limit-per-user-test
  (testing "default value is 20 requests per minute"
    (mt/with-temporary-setting-values [llm-rate-limit-per-user nil]
      (is (= 20 (llm.settings/llm-rate-limit-per-user)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-rate-limit-per-user 50]
      (is (= 50 (llm.settings/llm-rate-limit-per-user))))))

(deftest llm-rate-limit-per-ip-test
  (testing "default value is 100 requests per minute"
    (mt/with-temporary-setting-values [llm-rate-limit-per-ip nil]
      (is (= 100 (llm.settings/llm-rate-limit-per-ip)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-rate-limit-per-ip 200]
      (is (= 200 (llm.settings/llm-rate-limit-per-ip))))))
