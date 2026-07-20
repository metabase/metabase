(ns metabase.metabot.settings-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.settings.core :as setting]
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
      (is (string? (metabot.settings/llm-metabot-provider))))))

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
    (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
      (mt/with-temporary-setting-values [llm-metabot-provider "anthropic/claude-sonnet-4-6"]
        (is (false? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-proxy-url-not-fallback-for-direct-provider-test
  (testing "proxy URL alone does not make a direct provider configured"
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
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

;;; ------------------------------------------- ai-usage-max-retention-days Tests -------------------------------------------

(deftest ai-usage-max-retention-days-default-test
  (testing "defaults to 180 days when no env var is set"
    (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days nil]
      (is (= 180 (metabot.settings/ai-usage-max-retention-days))))))

(deftest ai-usage-max-retention-days-infinite-test
  (testing "0 is an alias for infinite retention"
    (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 0]
      (is (nil? (metabot.settings/ai-usage-max-retention-days))))))

(deftest ai-usage-max-retention-days-passthrough-test
  (testing "values at or above the minimum pass through unchanged"
    (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 100]
      (is (= 100 (metabot.settings/ai-usage-max-retention-days))))))

(deftest ai-usage-max-retention-days-clamp-test
  (testing "values below the minimum are clamped up to 30"
    (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 1]
      (is (= 30 (metabot.settings/ai-usage-max-retention-days))))))

(deftest ai-usage-max-retention-days-read-only-test
  (testing "the setting is env-var-only and cannot be set at runtime"
    (is (thrown-with-msg?
         java.lang.UnsupportedOperationException
         #"You cannot set ai-usage-max-retention-days"
         (setting/set! :ai-usage-max-retention-days 30)))))

(deftest validate-metabot-provider-accepts-valid-direct-bedrock-test
  (testing "accepts valid direct bedrock provider string"
    (mt/with-temporary-setting-values [llm-metabot-provider "bedrock/anthropic.claude-haiku-4-5"]
      (is (= "bedrock/anthropic.claude-haiku-4-5" (metabot.settings/llm-metabot-provider))))))

(deftest metabot-configured-with-bedrock-credentials-test
  (testing "returns true when bedrock has both the access key ID and secret access key set"
    (mt/with-temporary-setting-values [llm-metabot-provider           "bedrock/anthropic.claude-haiku-4-5"
                                       llm-bedrock-access-key-id      "AKIAIOSFODNN7EXAMPLE"
                                       llm-bedrock-secret-access-key  "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"]
      (is (true? (metabot.settings/llm-metabot-configured?))))))

(deftest metabot-configured-with-partial-bedrock-credentials-test
  (testing "returns false when bedrock has an access key ID but no secret access key"
    (mt/with-temporary-setting-values [llm-metabot-provider          "bedrock/anthropic.claude-haiku-4-5"
                                       llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                       llm-bedrock-secret-access-key nil]
      (is (false? (metabot.settings/llm-metabot-configured?))))))

(deftest configured-provider-credentials-bedrock-fully-configured-test
  (testing "returns the AWS credentials map when bedrock is fully configured"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                       llm-bedrock-secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
                                       llm-bedrock-session-token     nil
                                       llm-bedrock-region            "us-east-2"]
      (is (= {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
              :secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
              :session-token     nil
              :region            "us-east-2"}
             (metabot.settings/configured-provider-credentials "bedrock"))))))

(deftest configured-provider-credentials-bedrock-partial-credentials-test
  (testing "returns nil when bedrock has an access key ID but no secret access key"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                       llm-bedrock-secret-access-key nil]
      (is (nil? (metabot.settings/configured-provider-credentials "bedrock"))))))

