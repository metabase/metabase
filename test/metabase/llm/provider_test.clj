(ns metabase.llm.provider-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.llm.provider :as llm.provider]
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(defn- connection
  ([conn-key type]
   (connection conn-key type {}))
  ([conn-key type config]
   {:key conn-key :type type :name conn-key :config config}))

(deftest unique-key-test
  (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic")
                                                    (connection "anthropic-2" "anthropic")]]
    (testing "a key nothing else uses is taken as-is, so the first connection of a type is named after it"
      (is (= "openai" (llm.provider/unique-key "openai"))))
    (testing "a taken key is suffixed past every collision"
      (is (= "anthropic-3" (llm.provider/unique-key "anthropic"))))
    (testing "a display name is slugified into something URL-safe"
      (is (= "anthropic-evals" (llm.provider/unique-key "Anthropic (evals)")))
      (is (= "my-key" (llm.provider/unique-key "  My___KEY  "))))
    (testing "a name with nothing slug-able left falls back to a generic key"
      (is (= "provider" (llm.provider/unique-key "!!!")))
      (is (= "provider" (llm.provider/unique-key nil))))))

(deftest ^:parallel redact-masks-only-password-fields-test
  (testing "password fields are masked and plain fields are returned as-is"
    (is (= {:api-key  "**********34"
            :base-url "https://api.anthropic.com"}
           (:config (llm.provider/redact (connection "anthropic" "anthropic"
                                                     {:api-key  "sk-ant-secret1234"
                                                      :base-url "https://api.anthropic.com"}))))))
  (testing "a blank or missing secret is left alone rather than masked into something that looks configured"
    (is (= {:api-key "" :base-url nil}
           (:config (llm.provider/redact (connection "anthropic" "anthropic"
                                                     {:api-key "" :base-url nil}))))))
  (testing "every password field of a multi-secret type is masked, and its select field is not"
    (is (= {:access-key-id     "**********LE"
            :secret-access-key "**********et"
            :session-token     "**********en"
            :region            "us-east-2"}
           (:config (llm.provider/redact (connection "bedrock" "bedrock"
                                                     {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                      :secret-access-key "test-secret"
                                                      :session-token     "test-token"
                                                      :region            "us-east-2"}))))))
  (testing "the managed type has no secret fields, so nothing is touched"
    (is (= {} (:config (llm.provider/redact (connection "metabase" "metabase")))))))

(deftest ^:parallel merge-config-test
  (testing "a secret the client echoed back masked keeps its stored value"
    (is (= {:api-key  "sk-ant-stored"
            :base-url "https://new.example.com"}
           (llm.provider/merge-config "anthropic"
                                      {:api-key "sk-ant-stored" :base-url "https://old.example.com"}
                                      {:api-key  (setting/obfuscate-value "sk-ant-stored")
                                       :base-url "https://new.example.com"}))))
  (testing "a freshly entered secret replaces the stored one"
    (is (= {:api-key "sk-ant-new"}
           (llm.provider/merge-config "anthropic" {:api-key "sk-ant-stored"} {:api-key "sk-ant-new"}))))
  (testing "an explicitly blank secret clears the stored one"
    (is (= {:api-key ""}
           (llm.provider/merge-config "anthropic" {:api-key "sk-ant-stored"} {:api-key ""})))
    (is (= {:api-key nil}
           (llm.provider/merge-config "anthropic" {:api-key "sk-ant-stored"} {:api-key nil}))))
  (testing "fields the client leaves out keep their stored value"
    (is (= {:api-key "sk-ant-stored" :base-url "https://old.example.com"}
           (llm.provider/merge-config "anthropic"
                                      {:api-key "sk-ant-stored" :base-url "https://old.example.com"}
                                      {}))))
  (testing "each secret field of a multi-secret type is preserved independently"
    (is (= {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
            :secret-access-key "rotated-secret"
            :region            "us-west-1"}
           (llm.provider/merge-config "bedrock"
                                      {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                       :secret-access-key "old-secret"
                                       :region            "us-east-2"}
                                      {:access-key-id     (setting/obfuscate-value "AKIAIOSFODNN7EXAMPLE")
                                       :secret-access-key "rotated-secret"
                                       :region            "us-west-1"})))))

(deftest ^:parallel merge-config-preserves-a-masked-multi-line-secret-test
  (testing (str "a service account key file is JSON that ends with a newline, so its mask straddles a line break — "
                "echoing it back still has to keep the stored key rather than store the mask")
    (let [key-file "{\n  \"type\": \"service_account\",\n  \"project_id\": \"my-project\"\n}\n"]
      (is (= {:auth-method         "service-account-key"
              :service-account-key key-file}
             (llm.provider/merge-config "google"
                                        {:auth-method         "service-account-key"
                                         :service-account-key key-file}
                                        {:auth-method         "service-account-key"
                                         :service-account-key (setting/obfuscate-value key-file)}))))))

