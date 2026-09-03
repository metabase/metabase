(ns metabase.metabot.settings-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(defn- connection
  ([conn-key type]
   (connection conn-key type {}))
  ([conn-key type config]
   {:key conn-key :type type :name conn-key :config config}))

(def ^:private configured-anthropic
  (connection "anthropic" "anthropic" {:api-key "sk-ant-test"}))

(def ^:private configured-google
  (connection "google" "google" {:oauth-access-token "ya29.test" :project-id "my-project"}))

(defn- do-with-connections!
  [conns thunk]
  (mt/with-temporary-setting-values [llm-providers conns]
    (thunk)))

(defmacro ^:private with-connections
  [conns & body]
  `(do-with-connections! ~conns (fn [] ~@body)))

(defn- do-with-selected-model!
  [model-ref thunk]
  ;; Env vars outrank raw setting values, so mask any MB_LLM_METABOT_PROVIDER the host
  ;; carries (dev machines pin one in mise.local.toml) before selecting the model.
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider nil]
    (mt/with-temporary-raw-setting-values [llm-metabot-provider model-ref]
      (thunk))))

(defmacro ^:private with-selected-model
  [model-ref & body]
  `(do-with-selected-model! ~model-ref (fn [] ~@body)))

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

(deftest metabot-configured-with-managed-connection-and-proxy-url-test
  (testing "returns true when the managed connection is selected and the LLM proxy is configured"
    (mt/with-premium-features #{:metabase-ai-managed}
      (with-connections [(connection "metabase" "metabase")]
        (mt/with-temporary-setting-values [llm-proxy-base-url "https://proxy.example.com"]
          (with-selected-model "metabase/anthropic/claude-sonnet-4-6"
            (is (true? (metabot.settings/llm-metabot-configured?)))))))))

(deftest metabot-configured-with-managed-connection-no-proxy-url-test
  (testing "returns false when the managed connection is selected but there is no LLM proxy"
    (mt/with-premium-features #{:metabase-ai-managed}
      (with-connections [(connection "metabase" "metabase")]
        (mt/with-temporary-setting-values [llm-proxy-base-url nil]
          (with-selected-model "metabase/anthropic/claude-sonnet-4-6"
            (is (false? (metabot.settings/llm-metabot-configured?)))))))))

(deftest metabot-configured-with-direct-connection-and-api-key-test
  (testing "returns true when the selected connection carries the credentials its type needs"
    (with-connections [configured-anthropic]
      (with-selected-model "anthropic/claude-sonnet-4-6"
        (is (true? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-with-direct-connection-no-api-key-test
  (testing "returns false when the selected connection exists but has no credentials"
    (with-connections [(connection "anthropic" "anthropic")]
      (with-selected-model "anthropic/claude-sonnet-4-6"
        (is (false? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-with-unknown-connection-test
  (testing "returns false when the selected connection no longer exists"
    (with-connections [configured-anthropic]
      (with-selected-model "deleted-connection/some-model"
        (is (false? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-proxy-url-not-fallback-for-direct-connection-test
  (testing "the LLM proxy alone does not make a direct connection configured"
    (mt/with-premium-features #{:metabase-ai-managed}
      (with-connections [(connection "anthropic" "anthropic")]
        (mt/with-temporary-setting-values [llm-proxy-base-url "https://proxy.example.com"]
          (with-selected-model "anthropic/claude-sonnet-4-6"
            (is (false? (metabot.settings/llm-metabot-configured?)))))))))

(deftest metabot-configured-with-bedrock-credentials-test
  (testing "returns true when bedrock has both the access key ID and secret access key"
    (with-connections [(connection "bedrock" "bedrock" {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                        :secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"})]
      (with-selected-model "bedrock/anthropic.claude-haiku-4-5"
        (is (true? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-with-partial-bedrock-credentials-test
  (testing "returns false when bedrock has an access key ID but no secret access key"
    (with-connections [(connection "bedrock" "bedrock" {:access-key-id "AKIAIOSFODNN7EXAMPLE"})]
      (with-selected-model "bedrock/anthropic.claude-haiku-4-5"
        (is (false? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-with-azure-credentials-test
  (testing "returns true when azure has the API key, the base URL, and the deployment it serves"
    (with-connections [(connection "azure" "azure" {:api-key         "azure-key"
                                                    :base-url        "https://my-resource.services.ai.azure.com/anthropic"
                                                    :model-family    "anthropic"
                                                    :deployment-name "claude-sonnet-4-5"})]
      (with-selected-model "azure/anthropic/claude-sonnet-4-5"
        (is (true? (metabot.settings/llm-metabot-configured?))))))
  (testing (str "returns true without a deployment in the config too: the model reference names it, which is where "
                "an instance configured before the connection list existed carries it")
    (with-connections [(connection "azure" "azure" {:api-key  "azure-key"
                                                    :base-url "https://my-resource.services.ai.azure.com/anthropic"})]
      (with-selected-model "azure/anthropic/claude-sonnet-4-5"
        (is (true? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-configured-with-partial-azure-credentials-test
  (testing "returns false when azure has an API key but no base URL"
    (with-connections [(connection "azure" "azure" {:api-key "azure-key"})]
      (with-selected-model "azure/anthropic/claude-sonnet-4-5"
        (is (false? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-supports-reasoning-test
  (testing "models that stream reasoning report support; others answer false"
    (with-connections [(connection "anthropic" "anthropic")
                       (connection "openai" "openai")
                       (connection "bedrock" "bedrock")
                       (connection "google" "google")
                       (connection "azure" "azure")
                       (connection "zai" "zai")
                       (connection "openrouter" "openrouter")
                       (connection "google" "google")
                       (connection "mistral" "mistral")
                       (connection "moonshot" "moonshot")]
      (doseq [[model-ref expected]
              {"anthropic/claude-sonnet-4-6"                true
               "anthropic/claude-haiku-4-5"                 false
               "openai/gpt-5.4"                             true
               "openai/gpt-4o"                              false
               "bedrock/anthropic.claude-opus-4-8"          true
               "bedrock/anthropic.claude-haiku-4-5"         false
               ;; requests reasoning (encrypted replay), but the mantle never
               ;; streams summaries, so nothing renders — see bedrock/reasoning-model?
               "bedrock/openai.gpt-5.5"                     false
               "azure/anthropic/claude-opus-5"              true
               "azure/anthropic/claude-haiku-4-5"           false
               "azure/openai/gpt-5.4"                       true
               "azure/openai/my-deployment"                 false
               ;; a family with no deployment segment names no model
               "azure/anthropic"                            false
               "zai/glm-5.2"                                true
               "zai/glm-4.7"                                false
               "openrouter/anthropic/claude-sonnet-4.6"     true
               "openrouter/z-ai/glm-5.2"                    true
               ;; streams reasoning summaries under the server default
               "openrouter/openai/gpt-5.5"                  true
               ;; encrypted-only upstream: reasoning exists but never renders
               "openrouter/openai/gpt-5.4"                  false
               "openrouter/anthropic/claude-haiku-4.5"      false
               ;; google serves both wire families; Claude partner models and catalog Geminis both stream
               "google/anthropic/claude-sonnet-4-6"         true
               "google/anthropic/claude-haiku-4-5@20251001" false
               "google/google/gemini-3.5-flash"             true
               "google/google/gemini-3.7-flash"             true
               ;; off-catalog: no thinking directive — see google/models.clj
               "google/google/gemini-2.5-flash"             false
               "mistral/mistral-medium-3-5"                 true
               ;; catalog aliases are not resolved — see mistral/reasoning-model?
               "mistral/mistral-medium-latest"              false
               "moonshot/kimi-k3"                           true
               "moonshot/kimi-k2.6"                         true
               ;; thinking-capable but excluded from supported-models — see moonshot/reasoning-model?
               "moonshot/kimi-k2.7-code"                    false}]
        (testing model-ref
          (with-selected-model model-ref
            (is (= expected (metabot.settings/llm-metabot-supports-reasoning?)))))))))

(deftest metabot-supports-fast-mode-test
  (testing "only BYOK anthropic connections serving a fast-capable model report support"
    (with-connections [(connection "anthropic" "anthropic")
                       (connection "bedrock" "bedrock")
                       (connection "openai" "openai")]
      (doseq [[model-ref expected]
              {"anthropic/claude-opus-5"           true
               "anthropic/claude-opus-4-8"         true
               "anthropic/claude-opus-4-7"         false
               "anthropic/claude-sonnet-4-6"       false
               "bedrock/anthropic.claude-opus-4-8" false
               "openai/gpt-5.4"                    false}]
        (testing model-ref
          (with-selected-model model-ref
            (is (= expected (metabot.settings/llm-metabot-supports-fast-mode?))))))))
  (testing "the managed connection reports no support even for a fast-capable model"
    (mt/with-premium-features #{:metabase-ai-managed}
      (with-connections [(connection "metabase" "metabase")]
        (with-selected-model "metabase/anthropic/claude-opus-5"
          (is (false? (metabot.settings/llm-metabot-supports-fast-mode?))))))))

(deftest metabot-supports-reasoning-model-less-ref-test
  (testing "a ref with no model segment answers false rather than throwing"
    (with-connections [(connection "bedrock" "bedrock")]
      (with-selected-model "bedrock"
        (is (false? (metabot.settings/llm-metabot-supports-reasoning?)))))))

(deftest metabot-supports-reasoning-vllm-test
  (testing "vLLM answers from what the connect-time probe recorded on the connection, since neither its catalog
           nor its model names carry a reasoning field"
    (doseq [recorded ["true" "false"]]
      (testing (str "recorded " recorded)
        (with-connections [(connection "vllm" "vllm" {:base-url        "http://vllm.internal:8000/v1"
                                                      :model-reasoning recorded})]
          (with-selected-model "vllm/vllm-test"
            (is (= (= "true" recorded) (metabot.settings/llm-metabot-supports-reasoning?))))))))
  (testing "an unprobed server defaults to the non-reasoning renderer rather than guessing"
    (with-connections [(connection "vllm" "vllm" {:base-url "http://vllm.internal:8000/v1"})]
      (with-selected-model "vllm/vllm-test"
        (is (false? (metabot.settings/llm-metabot-supports-reasoning?)))))))

(deftest metabot-supports-reasoning-managed-proxy-test
  (testing "the managed connection answers from the model's own provider segment"
    (with-connections [(connection "metabase" "metabase")]
      ;; only anthropic models are servable over the proxy (openai-raw rejects
      ;; :ai-proxy?), so only anthropic refs are exercised here
      (doseq [[model-ref expected]
              {"metabase/anthropic/claude-sonnet-4-6" true
               "metabase/anthropic/claude-haiku-4-5"  false}]
        (testing model-ref
          (with-selected-model model-ref
            (is (= expected (metabot.settings/llm-metabot-supports-reasoning?)))))))))

(deftest metabot-configured-with-a-keyless-vllm-connection-test
  (testing "a vLLM server started without --api-key is a complete configuration: the base URL is the credential"
    (with-connections [(connection "vllm" "vllm" {:base-url "http://vllm.internal:8000/v1"})]
      (with-selected-model "vllm/vllm-test"
        (is (true? (metabot.settings/llm-metabot-configured?))))))
  (testing "and a connection carrying only a key is not"
    (with-connections [(connection "vllm" "vllm" {:api-key "local-dev-key"})]
      (with-selected-model "vllm/vllm-test"
        (is (false? (metabot.settings/llm-metabot-configured?)))))))

(deftest metabot-provider-keeps-slashes-in-a-vllm-model-test
  (testing "a served model named after its Hugging Face repo keeps its slashes — everything after the first
           segment is the model"
    (with-connections [(connection "vllm" "vllm" {:base-url "http://vllm.internal:8000/v1"})]
      (mt/discard-setting-changes [llm-metabot-provider]
        (metabot.settings/llm-metabot-provider! "vllm/mlx-community/Qwen3-14B-4bit")
        (is (=? {:provider "vllm" :model "mlx-community/Qwen3-14B-4bit"}
                (#'metabot.self/parse-provider-model (metabot.settings/llm-metabot-provider))))))))

;;; ------------------------------------------- validate-metabot-provider! Tests -------------------------------------------
;; The validator is private; exercise it through the setting setter.

(deftest validate-metabot-provider-rejects-non-string-test
  (testing "rejects non-string input"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"must be a string"
         (metabot.settings/llm-metabot-provider! 42)))))

(deftest validate-metabot-provider-defers-the-unknown-connection-error-test
  (with-connections [configured-anthropic]
    (testing "the setter takes a reference to a connection that does not exist yet, because the setting and the connection it names can land in either order"
      (mt/discard-setting-changes [llm-metabot-provider]
        (metabot.settings/llm-metabot-provider! "foobar/some-model")
        (is (= "foobar/some-model" (metabot.settings/llm-metabot-provider)))))
    (testing "a connection key nothing is configured under reads as unconfigured, and naming it in a request is a 400"
      (with-selected-model "foobar/some-model"
        (is (false? (metabot.settings/llm-metabot-configured?)))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"No LLM provider connection named \"foobar\" is configured"
             (#'metabot.self/parse-provider-model "foobar/some-model")))))
    (testing "a known provider type with no connection on this instance is treated the same way"
      (with-selected-model "openai/gpt-5.4"
        (is (false? (metabot.settings/llm-metabot-configured?)))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"No LLM provider connection named \"openai\" is configured"
             (#'metabot.self/parse-provider-model "openai/gpt-5.4")))))))

(deftest validate-metabot-provider-rejects-blank-model-test
  (with-connections [configured-anthropic]
    (testing "rejects a connection-only string with no model"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Model name is required"
           (metabot.settings/llm-metabot-provider! "anthropic/")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Model name is required"
           (metabot.settings/llm-metabot-provider! "anthropic"))))))

(deftest validate-metabot-provider-accepts-configured-connections-test
  (with-connections [configured-anthropic
                     (connection "openai" "openai" {:api-key "sk-test"})
                     (connection "openrouter" "openrouter" {:api-key "sk-or-v1-test"})
                     (connection "bedrock" "bedrock" {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                      :secret-access-key "test-secret"})]
    (doseq [model-ref ["anthropic/claude-sonnet-4-6"
                       "openai/gpt-4.1-mini"
                       "openrouter/anthropic/claude-haiku-4-5"
                       "bedrock/anthropic.claude-haiku-4-5"]]
      (testing (str "accepts " model-ref)
        (mt/with-temporary-setting-values [llm-metabot-provider model-ref]
          (is (= model-ref (metabot.settings/llm-metabot-provider))))))))

(deftest validate-metabot-provider-accepts-a-second-connection-of-the-same-type-test
  (testing "a model can be selected on a second connection of a type the instance already has"
    (with-connections [configured-anthropic
                       (connection "anthropic-2" "anthropic" {:api-key "sk-ant-other"})]
      (mt/with-temporary-setting-values [llm-metabot-provider "anthropic-2/claude-opus-4-1"]
        (is (= "anthropic-2/claude-opus-4-1" (metabot.settings/llm-metabot-provider)))))))

(deftest validate-metabot-provider-azure-model-format-test
  (with-connections [configured-anthropic
                     (connection "azure" "azure" {:api-key  "azure-key"
                                                  :base-url "https://my-resource.services.ai.azure.com/openai"})]
    (testing "accepts a supported wire family plus a deployment name"
      (mt/with-temporary-setting-values [llm-metabot-provider "azure/anthropic/claude-sonnet-4-5"]
        (is (= "azure/anthropic/claude-sonnet-4-5" (metabot.settings/llm-metabot-provider))))
      (mt/with-temporary-setting-values [llm-metabot-provider "azure/openai/my-gpt-deployment"]
        (is (= "azure/openai/my-gpt-deployment" (metabot.settings/llm-metabot-provider)))))
    (testing "rejects an unsupported wire family"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Invalid Azure model"
           (metabot.settings/llm-metabot-provider! "azure/evilai/some-deployment"))))
    (testing "rejects a missing deployment name"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Invalid Azure model"
           (metabot.settings/llm-metabot-provider! "azure/anthropic/")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Invalid Azure model"
           (metabot.settings/llm-metabot-provider! "azure/anthropic"))))
    (testing "rejects a deployment name containing a slash, which Azure does not allow"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Invalid Azure model"
           (metabot.settings/llm-metabot-provider! "azure/anthropic/a/b"))))))

(deftest validate-metabot-provider-google-model-format-test
  (with-connections [configured-anthropic configured-google]
    (testing "accepts a publisher-qualified model"
      (mt/with-temporary-setting-values [llm-metabot-provider "google/google/gemini-3.5-flash"]
        (is (= "google/google/gemini-3.5-flash" (metabot.settings/llm-metabot-provider))))
      (mt/with-temporary-setting-values [llm-metabot-provider "google/anthropic/claude-haiku-4-5@20251001"]
        (is (= "google/anthropic/claude-haiku-4-5@20251001" (metabot.settings/llm-metabot-provider)))))))

(deftest validate-metabot-provider-google-rejects-an-unqualified-model-test
  (with-connections [configured-anthropic configured-google]
    (testing "rejects a model with no publisher: the connection key is not one, so this names the model \"gemini-3.5-flash\""
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Invalid Google model \"google/gemini-3.5-flash\""
           (metabot.settings/llm-metabot-provider! "google/gemini-3.5-flash"))))))

(deftest validate-metabot-provider-google-rejects-an-unsupported-publisher-test
  (with-connections [configured-anthropic configured-google]
    (testing "rejects a publisher this provider does not serve"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Invalid Google model \"google/evilai/some-model\""
           (metabot.settings/llm-metabot-provider! "google/evilai/some-model"))))))

(deftest validate-metabot-provider-google-rejects-a-slash-in-the-model-id-test
  (with-connections [configured-anthropic configured-google]
    (testing "rejects a model ID with a slash in it, which is not one path segment"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Invalid Google model \"google/anthropic/a/b\""
           (metabot.settings/llm-metabot-provider! "google/anthropic/a/b"))))))

(deftest validate-metabot-provider-managed-model-allow-list-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (with-connections [configured-anthropic (connection "metabase" "metabase")]
      (testing "accepts an allow-listed managed wire family and model"
        (mt/with-temporary-setting-values [llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"]
          (is (= "metabase/anthropic/claude-sonnet-4-6" (metabot.settings/llm-metabot-provider)))))
      (testing "rejects a wire family the proxy does not serve"
        (doseq [model-ref ["metabase/foobar/some-model"
                           "metabase/openai/gpt-4.1-mini"
                           "metabase/openrouter/anthropic/claude-haiku-4-5"]]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo #"for Metabase managed AI"
               (metabot.settings/llm-metabot-provider! model-ref)))))
      (testing "rejects a model the proxy does not serve"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Unsupported model \"anthropic/claude-haiku-4-5\" for Metabase managed AI"
             (metabot.settings/llm-metabot-provider! "metabase/anthropic/claude-haiku-4-5"))))
      (testing "rejects a managed reference with no model"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Model name is required"
             (metabot.settings/llm-metabot-provider! "metabase/")))))))

(deftest llm-mini-model-defaults-to-the-metabot-connections-mini-model-test
  (testing "with nothing stored, quick tasks run on the fastest model of the connection Metabot uses"
    (mt/with-temporary-raw-setting-values [llm-mini-model nil]
      (with-connections [configured-anthropic
                         (connection "openai" "openai" {:api-key "sk-openai"})]
        (with-selected-model "anthropic/claude-sonnet-4-6"
          (is (= "anthropic/claude-haiku-4-5-20251001" (metabot.settings/llm-mini-model))))
        (testing "including a second connection of the same type, which keeps its own key"
          (with-selected-model "openai/gpt-5.4"
            (is (= "openai/gpt-5.4-mini" (metabot.settings/llm-mini-model)))))))))

(deftest llm-mini-model-falls-back-to-the-metabot-model-test
  (mt/with-temporary-raw-setting-values [llm-mini-model nil]
    (testing "provider types with no mini model fall through to the model Metabot itself uses"
      (with-connections [(connection "azure" "azure" {:api-key  "azure-key"
                                                      :base-url "https://my-resource.services.ai.azure.com/openai"})]
        (with-selected-model "azure/openai/my-gpt-deployment"
          (is (= "azure/openai/my-gpt-deployment" (metabot.settings/llm-mini-model))))))
    (testing "so does a model reference naming a connection that does not exist"
      (with-connections []
        (with-selected-model "gone/some-model"
          (is (= "gone/some-model" (metabot.settings/llm-mini-model))))))))

(deftest llm-mini-model-explicit-value-wins-test
  (with-connections [configured-anthropic]
    (with-selected-model "anthropic/claude-sonnet-4-6"
      (mt/with-temporary-setting-values [llm-mini-model "anthropic/claude-opus-4-8"]
        (is (= "anthropic/claude-opus-4-8" (metabot.settings/llm-mini-model))))
      (testing "and clearing it returns to the derived mini model"
        (mt/with-temporary-setting-values [llm-mini-model nil]
          (is (= "anthropic/claude-haiku-4-5-20251001" (metabot.settings/llm-mini-model))))))))

(deftest explicit-mini-model-reports-only-what-was-set-test
  (testing "the explicit reading is nil while the model is derived, so callers can tell a choice from a fallback"
    (with-connections [configured-anthropic]
      (with-selected-model "anthropic/claude-sonnet-4-6"
        (mt/with-temporary-setting-values [llm-mini-model nil]
          (is (nil? (metabot.settings/explicit-mini-model)))
          (is (= "anthropic/claude-haiku-4-5-20251001" (metabot.settings/llm-mini-model))))
        (mt/with-temporary-setting-values [llm-mini-model "anthropic/claude-opus-4-8"]
          (is (= "anthropic/claude-opus-4-8" (metabot.settings/explicit-mini-model))))))))

(deftest llm-mini-model-is-validated-like-the-metabot-model-test
  (with-connections [configured-anthropic
                     (connection "azure" "azure" {:api-key  "azure-key"
                                                  :base-url "https://my-resource.services.ai.azure.com/openai"})]
    (testing "rejects a reference with no model"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Model name is required"
           (metabot.settings/llm-mini-model! "anthropic"))))
    (testing "applies the azure deployment-name rules"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Invalid Azure model"
           (metabot.settings/llm-mini-model! "azure/gemini/some-deployment"))))))

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
