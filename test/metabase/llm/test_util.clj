(ns metabase.llm.test-util
  (:require
   [metabase.llm.settings :as llm.settings]
   [metabase.test.util :as tu]))

(set! *warn-on-reflection* true)

(def azure-base-url "https://azure-test.services.ai.azure.com/openai")

(def ^:private dummy-configs
  {"anthropic"  {:api-key "sk-ant-test"}
   "openai"     {:api-key "sk-test"}
   "openrouter" {:api-key "sk-or-v1-test"}
   "mistral"    {:api-key "mistral-test-key"}
   "zai"        {:api-key "zai-test-key"}
   "moonshot"   {:api-key "sk-moonshot-test-key"}
   "deepseek"   {:api-key "sk-deepseek-test-key"}
   "google"     {:oauth-access-token "ya29.test-token"
                 :project-id         "my-project"}
   "azure"      {:api-key         "azure-test-key"
                 :base-url        azure-base-url
                 :model-family    "openai"
                 :deployment-name "gpt-4.1-mini"}
   "bedrock"    {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                 :secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
                 :region            "us-east-1"}
   "vllm"       {:base-url "http://vllm.internal:8000/v1"}
   "metabase"   {}})

(defn connection
  ([type-name]
   (connection type-name nil))
  ([type-name config-overrides]
   {:key    type-name
    :type   type-name
    :name   type-name
    :config (merge (get dummy-configs type-name) config-overrides)}))

(def default-connections
  (mapv connection ["anthropic" "openai" "openrouter" "mistral" "zai" "moonshot" "deepseek" "google" "azure"
                    "bedrock" "metabase"]))

(defn do-with-connections!
  [connections thunk]
  (tu/with-temporary-setting-values [llm.settings/llm-providers (vec connections)]
    (thunk)))

(defmacro with-connections
  {:style/indent 1}
  [connections & body]
  `(do-with-connections! ~connections (fn [] ~@body)))

(defmacro with-default-connections
  {:style/indent 0}
  [& body]
  `(with-connections default-connections ~@body))