(deftest set-single-provider-setting!-ignores-a-masked-multi-line-secret-test
  (testing (str "the setter trims before storing, but the mask of a newline-terminated secret only matches "
                "untrimmed — echoing it back must keep the stored key rather than store the mask")
    (let [key-file "{\n  \"type\": \"service_account\",\n  \"project_id\": \"my-project\"\n}\n"]
      (mt/with-temporary-setting-values [llm-providers [(connection "google" "google"
                                                                    {:auth-method         "service-account-key"
                                                                     :service-account-key key-file})]]
        (llm.settings/llm-google-service-account-key! (setting/obfuscate-value key-file))
        (is (= key-file (llm.settings/llm-google-service-account-key)))))))

(deftest set-single-provider-setting!-ignores-a-whitespace-padded-mask-test
  (testing "a mask that picked up surrounding whitespace in transit is still an echo, not a new value"
    (let [key-file "{\"type\": \"service_account\", \"project_id\": \"my-project\"}"]
      (mt/with-temporary-setting-values [llm-providers [(connection "google" "google"
                                                                    {:auth-method         "service-account-key"
                                                                     :service-account-key key-file})]]
        (llm.settings/llm-google-service-account-key! (str " " (setting/obfuscate-value key-file) " "))
        (is (= key-file (llm.settings/llm-google-service-account-key)))))))

(deftest set-single-provider-setting!-stores-a-fresh-value-test
  (testing "a freshly entered value still replaces the stored one"
    (let [old-key "{\"type\": \"service_account\", \"project_id\": \"old-project\"}"
          new-key "{\"type\": \"service_account\", \"project_id\": \"new-project\"}\n"]
      (mt/with-temporary-setting-values [llm-providers [(connection "google" "google"
                                                                    {:auth-method         "service-account-key"
                                                                     :service-account-key old-key})]]
        (llm.settings/llm-google-service-account-key! new-key)
        (testing "trimmed, the way the setter has always stored"
          (is (= (str/trim new-key) (llm.settings/llm-google-service-account-key))))))))

(deftest validate-config!-test
  (testing "an unknown provider type is rejected"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Unknown provider type"
         (llm.provider/validate-config! "evilai" {:api-key "whatever"}))))
  (testing "a missing required field is rejected"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"API key is required for anthropic"
         (llm.provider/validate-config! "anthropic" {})))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"API key is required for anthropic"
         (llm.provider/validate-config! "anthropic" {:api-key "   "}))))
  (testing "a required field is only required when the type declares it"
    (is (nil? (llm.provider/validate-config! "anthropic" {:api-key "sk-ant-valid"})))
    (is (nil? (llm.provider/validate-config! "bedrock" {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                        :secret-access-key "test-secret"}))))
  (testing "a field that declares a prefix must start with it"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"must start with"
         (llm.provider/validate-config! "anthropic" {:api-key "sk-not-anthropic"})))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"must start with"
         (llm.provider/validate-config! "openrouter" {:api-key "sk-or-v2-nope"})))
    (is (nil? (llm.provider/validate-config! "openrouter" {:api-key "sk-or-v1-valid"}))))
  (testing "a type with several required fields rejects the first one missing"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"API base URL is required for azure"
         (llm.provider/validate-config! "azure" {:api-key "azure-key"})))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Deployment name is required for azure"
         (llm.provider/validate-config! "azure" {:api-key  "azure-key"
                                                 :base-url "https://r.services.ai.azure.com/openai"})))
    (testing "a required field the registry defaults is satisfied by that default"
      (is (nil? (llm.provider/validate-config! "azure" {:api-key         "azure-key"
                                                        :base-url        "https://r.services.ai.azure.com/openai"
                                                        :deployment-name "gpt-4.1-mini"}))))
    (is (nil? (llm.provider/validate-config! "azure" {:api-key         "azure-key"
                                                      :base-url        "https://r.services.ai.azure.com/openai"
                                                      :model-family    "openai"
                                                      :deployment-name "gpt-4.1-mini"}))))
  (testing "the managed type declares no fields, so any config validates"
    (is (nil? (llm.provider/validate-config! "metabase" {})))))