(deftest provider-credentials-complete?-bedrock-test
  (testing "bedrock credentials are complete only with both the access key ID and secret access key"
    (is (true? (metabot.settings/provider-credentials-complete?
                "bedrock"
                {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                 :secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"})))
    (is (false? (metabot.settings/provider-credentials-complete?
                 "bedrock"
                 {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                  :secret-access-key ""})))
    (is (false? (metabot.settings/provider-credentials-complete?
                 "bedrock"
                 {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                  :secret-access-key nil})))
    (is (false? (metabot.settings/provider-credentials-complete?
                 "bedrock"
                 {:access-key-id "AKIAIOSFODNN7EXAMPLE"})))
    (is (false? (metabot.settings/provider-credentials-complete?
                 "bedrock"
                 {:secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"})))
    (is (false? (metabot.settings/provider-credentials-complete? "bedrock" nil)))))

(deftest validate-metabot-provider-accepts-valid-direct-azure-test
  (testing "accepts azure provider strings with a wire family and deployment name"
    (mt/with-temporary-setting-values [llm-metabot-provider "azure/anthropic/claude-sonnet-4-5"]
      (is (= "azure/anthropic/claude-sonnet-4-5" (metabot.settings/llm-metabot-provider))))
    (mt/with-temporary-setting-values [llm-metabot-provider "azure/openai/my-gpt-deployment"]
      (is (= "azure/openai/my-gpt-deployment" (metabot.settings/llm-metabot-provider))))))

(deftest validate-metabot-provider-rejects-invalid-azure-models-test
  (testing "rejects an unsupported wire family"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Invalid Azure model"
         (metabot.settings/llm-metabot-provider! "azure/gemini/some-deployment"))))
  (testing "rejects a missing deployment name"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Invalid Azure model"
         (metabot.settings/llm-metabot-provider! "azure/anthropic/")))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Invalid Azure model"
         (metabot.settings/llm-metabot-provider! "azure/anthropic"))))
  (testing "rejects a deployment name containing a slash (Azure deployment names cannot contain /)"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Invalid Azure model"
         (metabot.settings/llm-metabot-provider! "azure/anthropic/a/b")))))

(deftest metabot-configured-with-azure-credentials-test
  (testing "returns true when azure has both the API key and base URL set"
    (mt/with-temporary-setting-values [llm-metabot-provider  "azure/anthropic/claude-sonnet-4-5"
                                       llm-azure-api-key     "azure-key"
                                       llm-azure-api-base-url "https://my-resource.services.ai.azure.com/anthropic"]
      (is (true? (metabot.settings/llm-metabot-configured?))))))

(deftest metabot-configured-with-partial-azure-credentials-test
  (testing "returns false when azure has an API key but no base URL"
    (mt/with-temporary-setting-values [llm-metabot-provider   "azure/anthropic/claude-sonnet-4-5"
                                       llm-azure-api-key      "azure-key"
                                       llm-azure-api-base-url nil]
      (is (false? (metabot.settings/llm-metabot-configured?))))))

(deftest configured-provider-credentials-azure-fully-configured-test
  (testing "returns the api-key/base-url credentials map when azure is fully configured"
    (mt/with-temporary-setting-values [llm-azure-api-key      "azure-key"
                                       llm-azure-api-base-url "https://my-resource.services.ai.azure.com/openai"]
      (is (= {:api-key  "azure-key"
              :base-url "https://my-resource.services.ai.azure.com/openai"}
             (metabot.settings/configured-provider-credentials "azure"))))))

(deftest configured-provider-credentials-azure-partial-credentials-test
  (testing "returns nil when azure has a base URL but no API key"
    (mt/with-temporary-setting-values [llm-azure-api-key      nil
                                       llm-azure-api-base-url "https://my-resource.services.ai.azure.com/openai"]
      (is (nil? (metabot.settings/configured-provider-credentials "azure"))))))

(deftest provider-credentials-complete?-azure-test
  (testing "azure credentials are complete only with both a non-blank API key and base URL"
    (is (true? (metabot.settings/provider-credentials-complete?
                "azure"
                {:api-key "azure-key" :base-url "https://my-resource.services.ai.azure.com/openai"})))
    (is (false? (metabot.settings/provider-credentials-complete? "azure" {:api-key "azure-key"})))
    (is (false? (metabot.settings/provider-credentials-complete? "azure" {:api-key "azure-key" :base-url "  "})))
    (is (false? (metabot.settings/provider-credentials-complete?
                 "azure"
                 {:base-url "https://my-resource.services.ai.azure.com/openai"})))
    (is (false? (metabot.settings/provider-credentials-complete? "azure" nil)))))

(deftest provider-credentials-complete?-api-key-provider-test
  (testing "API-key provider credentials are complete only with a non-blank :api-key"
    (is (true? (metabot.settings/provider-credentials-complete? "openai" {:api-key "sk-valid"})))
    (is (false? (metabot.settings/provider-credentials-complete? "openai" {:api-key ""})))
    (is (false? (metabot.settings/provider-credentials-complete? "openai" {:api-key nil})))
    (is (false? (metabot.settings/provider-credentials-complete? "openai" nil)))))

(deftest configured-provider-credentials-api-key-provider-test
  (testing "API-key providers return an {:api-key ...} credentials map, or nil when unset"
    (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-valid"]
      (is (= {:api-key "sk-ant-valid"}
             (metabot.settings/configured-provider-credentials "anthropic"))))
    (mt/with-temporary-setting-values [llm-anthropic-api-key nil]
      (is (nil? (metabot.settings/configured-provider-credentials "anthropic"))))))
