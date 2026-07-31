(ns metabase.llm.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private per-provider-credential-settings
  "The settings [[metabase.llm.provider]] reads a connection out of when they are set by an environment variable."
  [:llm-anthropic-api-key :llm-anthropic-api-base-url
   :llm-openai-api-key :llm-openai-api-base-url
   :llm-openrouter-api-key :llm-openrouter-api-base-url
   :llm-mistral-api-key :llm-mistral-api-base-url
   :llm-zai-api-key :llm-zai-api-base-url
   :llm-azure-api-key :llm-azure-api-base-url
   :llm-bedrock-access-key-id :llm-bedrock-secret-access-key
   :llm-bedrock-session-token :llm-bedrock-region])

(deftest per-provider-credential-settings-are-read-only-test
  (testing (str "These configure a connection only from an environment variable, which is resolved on every read. A "
                "write lands in the app DB where nothing reads it, so it is rejected rather than silently accepted — "
                "connections are managed through the /api/llm/providers endpoints.")
    (doseq [setting-k per-provider-credential-settings]
      (testing setting-k
        (is (thrown-with-msg?
             UnsupportedOperationException
             #"read-only setting"
             (setting/set! setting-k "whatever")))))))

;;; ------------------------------------------- llm-anthropic-api-key Tests -------------------------------------------

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

;;; ------------------------------------------- assert-llm-host-allowed! Tests -------------------------------------------

(deftest assert-llm-host-allowed!-test
  (testing "is a no-op outside of e2e mode, even for a real provider URL"
    (with-redefs [config/is-e2e? false]
      (is (nil? (llm.settings/assert-llm-host-allowed! "https://api.anthropic.com")))))
  (testing "in e2e mode"
    (with-redefs [config/is-e2e? true]
      (testing "allows localhost / loopback URLs (the e2e mock LLM server)"
        (is (nil? (llm.settings/assert-llm-host-allowed! "http://localhost:6123")))
        (is (nil? (llm.settings/assert-llm-host-allowed! "http://127.0.0.1:6123")))
        (is (nil? (llm.settings/assert-llm-host-allowed! "http://LOCALHOST:6123/v1/messages"))))
      (testing "allows IPv6 loopback URLs"
        ;; `java.net.URL.getHost` returns IPv6 hosts wrapped in brackets, so the
        ;; whitelist's `[::1]` entry is the one a URL can actually hit; the bare
        ;; `::1` entry is belt-and-braces for hosts arriving without brackets.
        (is (nil? (llm.settings/assert-llm-host-allowed! "http://[::1]:6123")))
        (is (nil? (llm.settings/assert-llm-host-allowed! "http://[::1]:6123/v1/messages")))
        (is (contains? @#'llm.settings/loopback-hosts "::1")
            "the bracket-less IPv6 loopback form stays whitelisted"))
      (testing "throws for any non-localhost URL so we never hit a real provider"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"non-localhost"
             (llm.settings/assert-llm-host-allowed! "https://api.anthropic.com")))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"non-localhost"
             (llm.settings/assert-llm-host-allowed! "http://host.docker.internal:6123"))))
      (testing "fails closed with the friendly message for malformed URLs instead of throwing raw"
        (doseq [url ["not-a-url" "example.com/v1"]]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Refusing to send an LLM request"
               (llm.settings/assert-llm-host-allowed! url))
              url)
          (is (= {:status-code 400 :llm-url url}
                 (try (llm.settings/assert-llm-host-allowed! url)
                      (catch clojure.lang.ExceptionInfo e (ex-data e)))))))
      (testing "is a no-op for blank / nil URLs (lets normal not-configured handling run)"
        (is (nil? (llm.settings/assert-llm-host-allowed! nil)))
        (is (nil? (llm.settings/assert-llm-host-allowed! "")))))))

;;; ------------------------------------------- Settings Defaults Tests -------------------------------------------

(deftest llm-max-tokens-test
  (testing "default value is 4096"
    (mt/with-temporary-setting-values [llm-max-tokens nil]
      (is (= 4096 (llm.settings/llm-max-tokens)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-max-tokens 8192]
      (is (= 8192 (llm.settings/llm-max-tokens))))))

(deftest llm-request-timeout-ms-test
  (testing "default value is 120000 (120 seconds)"
    (mt/with-temporary-setting-values [llm-request-timeout-ms nil]
      (is (= 120000 (llm.settings/llm-request-timeout-ms)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-request-timeout-ms 30000]
      (is (= 30000 (llm.settings/llm-request-timeout-ms))))))

(deftest llm-connection-timeout-ms-test
  (testing "default value is 10000 (10 seconds)"
    (mt/with-temporary-setting-values [llm-connection-timeout-ms nil]
      (is (= 10000 (llm.settings/llm-connection-timeout-ms)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-connection-timeout-ms 3000]
      (is (= 3000 (llm.settings/llm-connection-timeout-ms))))))

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