(deftest validate-config!-required-any-test
  (testing "a type with alternative credential groups needs one of them in full"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"google needs one of"
         (llm.provider/validate-config! "google" {})))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"google needs one of"
         (llm.provider/validate-config! "google" {:oauth-access-token "ya29.token"})))
    (is (nil? (llm.provider/validate-config! "google" {:service-account-key "{\"type\":\"service_account\"}"})))
    (is (nil? (llm.provider/validate-config! "google" {:oauth-access-token "ya29.token"
                                                       :project-id         "my-project"})))))

(deftest validate-config!-field-validator-test
  (testing "a field's own validator runs on a non-blank value"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"not a valid Google Cloud project ID"
         (llm.provider/validate-config! "google" {:service-account-key "{\"type\":\"service_account\"}"
                                                  :project-id          "My Project (name, not ID)"})))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"not a valid Google Cloud location"
         (llm.provider/validate-config! "google" {:service-account-key "{\"type\":\"service_account\"}"
                                                  :location            "US Central"})))))

(deftest validate-config!-base-url-network-policy-test
  (testing "every provider's base URL is checked against llm-allowed-networks"
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "external-only"]
      (doseq [[type config] [["anthropic" {:api-key "sk-ant-valid"}]
                             ["openai"    {:api-key "sk-valid"}]
                             ["vllm"      {}]
                             ["azure"     {:api-key "azure-key" :deployment-name "gpt-4.1-mini"}]]]
        (testing type
          (is (=? {:status-code 400 :field :base-url}
                  (try (llm.provider/validate-config! type (assoc config :base-url "http://127.0.0.1:8000"))
                       (catch clojure.lang.ExceptionInfo e (ex-data e)))))
          (is (nil? (llm.provider/validate-config! type (assoc config :base-url "https://8.8.8.8/v1"))))))))
  (testing "under :allow-all a loopback base URL is fine, but it still has to be an http(s) URL"
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
      (is (nil? (llm.provider/validate-config! "vllm" {:base-url "http://127.0.0.1:8000/v1"})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"must start with http"
           (llm.provider/validate-config! "vllm" {:base-url "127.0.0.1:8000/v1"}))))))

(deftest validate-config!-select-options-test
  (testing "a select field's value must be one of its options"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Invalid Model provider for azure"
         (llm.provider/validate-config! "azure" {:api-key         "azure-key"
                                                 :base-url        "https://r.services.ai.azure.com/openai"
                                                 :model-family    "gemini"
                                                 :deployment-name "gpt-4.1-mini"})))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Invalid Region for bedrock"
         (llm.provider/validate-config! "bedrock" {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                   :secret-access-key "test-secret"
                                                   :region            "mars-north-1"})))))

(deftest connection-model-test
  (testing "Azure composes its model from the family and deployment the admin picked, so neither is typed as a prefix"
    (is (= "openai/gpt-4.1-mini"
           (llm.provider/connection-model "azure" {:model-family    "openai"
                                                   :deployment-name "gpt-4.1-mini"})))
    (is (= "anthropic/claude-sonnet-4-5"
           (llm.provider/connection-model "azure" {:model-family    "anthropic"
                                                   :deployment-name "claude-sonnet-4-5"}))))
  (testing "a half-filled connection names no model rather than a malformed one"
    (is (nil? (llm.provider/connection-model "azure" {:model-family "openai"})))
    (is (nil? (llm.provider/connection-model "azure" {:model-family    "openai"
                                                      :deployment-name "  "})))
    (is (nil? (llm.provider/connection-model "azure" {:deployment-name "gpt-4.1-mini"})))
    (is (nil? (llm.provider/connection-model "azure" nil))))
  (testing "types that list their models over the wire name none in their config"
    (doseq [type ["anthropic" "openai" "openrouter" "bedrock" "metabase"]]
      (is (nil? (llm.provider/connection-model type {:api-key "sk-whatever"})) type))))

