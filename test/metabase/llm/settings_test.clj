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

;;; ------------------------------------------- llm-bedrock-configured? Tests -------------------------------------------

(deftest llm-bedrock-configured?-test
  (testing "returns false when neither credential is set"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id nil
                                       llm-bedrock-secret-access-key nil]
      (is (false? (llm.settings/llm-bedrock-configured?)))))
  (testing "returns false when only the access key id is set"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id "AKIAIOSFODNN7EXAMPLE"
                                       llm-bedrock-secret-access-key nil]
      (is (false? (llm.settings/llm-bedrock-configured?)))))
  (testing "returns false when only the secret access key is set"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id nil
                                       llm-bedrock-secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"]
      (is (false? (llm.settings/llm-bedrock-configured?)))))
  (testing "returns false when a credential is blank rather than absent"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id "   "
                                       llm-bedrock-secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"]
      (is (false? (llm.settings/llm-bedrock-configured?)))))
  (testing "returns true when both credentials are set"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id "AKIAIOSFODNN7EXAMPLE"
                                       llm-bedrock-secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"]
      (is (true? (llm.settings/llm-bedrock-configured?))))))

;;; ------------------------------------------- llm-bedrock credential Setter Tests -------------------------------------------

(deftest llm-bedrock-access-key-id-setter-accepts-valid-key-test
  (testing "accepts a valid access key ID and trims whitespace"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-access-key-id nil]
      (mt/discard-setting-changes [llm-bedrock-access-key-id]
        (llm.settings/llm-bedrock-access-key-id! "  AKIAIOSFODNN7EXAMPLE  ")
        (is (= "AKIAIOSFODNN7EXAMPLE" (llm.settings/llm-bedrock-access-key-id)))))))

(deftest llm-bedrock-access-key-id-setter-clears-on-empty-test
  (testing "empty/nil clears the setting"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-access-key-id nil]
      (mt/discard-setting-changes [llm-bedrock-access-key-id]
        (llm.settings/llm-bedrock-access-key-id! "AKIAIOSFODNN7EXAMPLE")
        (llm.settings/llm-bedrock-access-key-id! "")
        (is (nil? (llm.settings/llm-bedrock-access-key-id)))))))

(deftest llm-bedrock-secret-access-key-setter-accepts-valid-key-test
  (testing "accepts a secret access key and trims surrounding whitespace"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-secret-access-key nil]
      (mt/discard-setting-changes [llm-bedrock-secret-access-key]
        (llm.settings/llm-bedrock-secret-access-key! "  wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY  ")
        (is (= "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" (llm.settings/llm-bedrock-secret-access-key)))))))

(deftest llm-bedrock-secret-access-key-setter-clears-on-blank-test
  (testing "a whitespace-only value clears the setting"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-secret-access-key nil]
      (mt/discard-setting-changes [llm-bedrock-secret-access-key]
        (llm.settings/llm-bedrock-secret-access-key! "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY")
        (llm.settings/llm-bedrock-secret-access-key! "   ")
        (is (nil? (llm.settings/llm-bedrock-secret-access-key)))))))

(deftest llm-bedrock-session-token-setter-accepts-valid-token-test
  (testing "accepts a session token and trims surrounding whitespace"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-session-token nil]
      (mt/discard-setting-changes [llm-bedrock-session-token]
        (llm.settings/llm-bedrock-session-token! "  AQoEXAMPLEH4aoAH0gNCAPyJxz4BlCFFxWNE1OPTgk5TthT+FvwqnKwRcOIfrRh3c/LTo6UDdyJwOOvEVPvLXCrrrUtdnniCEXAMPLE=  ")
        (is (= "AQoEXAMPLEH4aoAH0gNCAPyJxz4BlCFFxWNE1OPTgk5TthT+FvwqnKwRcOIfrRh3c/LTo6UDdyJwOOvEVPvLXCrrrUtdnniCEXAMPLE="
               (llm.settings/llm-bedrock-session-token)))))))

