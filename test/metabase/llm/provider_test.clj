(ns metabase.llm.provider-test
  (:require
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

(deftest validate-config!-test
  (testing "an unknown provider type is rejected"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Unknown provider type"
         (llm.provider/validate-config! "gemini" {:api-key "whatever"}))))
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
    (is (nil? (llm.provider/validate-config! "azure" {:api-key  "azure-key"
                                                      :base-url "https://r.services.ai.azure.com/openai"}))))
  (testing "the managed type declares no fields, so any config validates"
    (is (nil? (llm.provider/validate-config! "metabase" {})))))

(deftest config-complete?-test
  (testing "API-key types are complete exactly when the key is non-blank"
    (doseq [type ["anthropic" "openai" "openrouter"]]
      (testing type
        (is (true? (llm.provider/config-complete? type {:api-key "sk-whatever"})))
        (is (false? (llm.provider/config-complete? type {:api-key ""})))
        (is (false? (llm.provider/config-complete? type {:api-key nil})))
        (is (false? (llm.provider/config-complete? type nil))))))
  (testing "azure needs both an API key and a base URL"
    (is (true? (llm.provider/config-complete? "azure" {:api-key  "azure-key"
                                                       :base-url "https://r.services.ai.azure.com/openai"})))
    (is (false? (llm.provider/config-complete? "azure" {:api-key "azure-key"})))
    (is (false? (llm.provider/config-complete? "azure" {:api-key "azure-key" :base-url "  "})))
    (is (false? (llm.provider/config-complete? "azure" {:base-url "https://r.services.ai.azure.com/openai"}))))
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

(deftest connections-test
  (testing "stored connections are returned with a :db source"
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-db"})]]
      (is (= [{:key    "anthropic"
               :type   "anthropic"
               :name   "anthropic"
               :config {:api-key "sk-ant-db"}
               :source :db}]
             (llm.provider/connections)))))
  (testing "the single-provider environment variables synthesize read-only connections keyed by provider type"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key      "sk-ant-env"
                                    mb-llm-anthropic-api-base-url "https://env.example.com"]
        (is (= [{:key      "anthropic"
                 :type     "anthropic"
                 :name     "Anthropic"
                 :source   :env
                 :env-vars #{"MB_LLM_ANTHROPIC_API_KEY" "MB_LLM_ANTHROPIC_API_BASE_URL"}
                 :config   {:api-key "sk-ant-env" :base-url "https://env.example.com"}}]
               (llm.provider/connections))))))
  (testing "stored and env-derived connections are merged, stored first"
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-db"})]]
      (mt/with-temp-env-var-value! [mb-llm-openai-api-key "sk-env"]
        (is (= [["anthropic" :db] ["openai" :env]]
               (map (juxt :key :source) (llm.provider/connections)))))))
  (testing "the environment wins over a stored connection with the same key, replacing it in place rather than adding a duplicate"
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-db"})]]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key "sk-ant-env"]
        (is (= [{:key      "anthropic"
                 :type     "anthropic"
                 :name     "Anthropic"
                 :config   {:api-key "sk-ant-env" :base-url "https://api.anthropic.com"}
                 :env-vars #{"MB_LLM_ANTHROPIC_API_KEY"}
                 :source   :env}]
               (llm.provider/connections))))))
  (testing "the whole stored list is read-only when it comes from the environment"
    (mt/with-temp-env-var-value! [mb-llm-providers "[{\"key\":\"anthropic\",\"type\":\"anthropic\",\"name\":\"Anthropic\",\"config\":{\"api-key\":\"sk-ant-env\"}}]"]
      (is (= [["anthropic" :env]]
             (map (juxt :key :source) (llm.provider/connections)))))))

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
              :credentials    {:api-key "sk-ant-db"}
              :ai-proxy?      false}
             (llm.provider/resolve-model-ref "anthropic/claude-opus-4-1")))
      (is (false? (llm.provider/proxied-model-ref? "anthropic/claude-opus-4-1"))))
    (testing "only the first segment names the connection, so a vendor-prefixed model stays intact"
      (is (= {:connection-key "openrouter"
              :type           "openrouter"
              :model          "anthropic/claude-haiku-4-5"
              :credentials    {:api-key "sk-or-v1-db"}
              :ai-proxy?      false}
             (llm.provider/resolve-model-ref "openrouter/anthropic/claude-haiku-4-5"))))
    (testing "the managed connection resolves to the wire family named by the model and routes through the proxy"
      (is (= {:connection-key "metabase"
              :type           "anthropic"
              :model          "claude-sonnet-4-6"
              :credentials    nil
              :ai-proxy?      true}
             (llm.provider/resolve-model-ref "metabase/anthropic/claude-sonnet-4-6")))
      (is (true? (llm.provider/proxied-model-ref? "metabase/anthropic/claude-sonnet-4-6"))))
    (testing "an unknown connection key resolves to nil rather than a half-built request"
      (is (nil? (llm.provider/resolve-model-ref "nope/some-model")))
      (is (nil? (llm.provider/resolve-model-ref "openai/gpt-5.4")))
      (is (nil? (llm.provider/resolve-model-ref nil)))
      (is (false? (llm.provider/proxied-model-ref? "nope/some-model"))))))

(deftest ^:parallel provider-types-test
  (testing "every registered type is addressable by name, and unknown names are not"
    (is (= (map :type (llm.provider/provider-types))
           (map #(:type (llm.provider/provider-type (:type %))) (llm.provider/provider-types))))
    (is (nil? (llm.provider/provider-type "gemini"))))
  (testing "only the Metabase provider is managed"
    (is (true? (llm.provider/managed-type? "metabase")))
    (is (= "metabase" llm.provider/managed-connection-key))
    (is (false? (llm.provider/managed-type? "anthropic")))
    (is (false? (llm.provider/managed-type? "gemini"))))
  (testing "secret field keys cover exactly the password inputs"
    (is (= #{:api-key} (llm.provider/secret-field-keys "anthropic")))
    (is (= #{:api-key} (llm.provider/secret-field-keys "azure")))
    (is (= #{:access-key-id :secret-access-key :session-token} (llm.provider/secret-field-keys "bedrock")))
    (is (= #{} (llm.provider/secret-field-keys "metabase"))))
  (testing "azure has no default model because its models are deployment names the admin chooses"
    (is (= "claude-sonnet-4-6" (llm.provider/default-model "anthropic")))
    (is (nil? (llm.provider/default-model "azure")))
    (is (nil? (llm.provider/default-model "gemini"))))
  (testing "every type other than the managed one is always available"
    (is (true? (llm.provider/type-available? "anthropic")))
    (is (false? (llm.provider/type-available? "gemini")))))

(deftest db-stored-legacy-connections-test
  (testing "a legacy credential setting stored in the app DB implies a connection keyed by its provider type"
    (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key nil
                                  mb-llm-openai-api-key    nil]
      (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-stored"
                                         llm-openai-api-key    nil]
        (is (= [{:key    "anthropic"
                 :type   "anthropic"
                 :name   "Anthropic"
                 :config {:api-key "sk-ant-stored"}}]
               (llm.provider/db-stored-legacy-connections))))))
  (testing "an incomplete legacy credential set does not imply a connection"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-access-key-id     nil
                                  mb-llm-bedrock-secret-access-key nil]
      (mt/with-temporary-setting-values [llm-anthropic-api-key         nil
                                         llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                         llm-bedrock-secret-access-key nil]
        (is (= [] (llm.provider/db-stored-legacy-connections)))))))