(deftest config-complete?-test
  (testing "API-key types are complete exactly when the key is non-blank"
    (doseq [type ["anthropic" "openai" "openrouter"]]
      (testing type
        (is (true? (llm.provider/config-complete? type {:api-key "sk-whatever"})))
        (is (false? (llm.provider/config-complete? type {:api-key ""})))
        (is (false? (llm.provider/config-complete? type {:api-key nil})))
        (is (false? (llm.provider/config-complete? type nil))))))
  (testing "google needs a service account key on its own, or an OAuth token together with a project ID"
    (is (true? (llm.provider/config-complete? "google" {:service-account-key "{\"type\":\"service_account\"}"})))
    (is (true? (llm.provider/config-complete? "google" {:oauth-access-token "ya29.token"
                                                        :project-id         "my-project"})))
    (testing "an empty config is not complete just because every field is individually optional"
      (is (false? (llm.provider/config-complete? "google" {})))
      (is (false? (llm.provider/config-complete? "google" nil))))
    (testing "an OAuth token alone is not enough — nothing carries the project it should bill to"
      (is (false? (llm.provider/config-complete? "google" {:oauth-access-token "ya29.token"})))
      (is (false? (llm.provider/config-complete? "google" {:oauth-access-token "ya29.token"
                                                           :project-id         "  "}))))
    (testing "a project ID alone authenticates nothing"
      (is (false? (llm.provider/config-complete? "google" {:project-id "my-project"})))))
  (testing "azure needs an API key and a base URL"
    (is (true? (llm.provider/config-complete? "azure" {:api-key         "azure-key"
                                                       :base-url        "https://r.services.ai.azure.com/openai"
                                                       :model-family    "openai"
                                                       :deployment-name "gpt-4.1-mini"})))
    (is (false? (llm.provider/config-complete? "azure" {:api-key "azure-key"})))
    (is (false? (llm.provider/config-complete? "azure" {:api-key "azure-key" :base-url "  "})))
    (is (false? (llm.provider/config-complete? "azure" {:base-url "https://r.services.ai.azure.com/openai"})))
    (testing (str "the deployment names what to call rather than what authenticates the call, and an instance "
                  "configured before the connection list existed carries it in the model reference instead, so a "
                  "connection without one still counts as complete")
      (is (true? (llm.provider/config-complete? "azure" {:api-key  "azure-key"
                                                         :base-url "https://r.services.ai.azure.com/openai"})))))
  (testing "vLLM needs a base URL, and its API key is optional — a server started without --api-key takes none"
    (is (true? (llm.provider/config-complete? "vllm" {:base-url "http://vllm.internal:8000/v1"})))
    (is (true? (llm.provider/config-complete? "vllm" {:base-url "http://vllm.internal:8000/v1"
                                                      :api-key  "local-dev-key"})))
    (is (false? (llm.provider/config-complete? "vllm" {:api-key "local-dev-key"})))
    (is (false? (llm.provider/config-complete? "vllm" {:base-url "  "})))
    (is (false? (llm.provider/config-complete? "vllm" nil))))
  (testing "bedrock needs both AWS keys, and neither the region nor the session token"
    (is (true? (llm.provider/config-complete? "bedrock" {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                         :secret-access-key "test-secret"})))
    (is (false? (llm.provider/config-complete? "bedrock" {:access-key-id "AKIAIOSFODNN7EXAMPLE"})))
    (is (false? (llm.provider/config-complete? "bedrock" {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                          :secret-access-key ""})))
    (is (false? (llm.provider/config-complete? "bedrock" {:secret-access-key "test-secret"}))))
  (testing "the managed type carries no credentials and is complete exactly when the LLM proxy is configured"
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-temporary-setting-values [llm-proxy-base-url "https://proxy.example.com"]
        (is (true? (llm.provider/config-complete? "metabase" {})))
        (is (true? (llm.provider/type-available? "metabase"))))
      (mt/with-temporary-setting-values [llm-proxy-base-url nil]
        (is (false? (llm.provider/config-complete? "metabase" {})))
        (is (false? (llm.provider/type-available? "metabase")))))))

(deftest managed-type-is-available-to-instances-that-can-buy-it-test
  (testing "Harbormaster injects the proxy URL into every hosted instance, so availability follows the subscription"
    (mt/with-temp-env-var-value! [mb-llm-proxy-base-url "https://proxy.example.com"]
      (testing "an instance that is only offered the add-on can still reach the purchase flow"
        (mt/with-premium-features #{:offer-metabase-ai-managed}
          (is (true? (llm.provider/type-available? "metabase")))))
      (testing "an instance that already bought the add-on keeps it"
        (mt/with-premium-features #{:metabase-ai-managed}
          (is (true? (llm.provider/type-available? "metabase")))))
      (testing "an instance with no claim on the managed provider cannot select it"
        (mt/with-premium-features #{}
          (is (false? (llm.provider/type-available? "metabase"))))))))