;;; ------------------------------------------- llm-bedrock-region Setter Tests -------------------------------------------

(deftest llm-bedrock-region-setter-accepts-known-region-test
  (testing "accepts a known AWS region and trims whitespace"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-region nil]
      (mt/discard-setting-changes [llm-bedrock-region]
        (llm.settings/llm-bedrock-region! "  us-west-2  ")
        (is (= "us-west-2" (llm.settings/llm-bedrock-region)))))))

(deftest llm-bedrock-region-setter-rejects-unknown-region-test
  (testing "rejects a region not in the AWS SDK's known set"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid AWS region \"evil\.example/\?x=\""
         (llm.settings/llm-bedrock-region! "evil.example/?x=")))))

(deftest llm-bedrock-region-setter-clears-on-empty-test
  (testing "empty/nil clears the setting, falling back to the default"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-region nil]
      (mt/discard-setting-changes [llm-bedrock-region]
        (llm.settings/llm-bedrock-region! "us-west-2")
        (llm.settings/llm-bedrock-region! "")
        (is (= "us-east-1" (llm.settings/llm-bedrock-region)))))))

;;; ------------------------------------------- llm-azure setting Setter Tests -------------------------------------------

(deftest llm-azure-api-key-setter-test
  (testing "accepts an unprefixed Azure data-plane key and trims whitespace"
    (mt/with-temp-env-var-value! [mb-llm-azure-api-key nil]
      (mt/discard-setting-changes [llm-azure-api-key]
        (llm.settings/llm-azure-api-key! "  2QyICJz8sExampleDataPlaneKey  ")
        (is (= "2QyICJz8sExampleDataPlaneKey" (llm.settings/llm-azure-api-key))))))
  (testing "empty/nil clears the setting"
    (mt/with-temp-env-var-value! [mb-llm-azure-api-key nil]
      (mt/discard-setting-changes [llm-azure-api-key]
        (llm.settings/llm-azure-api-key! "2QyICJz8sExampleDataPlaneKey")
        (llm.settings/llm-azure-api-key! "")
        (is (nil? (llm.settings/llm-azure-api-key)))))))

(deftest llm-azure-api-base-url-setter-test
  (testing "trims whitespace and trailing slashes"
    (mt/with-temp-env-var-value! [mb-llm-azure-api-base-url nil]
      (mt/discard-setting-changes [llm-azure-api-base-url]
        (llm.settings/llm-azure-api-base-url! "  https://my-resource.services.ai.azure.com/openai///  ")
        (is (= "https://my-resource.services.ai.azure.com/openai"
               (llm.settings/llm-azure-api-base-url))))))
  (testing "is otherwise persisted exactly as entered, with no silent rewriting"
    (mt/with-temp-env-var-value! [mb-llm-azure-api-base-url nil]
      (mt/discard-setting-changes [llm-azure-api-base-url]
        (llm.settings/llm-azure-api-base-url! "https://my-resource.services.ai.azure.com/api/projects/my-project")
        (is (= "https://my-resource.services.ai.azure.com/api/projects/my-project"
               (llm.settings/llm-azure-api-base-url))))))
  (testing "blank clears the setting"
    (mt/with-temp-env-var-value! [mb-llm-azure-api-base-url nil]
      (mt/discard-setting-changes [llm-azure-api-base-url]
        (llm.settings/llm-azure-api-base-url! "https://my-resource.services.ai.azure.com/openai")
        (llm.settings/llm-azure-api-base-url! "   ")
        (is (nil? (llm.settings/llm-azure-api-base-url)))))))

(deftest ^:parallel normalize-llm-base-url-test
  (is (= "https://x.example/openai" (llm.settings/normalize-llm-base-url "  https://x.example/openai/  ")))
  (is (= "https://x.example" (llm.settings/normalize-llm-base-url "https://x.example///")))
  (is (nil? (llm.settings/normalize-llm-base-url "   ")))
  (is (nil? (llm.settings/normalize-llm-base-url nil)))
  (is (nil? (llm.settings/normalize-llm-base-url "///"))))

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