(deftest connections-test
  (testing "stored connections are returned with a :db source"
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-db"})]]
      (is (= [{:key    "anthropic"
               :type   "anthropic"
               :name   "anthropic"
               :config {:api-key "sk-ant-db"}
               :source :db}]
             (llm.provider/connections)))))
  (testing "stored and env-derived connections are merged, stored first"
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-db"})]]
      (mt/with-temp-env-var-value! [mb-llm-openai-api-key "sk-env"]
        (is (= [["anthropic" :db] ["openai" :env]]
               (map (juxt :key :source) (llm.provider/connections)))))))
  (testing "the whole stored list is read-only when it comes from the environment"
    (mt/with-temp-env-var-value! [mb-llm-providers "[{\"key\":\"anthropic\",\"type\":\"anthropic\",\"name\":\"Anthropic\",\"config\":{\"api-key\":\"sk-ant-env\"}}]"]
      (is (= [["anthropic" :env]]
             (map (juxt :key :source) (llm.provider/connections)))))))

(deftest connections-synthesized-from-the-environment-test
  (testing "the single-provider environment variables synthesize read-only connections keyed by provider type"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key      "sk-ant-env"
                                    mb-llm-anthropic-api-base-url "https://env.example.com"]
        (is (= [{:key        "anthropic"
                 :type       "anthropic"
                 :name       "Anthropic"
                 :source     :env
                 :env-vars   #{"MB_LLM_ANTHROPIC_API_KEY" "MB_LLM_ANTHROPIC_API_BASE_URL"}
                 :env-fields #{:api-key :base-url}
                 :config     {:api-key "sk-ant-env" :base-url "https://env.example.com"}}]
               (llm.provider/connections))))))
  (testing "a variable that is not a credential shadows but does not create: alone it makes no connection"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-base-url "https://env.example.com"]
        (is (= [] (llm.provider/connections))))))
  (testing "vLLM's base URL is its credential, so it alone synthesizes a connection"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temp-env-var-value! [mb-llm-vllm-api-base-url "http://vllm.internal:8000/v1"]
        (is (= [{:key        "vllm"
                 :type       "vllm"
                 :name       "vLLM"
                 :source     :env
                 :env-vars   #{"MB_LLM_VLLM_API_BASE_URL"}
                 :env-fields #{:base-url}
                 :config     {:base-url "http://vllm.internal:8000/v1"}}]
               (llm.provider/connections))))
      (testing "and a key on its own does not: it authenticates nothing without a server to send it to"
        (mt/with-temp-env-var-value! [mb-llm-vllm-api-key "local-dev-key"]
          (is (= [] (llm.provider/connections)))))))
  (testing "a metabase/ reference pinned by the environment synthesizes the managed connection it names"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temp-env-var-value! [mb-llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"]
        (is (=? [{:key "metabase" :type "metabase" :source :env}]
                (llm.provider/connections)))
        (is (=? {:connection-key "metabase" :type "anthropic" :ai-proxy? true}
                (llm.provider/resolve-model-ref "metabase/anthropic/claude-sonnet-4-6")))))))

(deftest connections-shadowed-by-the-environment-test
  (testing "the environment shadows a stored connection with the same key field by field, not wholesale"
    (mt/with-temporary-setting-values [llm-providers [(connection "google" "google"
                                                                  {:service-account-key "{\"type\":\"db\"}"
                                                                   :project-id          "stored-project"
                                                                   :location            "us-central1"})]]
      (mt/with-temp-env-var-value! [mb-llm-google-service-account-key "{\"type\":\"env\"}"]
        (is (= [{:key        "google"
                 :type       "google"
                 :name       "google"
                 ;; the env credential wins; everything the environment does not supply stays as stored
                 :config     {:service-account-key "{\"type\":\"env\"}"
                              :project-id          "stored-project"
                              :location            "us-central1"}
                 :env-vars   #{"MB_LLM_GOOGLE_SERVICE_ACCOUNT_KEY"}
                 :env-fields #{:service-account-key}
                 :source     :db}]
               (llm.provider/connections))))))
  (testing "a lone base-url variable reaches the stored connection's base URL"
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-db"})]]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-base-url "https://env.example.com"]
        (is (= {:api-key "sk-ant-db" :base-url "https://env.example.com"}
               (llm.provider/credentials "anthropic")))))))

(deftest connections-drop-a-stored-base-url-an-env-credential-would-reach-test
  (testing (str "A base URL saved through the API is not where an environment-supplied credential gets sent: the "
                "credential may have arrived after the URL, which is the one order the set-time check cannot see.")
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic"
                                                                  {:api-key  "sk-ant-db"
                                                                   :base-url "https://planted.example.com"})]]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key "sk-ant-env"]
        (testing "the type's default base URL stands in, and the stored one is left editable rather than owned"
          (is (= {:api-key "sk-ant-env"} (llm.provider/credentials "anthropic")))
          (is (= #{:api-key} (:env-fields (llm.provider/connection "anthropic")))))
        (testing "and the stored list still holds it, so removing the variable brings it back"
          (is (= "https://planted.example.com"
                 (get-in (first (llm.provider/stored-connections)) [:config :base-url])))))))
  (testing "the environment's own base URL is used, since the operator supplied both halves"
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic"
                                                                  {:base-url "https://planted.example.com"})]]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key      "sk-ant-env"
                                    mb-llm-anthropic-api-base-url "https://env.example.com"]
        (is (= {:api-key "sk-ant-env" :base-url "https://env.example.com"}
               (llm.provider/credentials "anthropic"))))))
  (testing "a connection the llm-providers variable supplies is the operator's too, so its base URL stands"
    (mt/with-temp-env-var-value! [mb-llm-providers (str "[{\"key\":\"anthropic\",\"type\":\"anthropic\","
                                                        "\"name\":\"Anthropic\","
                                                        "\"config\":{\"base-url\":\"https://operator.example.com\"}}]")
                                  mb-llm-anthropic-api-key "sk-ant-env"]
      (is (= {:api-key "sk-ant-env" :base-url "https://operator.example.com"}
             (llm.provider/credentials "anthropic")))))
  (testing "a type whose base URL has no default is left unusable rather than pointed anywhere"
    (mt/with-temporary-setting-values [llm-providers [(connection "vllm" "vllm"
                                                                  {:base-url "https://planted.example.com/v1"})]]
      (mt/with-temp-env-var-value! [mb-llm-vllm-api-key "vllm-env-key"]
        (is (= {:api-key "vllm-env-key"} (llm.provider/credentials "vllm")))
        (is (false? (llm.provider/connection-usable? "vllm")))))))

(deftest stored-connections-keeps-a-connection-the-environment-shadows-test
  (testing (str "The stored list keeps the credentials the environment shadows, so writes rebuild from here and "
                "removing the env var brings the stored value back.")
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-db"})]]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key "sk-ant-env"]
        (is (= [{:key "anthropic" :type "anthropic" :name "anthropic" :config {:api-key "sk-ant-db"}}]
               (llm.provider/stored-connections)))
        (is (= "sk-ant-env" (:api-key (llm.provider/credentials "anthropic"))))))))

(deftest connection-lookup-test
  (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-db"})
                                                    (connection "openai" "openai" {:api-key ""})]]
    (testing "a connection is found by key"
      (is (=? {:key "anthropic" :type "anthropic"} (llm.provider/connection "anthropic")))
      (is (= {:api-key "sk-ant-db"} (llm.provider/credentials "anthropic"))))
    (testing "an unknown key has no connection and no credentials"
      (is (nil? (llm.provider/connection "nope")))
      (is (nil? (llm.provider/credentials "nope"))))
    (testing "a connection is usable only when its config is complete"
      (is (true? (llm.provider/connection-usable? "anthropic")))
      (is (false? (llm.provider/connection-usable? "openai")))
      (is (false? (llm.provider/connection-usable? "nope"))))))

(deftest set-connections!-test
  (mt/with-temporary-setting-values [llm-providers []]
    (llm.provider/set-connections! [(assoc (connection "anthropic" "anthropic" {:api-key "sk-ant-db"}) :source :db)])
    (testing "the derived :source key is not persisted"
      (is (= [{:key "anthropic" :type "anthropic" :name "anthropic" :config {:api-key "sk-ant-db"}}]
             (vec (llm.settings/llm-providers)))))))

(deftest ^:parallel model-ref-parsing-test
  (testing "a model reference splits into its connection key and everything after it"
    (is (= "anthropic" (llm.provider/model-ref->connection-key "anthropic/claude-sonnet-4-6")))
    (is (= "claude-sonnet-4-6" (llm.provider/model-ref->model "anthropic/claude-sonnet-4-6")))
    (is (= "openrouter" (llm.provider/model-ref->connection-key "openrouter/anthropic/claude-haiku-4-5")))
    (is (= "anthropic/claude-haiku-4-5" (llm.provider/model-ref->model "openrouter/anthropic/claude-haiku-4-5"))))
  (testing "the managed connection keeps its wire family in the model part"
    (is (true? (llm.provider/managed-model-ref? "metabase/anthropic/claude-sonnet-4-6")))
    (is (false? (llm.provider/managed-model-ref? "anthropic/claude-sonnet-4-6")))
    (is (false? (llm.provider/managed-model-ref? nil)))
    (is (= "metabase" (llm.provider/model-ref->connection-key "metabase/anthropic/claude-sonnet-4-6")))
    (is (= "anthropic/claude-sonnet-4-6" (llm.provider/model-ref->model "metabase/anthropic/claude-sonnet-4-6"))))
  (testing "the managed routing prefix can be stripped, and stripping is a no-op for everything else"
    (is (= "anthropic/claude-sonnet-4-6" (llm.provider/strip-managed-prefix "metabase/anthropic/claude-sonnet-4-6")))
    (is (= "anthropic/claude-sonnet-4-6" (llm.provider/strip-managed-prefix "anthropic/claude-sonnet-4-6")))
    (is (nil? (llm.provider/strip-managed-prefix nil))))
  (testing "a reference with no model part has no model"
    (is (nil? (llm.provider/model-ref->model "anthropic")))
    (is (nil? (llm.provider/model-ref->connection-key nil)))))

(deftest resolve-model-ref-test
  (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-db"})
                                                    (connection "openrouter" "openrouter" {:api-key "sk-or-v1-db"})
                                                    (connection "metabase" "metabase")]]
    (testing "a direct connection resolves to its own type, model, and stored credentials"
      (is (= {:connection-key "anthropic"
              :type           "anthropic"
              :model          "claude-opus-4-1"
              :credentials    {:api-key "sk-ant-db" :base-url "https://api.anthropic.com"}
              :ai-proxy?      false}
             (llm.provider/resolve-model-ref "anthropic/claude-opus-4-1"))))
    (testing "only the first segment names the connection, so a vendor-prefixed model stays intact"
      (is (= {:connection-key "openrouter"
              :type           "openrouter"
              :model          "anthropic/claude-haiku-4-5"
              :credentials    {:api-key "sk-or-v1-db" :base-url "https://openrouter.ai/api"}
              :ai-proxy?      false}
             (llm.provider/resolve-model-ref "openrouter/anthropic/claude-haiku-4-5"))))
    (testing "the managed connection resolves to the wire family named by the model and routes through the proxy"
      (is (= {:connection-key "metabase"
              :type           "anthropic"
              :model          "claude-sonnet-4-6"
              :credentials    nil
              :ai-proxy?      true}
             (llm.provider/resolve-model-ref "metabase/anthropic/claude-sonnet-4-6"))))
    (testing "an unknown connection key resolves to nil rather than a half-built request"
      (is (nil? (llm.provider/resolve-model-ref "nope/some-model")))
      (is (nil? (llm.provider/resolve-model-ref "openai/gpt-5.4")))
      (is (nil? (llm.provider/resolve-model-ref nil))))))

(deftest with-field-defaults-normalizes-base-urls-test
  (testing "a base URL keeps no trailing slash, whichever source it comes from, so joining a path cannot double the /"
    (is (= "https://api.mistral.ai/v1"
           (:base-url (llm.provider/with-field-defaults "mistral" {:base-url "https://api.mistral.ai/v1/"}))))
    (is (= "https://self-hosted.example"
           (:base-url (llm.provider/with-field-defaults "anthropic" {:base-url " https://self-hosted.example// "}))))
    (testing "including one supplied by the environment"
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic"
                                                                    {:api-key "sk-ant-db"})]]
        (mt/with-temp-env-var-value! [mb-llm-anthropic-api-base-url "https://env.example/"]
          (is (= "https://env.example"
                 (:base-url (:credentials (llm.provider/resolve-model-ref "anthropic/claude-opus-4-1"))))))))))

(deftest resolve-model-ref-fills-in-field-defaults-test
  (testing "a connection that never set an optional field still resolves with the registry default, so the adapter
            never has to reach back into the single-provider settings for it"
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-db"})
                                                      (connection "bedrock" "bedrock"
                                                                  {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                                   :secret-access-key "wJalrXUtnFEMI"})]]
      (is (= {:api-key "sk-ant-db" :base-url "https://api.anthropic.com"}
             (:credentials (llm.provider/resolve-model-ref "anthropic/claude-opus-4-1"))))
      (is (= "us-east-1"
             (:region (:credentials (llm.provider/resolve-model-ref "bedrock/anthropic.claude-opus-4-8")))))))
  (testing "a value the admin did set is left alone"
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic"
                                                                  {:api-key  "sk-ant-db"
                                                                   :base-url "https://proxy.internal"})]]
      (is (= {:api-key "sk-ant-db" :base-url "https://proxy.internal"}
             (:credentials (llm.provider/resolve-model-ref "anthropic/claude-opus-4-1"))))))
  (testing "the single-provider env connection carries its own base URL rather than borrowing another connection's"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key      "sk-ant-env"
                                    mb-llm-anthropic-api-base-url "https://env.example"]
        (is (= {:api-key "sk-ant-env" :base-url "https://env.example"}
               (:credentials (llm.provider/resolve-model-ref "anthropic/claude-opus-4-1"))))))))

(deftest ^:parallel provider-type-names-are-mirrored-on-the-frontend-test
  (testing (str "The frontend mirrors this set by hand as `LlmProviderTypeName` in "
                "frontend/src/metabase-types/api/llm.ts, and keys `PROVIDER_LOGOS` in "
                "frontend/src/metabase/metabot/components/AIProviderConfigurationForm/ProviderTypeIcon.tsx on it "
                "so a type without a decided logo fails to compile. Nothing links the two, so adding a type here "
                "without updating them ships a provider that silently falls back to the generic icon. Update "
                "both, then this list.")
    (is (= #{"anthropic" "openai" "openrouter" "mistral" "zai" "moonshot" "deepseek" "google" "azure" "bedrock"
             "vllm" "metabase"}
           (into #{} (map :type) (llm.provider/provider-types))))))

(deftest ^:parallel provider-types-test
  (testing "every registered type is addressable by name, and unknown names are not"
    (is (= (map :type (llm.provider/provider-types))
           (map #(:type (llm.provider/provider-type (:type %))) (llm.provider/provider-types))))
    (is (nil? (llm.provider/provider-type "evilai"))))
  (testing "only the Metabase provider is managed"
    (is (true? (llm.provider/managed-type? "metabase")))
    (is (= "metabase" llm.provider/managed-connection-key))
    (is (false? (llm.provider/managed-type? "anthropic")))
    (is (false? (llm.provider/managed-type? "evilai"))))
  (testing "secret field keys cover exactly the password inputs"
    (is (= #{:api-key} (llm.provider/secret-field-keys "anthropic")))
    (is (= #{:api-key} (llm.provider/secret-field-keys "azure")))
    (is (= #{:access-key-id :secret-access-key :session-token} (llm.provider/secret-field-keys "bedrock")))
    (is (= #{:api-key} (llm.provider/secret-field-keys "vllm")))
    (testing "google's service account key is a file field, but it is the whole credential"
      (is (= #{:service-account-key :oauth-access-token} (llm.provider/secret-field-keys "google"))))
    (is (= #{} (llm.provider/secret-field-keys "metabase"))))
  (testing "every type's default model, which is what a first connection of that type gets selected for it"
    (is (= {"anthropic"  "claude-sonnet-4-6"
            "openai"     "gpt-5.4"
            "openrouter" "anthropic/claude-sonnet-4.6"
            "mistral"    "mistral-medium-3-5"
            "zai"        "glm-5.2"
            "moonshot"   "kimi-k3"
            "deepseek"   "deepseek-v4-pro"
            "google"     "google/gemini-3.5-flash"
            ;; azure's models are deployment names the admin chooses, so there is nothing to default to
            "azure"      nil
            "bedrock"    "anthropic.claude-opus-4-8"
            ;; nor is there for vLLM, which serves whatever the operator loaded: connecting adopts the model
            ;; its probe exercised
            "vllm"       nil
            "metabase"   "anthropic/claude-sonnet-4-6"}
           (into {} (map (juxt :type #(llm.provider/default-model (:type %)))) (llm.provider/provider-types))))
    (is (nil? (llm.provider/default-model "evilai"))))
  (testing (str "every type's mini model, which short utility calls like conversation titles fall back to. A type "
                "that grows a mini model, or loses one, has to be spelled out here — a missing `:mini-model` reads "
                "as nil and quietly sends titles to the full-size model instead.")
    (is (= {"anthropic"  "claude-haiku-4-5-20251001"
            "openai"     "gpt-5.4-mini"
            "openrouter" "anthropic/claude-haiku-4.5"
            "mistral"    "mistral-medium-3-5"
            "zai"        "glm-5.2"
            "moonshot"   "kimi-k3"
            "deepseek"   "deepseek-v4-flash"
            "google"     nil
            "azure"      nil
            "bedrock"    "anthropic.claude-haiku-4-5"
            ;; a vLLM server serves the one model the operator loaded, so there is no cheaper tier to fall back to
            "vllm"       nil
            "metabase"   nil}
           (into {} (map (juxt :type #(llm.provider/mini-model (:type %)))) (llm.provider/provider-types))))
    (is (nil? (llm.provider/mini-model "evilai"))))
  (testing "every type other than the managed one is always available"
    (is (true? (llm.provider/type-available? "anthropic")))
    (is (false? (llm.provider/type-available? "evilai")))))
