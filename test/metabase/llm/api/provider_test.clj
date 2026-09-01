(ns metabase.llm.api.provider-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.llm.api.provider :as llm.api.provider]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(defn- connection
  ([conn-key type]
   (connection conn-key type {}))
  ([conn-key type config]
   {:key conn-key :type type :name conn-key :config config}))

(defn- stored-config
  [conn-key]
  (:config (llm.provider/connection conn-key)))

(defn- rejected-credentials
  [message]
  (fn [& _]
    (throw (ex-info message {:api-error true :status-code 401}))))

(deftest provider-types-test
  (testing "every provider type is listed with the credential fields a connection needs"
    (let [types (mt/user-http-request :crowberto :get 200 "llm/provider-types")]
      (is (= #{"anthropic" "openai" "openrouter" "mistral" "zai" "moonshot" "deepseek" "google" "azure" "bedrock"
               "vllm" "metabase"}
             (set (map :type types))))
      (is (= ["anthropic" "openai" "openrouter" "mistral" "zai" "moonshot" "deepseek" "google" "azure" "bedrock"
              "vllm"]
             (remove #{"metabase"} (map :type types)))
          "the bring-your-own-key providers keep their registry order")
      (is (=? {:type          "anthropic"
               :label         "Anthropic"
               :managed       false
               :available     true
               :default_model "claude-sonnet-4-6"
               :fields        [{:key      "api-key"
                                :label    "API key"
                                :type     "password"
                                :required true
                                :advanced false
                                :prefix   "sk-ant-"
                                :docs_url "https://console.anthropic.com/settings/keys"}
                               {:key      "base-url"
                                :label    "API base URL"
                                :type     "text"
                                :required false
                                :advanced true
                                :default  "https://api.anthropic.com"}]}
              (->> types (filter #(= "anthropic" (:type %))) first)))
      (testing "select fields carry their options"
        (is (some? (->> types
                        (filter #(= "bedrock" (:type %)))
                        first
                        :fields
                        (filter #(= "select" (:type %)))
                        first
                        :options))))
      (testing "the API-key prefixes reach the client, which uses them to recognize a pasted key"
        (is (= {"anthropic"  "sk-ant-"
                "openai"     "sk-"
                "openrouter" "sk-or-v1-"}
               (into {}
                     (keep (fn [{:keys [type fields]}]
                             (when-let [prefix (some :prefix fields)]
                               [type prefix])))
                     types))))
      (testing "`advanced` marks the fields an admin can ignore, which is not the same as the optional ones:
                Bedrock's region has a default but still decides model availability and data residency, so it
                stays up front while the session token — only used for temporary credentials — does not"
        (is (= {"access-key-id"     false
                "secret-access-key" false
                "region"            false
                "session-token"     true}
               (->> types
                    (filter #(= "bedrock" (:type %)))
                    first
                    :fields
                    (into {} (map (juxt :key :advanced))))))))))

(deftest provider-types-google-fields-test
  (testing "Google's credentials hang off the authentication method it is asked for, and its models are a fixed list"
    (let [google (->> (mt/user-http-request :crowberto :get 200 "llm/provider-types")
                      (filter #(= "google" (:type %)))
                      first)
          fields (into {} (map (juxt :key identity)) (:fields google))]
      (is (= ["project-id" "location" "auth-method" "service-account-key" "oauth-access-token" "base-url"]
             (map :key (:fields google))))
      (is (=? {:type    "segmented"
               :default "service-account-key"
               :options [{:value "service-account-key" :label "Service account key"}
                         {:value "oauth-token" :label "OAuth token"}]}
              (fields "auth-method")))
      (is (=? {:type      "file"
               :show_when {:field "auth-method" :value "service-account-key"}}
              (fields "service-account-key")))
      (is (=? {:type      "password"
               :show_when {:field "auth-method" :value "oauth-token"}}
              (fields "oauth-access-token")))
      (testing "the models are the fixed catalog every connection of the type offers, not a field of its own"
        (is (nil? (fields "model")))
        (is (= "google/gemini-3.5-flash" (:default_model google)))
        (testing "and the catalog rides along so the connection form can offer the model to validate against"
          (is (= [{:id "google/gemini-3.5-flash" :display_name "Gemini 3.5 Flash"}
                  {:id "google/gemini-3.6-flash" :display_name "Gemini 3.6 Flash"}
                  {:id "google/gemini-3.7-flash" :display_name "Gemini 3.7 Flash"}
                  {:id "anthropic/claude-fable-5" :display_name "Claude Fable 5"}
                  {:id "anthropic/claude-opus-5" :display_name "Claude Opus 5"}
                  {:id "anthropic/claude-opus-4-6" :display_name "Claude Opus 4.6"}
                  {:id "anthropic/claude-sonnet-5" :display_name "Claude Sonnet 5"}
                  {:id "anthropic/claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}
                  {:id "anthropic/claude-haiku-4-5@20251001" :display_name "Claude Haiku 4.5"}]
                 (:models google)))))
      (testing "the alternative credential groups ride along so the form knows when the config is complete"
        (is (= [["service-account-key"] ["oauth-access-token" "project-id"]]
               (:required_any google)))))))

(deftest provider-types-managed-availability-test
  (letfn [(managed [types] (->> types (filter #(= "metabase" (:type %))) first))]
    (testing "the managed provider leads the list when the LLM proxy is configured"
      (mt/with-premium-features #{:metabase-ai-managed}
        (mt/with-temporary-setting-values [llm-proxy-base-url "https://proxy.example.com"]
          (let [types (mt/user-http-request :crowberto :get 200 "llm/provider-types")]
            (is (=? {:type "metabase" :managed true :available true} (managed types)))
            (is (= "metabase" (:type (first types))))))))
    (testing "without a proxy to route through it is unavailable and does not lead"
      (mt/with-premium-features #{:metabase-ai-managed}
        (mt/with-temporary-setting-values [llm-proxy-base-url nil]
          (let [types (mt/user-http-request :crowberto :get 200 "llm/provider-types")]
            (is (=? {:type "metabase" :managed true :available false} (managed types)))
            (is (not= "metabase" (:type (first types))))))))))

(deftest list-providers-masks-secrets-test
  (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic"
                                                                {:api-key  "sk-ant-secret"
                                                                 :base-url "https://api.anthropic.com"})
                                                    (connection "openai" "openai" {:api-key ""})]]
    (testing "secrets come back masked and non-secret fields come back as they are"
      (is (= [{:key        "anthropic"
               :type       "anthropic"
               :name       "anthropic"
               :source     "db"
               :usable     true
               :env_vars   []
               :env_fields []
               :config     {:api-key "**********et" :base-url "https://api.anthropic.com"}}
              {:key        "openai"
               :type       "openai"
               :name       "openai"
               :source     "db"
               :usable     false
               :env_vars   []
               :env_fields []
               :config     {:api-key ""}}]
             (mt/user-http-request :crowberto :get 200 "llm/providers"))))))

(deftest list-providers-marks-env-connections-test
  (testing "a connection synthesized from the single-provider environment variables is reported as read-only"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key "sk-ant-env"]
        (is (= [{:key        "anthropic"
                 :type       "anthropic"
                 :name       "Anthropic"
                 :source     "env"
                 :usable     true
                 :env_vars   ["MB_LLM_ANTHROPIC_API_KEY"]
                 :env_fields ["api-key"]
                 ;; only what the environment supplies: the base URL's registry default is filled in when the
                 ;; connection is resolved for a request, not stored on it
                 :config     {:api-key "**********nv"}}]
               (mt/user-http-request :crowberto :get 200 "llm/providers")))))))

(deftest list-providers-marks-env-shadowed-fields-test
  (testing "a stored connection with an env-shadowed field stays editable, with just that field marked"
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic"
                                                                  {:api-key "sk-ant-stored"})]]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-base-url "https://env.example.com"]
        (is (=? [{:key        "anthropic"
                  :source     "db"
                  :env_vars   ["MB_LLM_ANTHROPIC_API_BASE_URL"]
                  :env_fields ["base-url"]
                  :config     {:api-key "**********ed" :base-url "https://env.example.com"}}]
                (mt/user-http-request :crowberto :get 200 "llm/providers")))))))

(deftest create-verifies-credentials-before-saving-test
  (mt/with-temporary-setting-values [llm-providers []]
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                  (fn [provider {:keys [credentials]}]
                                    (swap! calls conj [provider credentials])
                                    (is (empty? (llm.provider/connections))
                                        "credentials are verified before the connection is saved")
                                    {:models [{:id "claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}]})]
        (testing "a created connection defaults its key and name to its provider type"
          (is (= {:key        "anthropic"
                  :type       "anthropic"
                  :name       "Anthropic"
                  :source     "db"
                  :usable     true
                  :env_vars   []
                  :env_fields []
                  :config     {:api-key "**********id"}}
                 (mt/user-http-request :crowberto :post 200 "llm/providers"
                                       {:type "anthropic" :config {:api-key "sk-ant-valid"}}))))
        (testing "the credentials are verified against the provider exactly once, unmasked and with the
                  registry defaults the adapter needs filled in"
          (is (= [["anthropic" {:api-key "sk-ant-valid" :base-url "https://api.anthropic.com"}]] @calls)))
        (testing "the unmasked credentials are what gets persisted"
          (is (= {:api-key "sk-ant-valid"} (stored-config "anthropic"))))))))

(deftest create-selects-a-model-for-the-first-connection-test
  (mt/with-dynamic-fn-redefs [metabot.self/list-models
                              (fn [& _] {:models [{:id "claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}]})]
    (testing "connecting the first provider leaves Metabot pointed at one of its models"
      (mt/with-temporary-setting-values [llm-providers []]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
          (mt/user-http-request :crowberto :post 200 "llm/providers"
                                {:type "anthropic" :config {:api-key "sk-ant-valid"}})
          (is (= "anthropic/claude-sonnet-4-6" (metabot.settings/llm-metabot-provider)))
          (is (true? (metabot.settings/llm-metabot-configured?))))))
    (testing "an explicitly requested model wins over the provider type's default"
      (mt/with-temporary-setting-values [llm-providers []]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
          (mt/user-http-request :crowberto :post 200 "llm/providers"
                                {:type  "anthropic"
                                 :model "claude-haiku-4-5"
                                 :config {:api-key "sk-ant-valid"}})
          (is (= "anthropic/claude-haiku-4-5" (metabot.settings/llm-metabot-provider))))))
    (testing "adding a second provider does not switch Metabot away from a working selection"
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic"
                                                                    {:api-key "sk-ant-stored"})]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider "anthropic/claude-opus-4-8"]
          (mt/user-http-request :crowberto :post 200 "llm/providers"
                                {:type "openai" :config {:api-key "sk-valid"}})
          (is (= "anthropic/claude-opus-4-8" (metabot.settings/llm-metabot-provider))))))))

(deftest create-vllm-connection-adopts-the-model-its-probe-exercised-test
  (testing (str "A vLLM server serves whatever the operator loaded, so there is no default model to select: "
                "connecting adopts the model the connect-time probe actually ran the agent-loop contract "
                "against, and records what that probe could only learn by running.")
    (let [opts (atom nil)]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                  (fn [_provider o]
                                    (reset! opts o)
                                    {:models         [{:id "vllm-test" :display_name "vllm-test"}
                                                      {:id "other" :display_name "other"}]
                                     :learned-config {:model-reasoning "true"
                                                      :probed-model    "vllm-test"}})]
        (mt/with-temporary-setting-values [llm-providers []]
          (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
            (is (=? {:key    "vllm"
                     :type   "vllm"
                     :usable true
                     :config {:base-url "http://vllm.internal:8000/v1"}}
                    (mt/user-http-request :crowberto :post 200 "llm/providers"
                                          {:type   "vllm"
                                           :config {:base-url "http://vllm.internal:8000/v1"}})))
            (testing "the connection is verified by a probe, not by a plain listing"
              (is (=? {:credentials {:base-url "http://vllm.internal:8000/v1"} :probe? true} @opts)))
            (is (= "vllm/vllm-test" (metabot.settings/llm-metabot-provider)))
            (testing "and what the probe learned is stored on the connection, where the request path reads it"
              (is (= {:base-url        "http://vllm.internal:8000/v1"
                      :model-reasoning "true"
                      :probed-model    "vllm-test"}
                     (stored-config "vllm")))
              (is (true? (metabot.settings/llm-metabot-supports-reasoning?))))))))))

(deftest create-vllm-connection-is-rejected-when-the-probe-fails-test
  (testing "a server that cannot drive the agent loop is not saved, so nothing points Metabot at it"
    (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                (fn [& _]
                                  (throw (ex-info "The vLLM server answered with text instead of calling a tool."
                                                  {:api-error true :status-code 400})))]
      (mt/with-temporary-setting-values [llm-providers []]
        (is (=? {:message "The vLLM server answered with text instead of calling a tool."}
                (mt/user-http-request :crowberto :post 400 "llm/providers"
                                      {:type   "vllm"
                                       :config {:base-url "http://vllm.internal:8000/v1"}})))
        (is (= [] (llm.provider/connections)))))))

(deftest create-vllm-connection-rejects-an-unreachable-base-url-test
  (testing (str "vLLM is the one provider whose base URL the admin types, so a typo has to come back as the "
                "adapter's message on the form — not as the 500 an untagged transport failure would produce.")
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (java.net.ConnectException. "Connection refused")))]
      (mt/with-temporary-setting-values [llm-providers []]
        (is (= (str "Could not reach the vLLM server at http://vllm.internal:8000/v1. "
                    "Check that it is running and that the base URL is correct.")
               (:message (mt/user-http-request :crowberto :post 400 "llm/providers"
                                               {:type   "vllm"
                                                :config {:base-url "http://vllm.internal:8000/v1"}}))))
        (is (= [] (llm.provider/connections)))))))

(deftest models-listing-does-not-probe-test
  (testing "listing models is a page load; only a write may spend a generation on the operator's server"
    (let [opts (atom nil)]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                  (fn [_provider o]
                                    (reset! opts o)
                                    {:models [{:id "vllm-test" :display_name "vllm-test"}]})]
        (mt/with-temporary-setting-values [llm-providers [(connection "vllm" "vllm"
                                                                      {:base-url "http://vllm.internal:8000/v1"})]]
          (is (=? [{:key "vllm" :models [{:id "vllm-test"}]}]
                  (mt/user-http-request :crowberto :get 200 "llm/models")))
          (is (not (:probe? @opts))))))))

(deftest update-verifies-against-the-model-the-connection-serves-test
  (testing (str "An edit that names no model is verified against the model this connection is actually serving "
                "Metabot, rather than whichever one the provider happens to list first.")
    (let [opts (atom nil)]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                  (fn [_provider o]
                                    (reset! opts o)
                                    {:models         [{:id "served-a" :display_name "served-a"}]
                                     :learned-config {:model-reasoning "false"
                                                      :probed-model    "served-b"}})]
        (mt/with-temporary-setting-values [llm-providers [(connection "vllm" "vllm"
                                                                      {:base-url        "http://old.internal:8000/v1"
                                                                       :model-reasoning "true"})]]
          (mt/with-temporary-raw-setting-values [llm-metabot-provider "vllm/served-b"]
            (mt/user-http-request :crowberto :put 200 "llm/providers/vllm"
                                  {:config {:base-url "http://vllm.internal:8000/v1"}})
            (is (=? {:model "served-b" :probe? true} @opts))
            (testing "and the probe's fresh verdict replaces the one the connection was carrying"
              (is (= {:base-url        "http://vllm.internal:8000/v1"
                      :model-reasoning "false"
                      :probed-model    "served-b"}
                     (stored-config "vllm")))
              (is (false? (metabot.settings/llm-metabot-supports-reasoning?))))))))))

(deftest update-adopts-the-model-a-vllm-server-is-serving-now-test
  (testing "vLLM still reports configured models even if no longer serving the previously :probed-model"
    (let [opts (atom nil)]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                  (fn [_provider {:keys [model] :as o}]
                                    (reset! opts o)
                                    (when model
                                      (throw (ex-info "The vLLM server is not serving Qwen/Qwen3-8B. It is serving: Qwen/Qwen3-32B."
                                                      {:api-error true :status-code 400})))
                                    {:models         [{:id "Qwen/Qwen3-32B" :display_name "Qwen/Qwen3-32B"}]
                                     :learned-config {:model-reasoning "false"
                                                      :probed-model    "Qwen/Qwen3-32B"}})]
        (mt/with-temporary-setting-values [llm-providers [(connection "vllm" "vllm"
                                                                      {:base-url        "http://old.internal:8000/v1"
                                                                       :model-reasoning "false"
                                                                       :probed-model    "Qwen/Qwen3-8B"})]]
          ;; Metabot points elsewhere, so nothing but the recorded probe names a model for this connection
          (mt/with-temporary-raw-setting-values [llm-metabot-provider "anthropic/claude-opus-4-8"]
            (mt/user-http-request :crowberto :put 200 "llm/providers/vllm"
                                  {:config {:base-url "http://vllm.internal:8000/v1"}})
            (testing "the recorded model is offered as a proposal the probe may decline, not as a request"
              (is (=? {:proposed-model "Qwen/Qwen3-8B" :probe? true} @opts))
              (is (not (contains? @opts :model))))
            (testing "and the connection records what the server is serving now"
              (is (= {:base-url        "http://vllm.internal:8000/v1"
                      :model-reasoning "false"
                      :probed-model    "Qwen/Qwen3-32B"}
                     (stored-config "vllm"))))))))))

(deftest update-still-verifies-against-a-model-the-client-names-test
  (testing "a model the admin picks is a request, and stays binding even though a recorded probe names another"
    (let [opts (atom nil)]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                  (fn [_provider o]
                                    (reset! opts o)
                                    {:models         [{:id "google/gemini-3.5-flash" :display_name "Gemini 3.5 Flash"}]
                                     :learned-config {:probed-model (:model o)}})]
        (mt/with-temporary-setting-values [llm-providers [(connection "google" "google"
                                                                      {:oauth-access-token "ya29.token"
                                                                       :project-id         "my-project"
                                                                       :probed-model       "anthropic/claude-sonnet-4-6"})]]
          (mt/user-http-request :crowberto :put 200 "llm/providers/google"
                                {:config {:oauth-access-token "ya29.token" :project-id "my-project"}
                                 :model  "google/gemini-3.7-flash"})
          (is (= "google/gemini-3.7-flash" (:model @opts))))))))

(deftest create-selects-a-model-composed-from-the-config-test
  (testing (str "Azure names its deployment in `:config` rather than listing models, and the form leaves a field it "
                "pre-filled with the registry default out of the payload, so the default has to be filled in before "
                "the model is composed — otherwise connecting Azure first leaves Metabot on nothing.")
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values [llm-providers []]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
          (mt/user-http-request :crowberto :post 200 "llm/providers"
                                {:type   "azure"
                                 :config {:api-key         "azure-key"
                                          :base-url        "https://r.services.ai.azure.com/openai"
                                          :deployment-name "gpt-4.1-mini"}})
          (is (= "azure/openai/gpt-4.1-mini" (metabot.settings/llm-metabot-provider))))))))

(deftest writes-keep-a-stored-connection-the-environment-shadows-test
  (testing (str "The environment wins on read, but it must not take the stored credentials with it: they are what "
                "the instance falls back to once the variable comes back off.")
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic"
                                                                    {:api-key "sk-ant-stored"})]]
        (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key "sk-ant-env"]
          (mt/user-http-request :crowberto :post 200 "llm/providers"
                                {:type "openai" :config {:api-key "sk-valid"}})
          (is (= [{:key "anthropic" :type "anthropic" :name "anthropic" :config {:api-key "sk-ant-stored"}}
                  {:key "openai" :type "openai" :name "OpenAI" :config {:api-key "sk-valid"}}]
                 (llm.provider/stored-connections))))
        (testing "and the shadowed connection stays editable, with the env-owned field left alone"
          (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key "sk-ant-env"]
            (is (=? {:name       "Renamed"
                     :env_fields ["api-key"]
                     ;; the response reflects what the connection runs on: the env value, masked
                     :config     {:api-key "**********nv"}}
                    (mt/user-http-request :crowberto :put 200 "llm/providers/anthropic"
                                          {:name   "Renamed"
                                           ;; the form echoes the mask of the env value for the disabled field;
                                           ;; it must not replace the stored credential
                                           :config {:api-key "**********nv"}})))
            (testing "while the stored credential the environment shadows is untouched"
              (is (= "sk-ant-stored"
                     (->> (llm.provider/stored-connections)
                          (filter #(= "anthropic" (:key %)))
                          first
                          :config
                          :api-key))))))))))

(deftest create-does-not-save-when-credentials-are-rejected-test
  (mt/with-temporary-setting-values [llm-providers []]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (rejected-credentials "Anthropic API key expired or invalid")]
      (is (=? {:message "Anthropic API key expired or invalid"}
              (mt/user-http-request :crowberto :post 400 "llm/providers"
                                    {:type "anthropic" :config {:api-key "sk-ant-nope"}})))
      (is (= [] (llm.provider/connections))))))

(deftest create-rejects-invalid-config-before-calling-the-provider-test
  (mt/with-temporary-setting-values [llm-providers []]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _]
                                                           (is false "should reject before verifying credentials"))]
      (testing "a missing required field is rejected"
        (is (=? {:message "API key is required for anthropic."
                 :field   "api-key"}
                (mt/user-http-request :crowberto :post 400 "llm/providers" {:type "anthropic" :config {}}))))
      (testing "a secret that does not match the type's prefix is rejected"
        (is (=? {:message "Invalid API key for anthropic. It must start with 'sk-ant-'."
                 :field   "api-key"}
                (mt/user-http-request :crowberto :post 400 "llm/providers"
                                      {:type "anthropic" :config {:api-key "sk-openai-shaped"}}))))
      (testing "an unknown provider type is rejected"
        (is (= "Unknown provider type \"evilai\"."
               (mt/user-http-request :crowberto :post 400 "llm/providers"
                                     {:type "evilai" :config {:api-key "whatever"}}))))
      (is (= [] (llm.provider/connections))))))

(deftest create-suffixes-a-colliding-key-test
  (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-first"})]]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (constantly {:models []})]
      (is (=? {:key "anthropic-2" :name "Anthropic (evals)"}
              (mt/user-http-request :crowberto :post 200 "llm/providers"
                                    {:type   "anthropic"
                                     :name   "Anthropic (evals)"
                                     :config {:api-key "sk-ant-second"}})))
      (is (= ["anthropic" "anthropic-2"] (map :key (llm.provider/connections))))
      (testing "the existing connection keeps its own credentials"
        (is (= {:api-key "sk-ant-first"} (stored-config "anthropic")))
        (is (= {:api-key "sk-ant-second"} (stored-config "anthropic-2")))))))

(deftest create-reserves-the-managed-key-test
  (testing (str "the metabase/ model-ref prefix means \"route through the AI proxy\", so no other provider type may "
                "hold the key that grants it")
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (constantly {:models []})]
        (is (= "The \"metabase\" connection key is reserved for the Metabase AI service."
               (mt/user-http-request :crowberto :post 400 "llm/providers"
                                     {:type   "anthropic"
                                      :key    "metabase"
                                      :config {:api-key "sk-ant-valid"}})))
        (testing "including a key that merely slugs to it"
          (is (= "The \"metabase\" connection key is reserved for the Metabase AI service."
                 (mt/user-http-request :crowberto :post 400 "llm/providers"
                                       {:type   "anthropic"
                                        :key    "Metabase!"
                                        :config {:api-key "sk-ant-valid"}}))))
        (is (= [] (llm.provider/connections))))))
  (testing "a rogue connection already holding the key blocks the managed provider instead of colliding with it"
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-temporary-setting-values [llm-providers      [(connection "metabase" "anthropic"
                                                                         {:api-key "sk-ant-squatter"})]
                                         llm-proxy-base-url "https://proxy.example.com"]
        (is (= "Another connection holds the \"metabase\" key. Remove it before connecting the Metabase AI service."
               (mt/user-http-request :crowberto :post 400 "llm/providers" {:type "metabase"})))))))

(deftest create-drops-blank-config-values-test
  (testing "a blank field is not part of the connection, so nothing later mistakes it for a configured value"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (constantly {:models []})]
        (mt/user-http-request :crowberto :post 200 "llm/providers"
                              {:type   "google"
                               :config {:auth-method        "oauth-token"
                                        :oauth-access-token "ya29.token"
                                        :project-id         "my-project"
                                        :service-account-key ""
                                        :location           "   "}})
        (is (= {:auth-method        "oauth-token"
                :oauth-access-token "ya29.token"
                :project-id         "my-project"}
               (stored-config "google")))))))

(deftest update-clears-the-credential-the-other-auth-method-used-test
  (testing "switching Google's authentication method blanks the old credential, and the blank is dropped rather than stored"
    (mt/with-temporary-setting-values [llm-providers [(connection "google" "google"
                                                                  {:auth-method         "service-account-key"
                                                                   :service-account-key "{\"type\":\"service_account\"}"})]]
      (let [probed (atom nil)]
        (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [credentials]}]
                                                               (reset! probed credentials)
                                                               {:models []})]
          (mt/user-http-request :crowberto :put 200 "llm/providers/google"
                                {:config {:auth-method         "oauth-token"
                                          :oauth-access-token  "ya29.token"
                                          :project-id          "my-project"
                                          :service-account-key ""}})
          (is (= {:auth-method        "oauth-token"
                  :oauth-access-token "ya29.token"
                  :project-id         "my-project"}
                 (stored-config "google")))
          (testing "so the credential probe runs with the OAuth token rather than the stale service account key"
            (is (nil? (:service-account-key @probed)))
            (is (= "ya29.token" (:oauth-access-token @probed)))))))))

(deftest list-providers-masks-the-google-service-account-key-test
  (testing "the service account key is a file upload rather than a password input, but it is the whole credential"
    (mt/with-temporary-setting-values [llm-providers [(connection "google" "google"
                                                                  {:auth-method         "service-account-key"
                                                                   :service-account-key "{\"private_key\":\"secret\"}"
                                                                   :project-id          "my-project"})]]
      (let [config (:config (first (mt/user-http-request :crowberto :get 200 "llm/providers")))]
        (is (setting/obfuscated-value? (:service-account-key config)))
        (is (= "my-project" (:project-id config)))))))

(deftest delete-managed-connection-requires-superuser-test
  (testing (str "removing the managed connection cancels the Store subscription behind it, so settings access via "
                "advanced permissions is not enough — everything else that can cancel add-ons is superuser-only")
    (mt/when-ee-evailable
     (mt/with-premium-features #{:advanced-permissions :metabase-ai-managed}
       (mt/with-temporary-setting-values [llm-providers      [(connection "metabase" "metabase")
                                                              (connection "anthropic" "anthropic"
                                                                          {:api-key "sk-ant-stored"})]
                                          llm-proxy-base-url "https://proxy.example.com"]
         (mt/with-user-in-groups [group {:name "Settings managers"}
                                  user  [group]]
           (perms/grant-application-permissions! group :setting)
           (testing "settings access is enough to remove an ordinary connection"
             (is (nil? (mt/user-http-request user :delete 204 "llm/providers/anthropic"))))
           (testing "but not the managed one"
             (is (= "You don't have permissions to do that."
                    (mt/user-http-request user :delete 403 "llm/providers/metabase"))))
           (testing "which is still there"
             (is (some? (llm.provider/connection "metabase"))))))))))

(deftest create-managed-connection-skips-credential-verification-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-temporary-setting-values [llm-providers      []
                                       llm-proxy-base-url "https://proxy.example.com"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _]
                                                             (is false "the managed provider has no credentials to verify"))]
        (is (=? {:key "metabase" :type "metabase" :usable true :config {}}
                (mt/user-http-request :crowberto :post 200 "llm/providers" {:type "metabase"})))))
    (testing "the managed provider cannot be added when the LLM proxy is not configured"
      (mt/with-temporary-setting-values [llm-providers      []
                                         llm-proxy-base-url nil]
        (is (= "The \"metabase\" provider is not available on this instance."
               (mt/user-http-request :crowberto :post 400 "llm/providers" {:type "metabase"})))))))

(deftest update-preserves-a-masked-secret-test
  (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic"
                                                                {:api-key  "sk-ant-stored"
                                                                 :base-url "https://api.anthropic.com"})]]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                (fn [_provider {:keys [credentials]}]
                                  (is (= {:api-key "sk-ant-stored" :base-url "https://new.example.com"} credentials)
                                      "the stored secret is what gets verified, not the mask")
                                  {:models []})]
      (is (= {:key        "anthropic"
              :type       "anthropic"
              :name       "Anthropic (prod)"
              :source     "db"
              :usable     true
              :env_vars   []
              :env_fields []
              :config     {:api-key "**********ed" :base-url "https://new.example.com"}}
             (mt/user-http-request :crowberto :put 200 "llm/providers/anthropic"
                                   {:name   "Anthropic (prod)"
                                    :config {:api-key  "**********ed"
                                             :base-url "https://new.example.com"}})))
      (is (= {:api-key "sk-ant-stored" :base-url "https://new.example.com"} (stored-config "anthropic"))))))

(deftest update-preserves-a-masked-service-account-key-test
  (testing (str "re-saving a Google connection without touching the key file echoes back the mask of a JSON key "
                "that ends in a newline — the stored key has to survive it rather than be replaced by the mask")
    (let [key-file "{\n  \"type\": \"service_account\",\n  \"project_id\": \"my-project\"\n}\n"]
      (mt/with-temporary-setting-values [llm-providers [(connection "google" "google"
                                                                    {:auth-method         "service-account-key"
                                                                     :service-account-key key-file})]]
        (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                    (fn [_provider {:keys [credentials]}]
                                      (is (= key-file (:service-account-key credentials))
                                          "the stored key is what gets probed, not the mask")
                                      {:models []})]
          (mt/user-http-request :crowberto :put 200 "llm/providers/google"
                                {:config {:auth-method         "service-account-key"
                                          :service-account-key (setting/obfuscate-value key-file)}})
          (is (= key-file (:service-account-key (stored-config "google")))))))))

(deftest update-replaces-a-freshly-entered-secret-test
  (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})]]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                (fn [_provider {:keys [credentials]}]
                                  (is (= {:api-key  "sk-ant-rotated"
                                          :base-url "https://api.anthropic.com"}
                                         credentials))
                                  {:models []})]
      (mt/user-http-request :crowberto :put 200 "llm/providers/anthropic" {:config {:api-key "sk-ant-rotated"}})
      (is (= {:api-key "sk-ant-rotated"} (stored-config "anthropic"))))))

(deftest update-does-not-save-when-credentials-are-rejected-test
  (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})]]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (rejected-credentials "Anthropic API key expired or invalid")]
      (is (=? {:message "Anthropic API key expired or invalid"}
              (mt/user-http-request :crowberto :put 400 "llm/providers/anthropic"
                                    {:config {:api-key "sk-ant-rotated"}})))
      (is (= {:api-key "sk-ant-stored"} (stored-config "anthropic"))))))

(deftest update-unknown-connection-is-a-404-test
  (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})]]
    (mt/user-http-request :crowberto :put 404 "llm/providers/nope" {:name "Nope"})))

(deftest update-rejects-an-env-configured-connection-test
  (testing "a connection that comes from the single-provider environment variables cannot be edited"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key "sk-ant-env"]
        (mt/user-http-request :crowberto :put 404 "llm/providers/anthropic" {:name "Anthropic"})))))

(deftest update-follows-the-deployment-an-azure-connection-now-serves-test
  (testing (str "Azure's model reference bakes in the deployment name, so renaming the deployment of the connection "
                "Metabot is pointed at has to move the selection with it — otherwise the next request resolves a "
                "deployment that no longer exists.")
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values [llm-providers [(connection "azure" "azure"
                                                                    {:api-key         "azure-key"
                                                                     :base-url        "https://r.services.ai.azure.com/openai"
                                                                     :model-family    "openai"
                                                                     :deployment-name "gpt-4.1-mini"})]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider "azure/openai/gpt-4.1-mini"]
          (mt/user-http-request :crowberto :put 200 "llm/providers/azure"
                                {:config {:deployment-name "gpt-4.1"}})
          (is (= "azure/openai/gpt-4.1" (metabot.settings/llm-metabot-provider))))))))

(deftest update-follows-the-model-picked-for-a-fixed-catalog-connection-test
  (testing (str "Google's edit form carries a model pick rather than a probe input, so saving with a different "
                "model moves the selection when it points at this connection")
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values [llm-providers [(connection "google" "google"
                                                                    {:oauth-access-token "ya29.token"
                                                                     :project-id         "my-project"})]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider "google/google/gemini-3.5-flash"]
          (mt/user-http-request :crowberto :put 200 "llm/providers/google"
                                {:config {}
                                 :model  "google/gemini-3.6-flash"})
          (is (= "google/google/gemini-3.6-flash" (metabot.settings/llm-metabot-provider))))
        (testing "while a selection on another connection is left alone"
          (mt/with-temporary-raw-setting-values [llm-metabot-provider "anthropic/claude-sonnet-4-6"]
            (mt/user-http-request :crowberto :put 200 "llm/providers/google"
                                  {:config {}
                                   :model  "google/gemini-3.6-flash"})
            (is (= "anthropic/claude-sonnet-4-6" (metabot.settings/llm-metabot-provider)))))))))

(deftest ref-writes-leave-an-env-pinned-selection-alone-test
  (testing (str "MB_LLM_METABOT_PROVIDER pins the selection, so the automatic follow-ups — pointing Metabot at a "
                "first connection, following an edit, falling back after a delete — must not write a value that "
                "loses to the env var on every read")
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models [{:id "claude-sonnet-4-6"
                                                                              :display_name "Claude Sonnet 4.6"}]})]
      (mt/with-temp-env-var-value! [mb-llm-metabot-provider "openai/gpt-5.4"]
        (testing "creating a first connection"
          (mt/with-temporary-setting-values [llm-providers []]
            (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
              (mt/user-http-request :crowberto :post 200 "llm/providers"
                                    {:type "anthropic" :config {:api-key "sk-ant-valid"}})
              (is (nil? (setting/db-stored-value :llm-metabot-provider))))))
        (testing "deleting the connection the env-pinned selection names"
          (mt/with-temporary-setting-values [llm-providers [(connection "openai" "openai" {:api-key "sk-valid"})]]
            (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
              (mt/user-http-request :crowberto :delete 204 "llm/providers/openai")
              (is (nil? (setting/db-stored-value :llm-metabot-provider))))))))))

(deftest update-leaves-a-selection-it-does-not-compose-alone-test
  (testing "a type whose model is chosen independently of its credentials keeps the model the admin selected"
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider "anthropic/claude-opus-4-1"]
          (mt/user-http-request :crowberto :put 200 "llm/providers/anthropic" {:config {:api-key "sk-ant-rotated"}})
          (is (= "anthropic/claude-opus-4-1" (metabot.settings/llm-metabot-provider))))))))

(deftest update-leaves-a-selection-on-another-connection-alone-test
  (testing "editing an Azure connection Metabot is not pointed at does not steal the selection"
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})
                                                        (connection "azure" "azure"
                                                                    {:api-key         "azure-key"
                                                                     :base-url        "https://r.services.ai.azure.com/openai"
                                                                     :model-family    "openai"
                                                                     :deployment-name "gpt-4.1-mini"})]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider "anthropic/claude-opus-4-1"]
          (mt/user-http-request :crowberto :put 200 "llm/providers/azure"
                                {:config {:deployment-name "gpt-4.1"}})
          (is (= "anthropic/claude-opus-4-1" (metabot.settings/llm-metabot-provider))))))))

(deftest update-follows-the-deployment-on-a-pinned-mini-model-test
  (testing "a mini model pinned to the edited connection moves to the deployment it now serves"
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})
                                                        (connection "azure" "azure"
                                                                    {:api-key         "azure-key"
                                                                     :base-url        "https://r.services.ai.azure.com/openai"
                                                                     :model-family    "openai"
                                                                     :deployment-name "gpt-4.1-mini"})]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider "anthropic/claude-opus-4-1"
                                               llm-mini-model "azure/openai/gpt-4.1-mini"]
          (mt/user-http-request :crowberto :put 200 "llm/providers/azure"
                                {:config {:deployment-name "gpt-4.1"}})
          (is (= "azure/openai/gpt-4.1" (metabot.settings/explicit-mini-model))))))))

(deftest update-leaves-a-derived-mini-model-derived-test
  (testing "a mini model that was never pinned stays derived rather than being materialized by the edit"
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values [llm-providers [(connection "azure" "azure"
                                                                    {:api-key         "azure-key"
                                                                     :base-url        "https://r.services.ai.azure.com/openai"
                                                                     :model-family    "openai"
                                                                     :deployment-name "gpt-4.1-mini"})]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider "azure/openai/gpt-4.1-mini"
                                               llm-mini-model nil]
          (mt/user-http-request :crowberto :put 200 "llm/providers/azure"
                                {:config {:deployment-name "gpt-4.1"}})
          (is (nil? (metabot.settings/explicit-mini-model)))
          (testing "and resolves through the followed Metabot selection"
            (is (= "azure/openai/gpt-4.1" (metabot.settings/llm-mini-model)))))))))

(deftest update-leaves-a-mini-model-on-another-connection-alone-test
  (testing "editing an Azure connection the mini model is not pinned to leaves the pin alone"
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})
                                                        (connection "azure" "azure"
                                                                    {:api-key         "azure-key"
                                                                     :base-url        "https://r.services.ai.azure.com/openai"
                                                                     :model-family    "openai"
                                                                     :deployment-name "gpt-4.1-mini"})]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider "anthropic/claude-opus-4-1"
                                               llm-mini-model "anthropic/claude-haiku-4-5-20251001"]
          (mt/user-http-request :crowberto :put 200 "llm/providers/azure"
                                {:config {:deployment-name "gpt-4.1"}})
          (is (= "anthropic/claude-haiku-4-5-20251001" (metabot.settings/explicit-mini-model))))))))

(deftest delete-removes-the-connection-test
  (mt/with-temporary-raw-setting-values [llm-metabot-provider "openai/gpt-4.1-mini"]
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})
                                                      (connection "openai" "openai" {:api-key "sk-stored"})]]
      (is (nil? (mt/user-http-request :crowberto :delete 204 "llm/providers/anthropic")))
      (is (= ["openai"] (map :key (llm.provider/connections))))
      (testing "a selection that did not point at the deleted connection is left alone"
        (is (= "openai/gpt-4.1-mini" (metabot.settings/llm-metabot-provider)))))))

(deftest delete-cancels-the-managed-subscription-test
  (testing "removing the managed connection cancels the add-on backing it"
    (let [cancelled (atom 0)]
      (mt/with-dynamic-fn-redefs [llm.api.provider/cancel-managed-ai-subscription!
                                  (fn [] (swap! cancelled inc))]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
          (mt/with-temporary-setting-values [llm-providers [(connection "metabase" "metabase")]]
            (mt/user-http-request :crowberto :delete 204 "llm/providers/metabase")
            (is (= 1 @cancelled))
            (is (= [] (llm.provider/connections))))))))
  (testing "removing any other connection leaves the subscription alone"
    (let [cancelled (atom 0)]
      (mt/with-dynamic-fn-redefs [llm.api.provider/cancel-managed-ai-subscription!
                                  (fn [] (swap! cancelled inc))]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
          (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic"
                                                                        {:api-key "sk-ant-stored"})]]
            (mt/user-http-request :crowberto :delete 204 "llm/providers/anthropic")
            (is (zero? @cancelled))))))))

(deftest delete-repoints-the-metabot-selection-test
  (testing "deleting the connection Metabot was pointed at moves the selection to a remaining one"
    (mt/with-temporary-raw-setting-values [llm-metabot-provider "anthropic/claude-opus-4-1"]
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})
                                                        (connection "openai" "openai" {:api-key "sk-stored"})]]
        (mt/user-http-request :crowberto :delete 204 "llm/providers/anthropic")
        (is (= "openai/gpt-5.4" (metabot.settings/llm-metabot-provider)))))))

(deftest delete-last-connection-clears-the-selection-test
  (testing "with nothing left to fall back to, the stored selection is cleared instead of left dangling"
    (mt/with-temporary-raw-setting-values [llm-metabot-provider "anthropic/claude-opus-4-1"]
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})]]
        (mt/user-http-request :crowberto :delete 204 "llm/providers/anthropic")
        (is (= [] (llm.provider/connections)))
        (is (nil? (setting/db-stored-value :llm-metabot-provider)))
        (is (= metabot.settings/default-llm-metabot-provider (metabot.settings/llm-metabot-provider)))))))

(deftest delete-skips-a-fallback-with-no-default-model-test
  (testing "a remaining connection whose type has no default model is not a usable fallback"
    (mt/with-temporary-raw-setting-values [llm-metabot-provider "anthropic/claude-opus-4-1"]
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})
                                                        (connection "azure" "azure" {:api-key  "azure-key"
                                                                                     :base-url "https://r.services.ai.azure.com/openai"})
                                                        (connection "openai" "openai" {:api-key "sk-stored"})]]
        (mt/user-http-request :crowberto :delete 204 "llm/providers/anthropic")
        (is (= "openai/gpt-5.4" (metabot.settings/llm-metabot-provider)))))))

(deftest delete-falls-back-to-a-connection-that-composes-its-own-model-test
  (testing "an Azure connection that names its deployment is a usable fallback, even though its type has no default"
    (mt/with-temporary-raw-setting-values [llm-metabot-provider "anthropic/claude-opus-4-1"]
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})
                                                        (connection "azure" "azure"
                                                                    {:api-key         "azure-key"
                                                                     :base-url        "https://r.services.ai.azure.com/openai"
                                                                     :model-family    "openai"
                                                                     :deployment-name "gpt-4.1-mini"})]]
        (mt/user-http-request :crowberto :delete 204 "llm/providers/anthropic")
        (is (= "azure/openai/gpt-4.1-mini" (metabot.settings/llm-metabot-provider)))))))

(deftest delete-clears-a-mini-model-on-the-deleted-connection-test
  (testing "an explicit mini model pointing at the deleted connection goes back to being derived"
    (mt/with-temporary-raw-setting-values [llm-metabot-provider "openai/gpt-5.4"
                                           llm-mini-model "anthropic/claude-haiku-4-5"]
      (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})
                                                        (connection "openai" "openai" {:api-key "sk-stored"})]]
        (mt/user-http-request :crowberto :delete 204 "llm/providers/anthropic")
        (is (nil? (setting/db-stored-value :llm-mini-model)))
        (is (= "openai/gpt-5.4-mini" (metabot.settings/llm-mini-model)))))))

(deftest delete-leaves-an-unrelated-mini-model-alone-test
  (mt/with-temporary-raw-setting-values [llm-metabot-provider "openai/gpt-5.4"
                                         llm-mini-model "openai/gpt-5.4-mini"]
    (mt/with-temporary-setting-values [llm-providers [(connection "anthropic" "anthropic" {:api-key "sk-ant-stored"})
                                                      (connection "openai" "openai" {:api-key "sk-stored"})]]
      (mt/user-http-request :crowberto :delete 204 "llm/providers/anthropic")
      (is (= "openai/gpt-5.4-mini" (setting/db-stored-value :llm-mini-model))))))

(deftest delete-unknown-connection-is-a-404-test
  (mt/with-temporary-setting-values [llm-providers []]
    (mt/user-http-request :crowberto :delete 404 "llm/providers/nope")))

(deftest writes-are-rejected-when-connections-are-env-managed-test
  (mt/with-temp-env-var-value! [mb-llm-providers "[{\"key\":\"anthropic\",\"type\":\"anthropic\",\"name\":\"Anthropic\",\"config\":{\"api-key\":\"sk-ant-env\"}}]"]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _]
                                                           (is false "should reject before verifying credentials"))]
      (testing "the whole list is read-only and reported as such"
        (is (=? [{:key "anthropic" :source "env"}]
                (mt/user-http-request :crowberto :get 200 "llm/providers"))))
      (testing "creating is rejected"
        (is (re-find #"MB_LLM_PROVIDERS"
                     (mt/user-http-request :crowberto :post 400 "llm/providers"
                                           {:type "openai" :config {:api-key "sk-new"}}))))
      (testing "updating is rejected"
        (is (re-find #"MB_LLM_PROVIDERS"
                     (mt/user-http-request :crowberto :put 400 "llm/providers/anthropic"
                                           {:config {:api-key "sk-ant-new"}}))))
      (testing "deleting is rejected"
        (is (re-find #"MB_LLM_PROVIDERS"
                     (mt/user-http-request :crowberto :delete 400 "llm/providers/anthropic")))))))

(deftest permissions-test
  (testing "managing provider connections requires the setting application permission"
    (mt/user-http-request :rasta :get 403 "llm/provider-types")
    (mt/user-http-request :rasta :get 403 "llm/providers")
    (mt/user-http-request :rasta :post 403 "llm/providers" {:type "anthropic" :config {:api-key "sk-ant-x"}})
    (mt/user-http-request :rasta :put 403 "llm/providers/anthropic" {:name "Anthropic"})
    (mt/user-http-request :rasta :delete 403 "llm/providers/anthropic")
    (mt/user-http-request :rasta :get 403 "llm/models")))

(deftest models-are-listed-per-connection-test
  (mt/with-temporary-setting-values [llm-providers [(connection "listed-anthropic" "anthropic" {:api-key "sk-ant-a"})
                                                    (connection "listed-openai" "openai" {:api-key "sk-o"})]]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                (fn [provider _opts]
                                  (case provider
                                    "anthropic" {:models [{:id "claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}
                                                          {:id "claude-haiku-4-5" :display_name "Claude Haiku 4.5"}]}
                                    "openai"    {:models [{:id "gpt-5.4" :display_name "gpt-5.4"}
                                                          {:id "gpt-4.1-mini" :display_name "gpt-4.1-mini"}]}))]
      (testing "each connection reports its own models, in the order the provider lists them"
        (is (= [{:key    "listed-anthropic"
                 :name   "listed-anthropic"
                 :type   "anthropic"
                 :models [{:id "claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}
                          {:id "claude-haiku-4-5" :display_name "Claude Haiku 4.5"}]}
                {:key    "listed-openai"
                 :name   "listed-openai"
                 :type   "openai"
                 :models [{:id "gpt-5.4" :display_name "gpt-5.4"}
                          {:id "gpt-4.1-mini" :display_name "gpt-4.1-mini"}]}]
               (mt/user-http-request :crowberto :get 200 "llm/models")))))))

(deftest models-are-refetched-when-a-credential-changes-test
  (testing "a rotated key gets a cache entry of its own rather than the model list the old key produced"
    (let [keys-seen (atom [])]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [credentials]}]
                                                             (swap! keys-seen conj (:api-key credentials))
                                                             {:models [{:id "claude-sonnet-4-6"
                                                                        :display_name "Claude Sonnet 4.6"}]})]
        (mt/with-temporary-setting-values [llm-providers [(connection "cache-keying" "anthropic"
                                                                      {:api-key "sk-ant-first"})]]
          (mt/user-http-request :crowberto :get 200 "llm/models")
          (mt/user-http-request :crowberto :get 200 "llm/models"))
        (mt/with-temporary-setting-values [llm-providers [(connection "cache-keying" "anthropic"
                                                                      {:api-key "sk-ant-rotated"})]]
          (mt/user-http-request :crowberto :get 200 "llm/models"))
        (is (= ["sk-ant-first" "sk-ant-rotated"] @keys-seen))))))

(deftest models-are-refetched-when-the-selected-model-changes-test
  (testing "repointing Metabot at another of a connection's models reprobes instead of reusing the cached listing"
    (let [probed (atom [])]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [model proposed-model]}]
                                                             (swap! probed conj (or model proposed-model))
                                                             {:models []})]
        (mt/with-temporary-setting-values [llm-providers [(connection "cache-keying-model" "google"
                                                                      {:oauth-access-token "ya29.token"
                                                                       :project-id         "my-project"})]]
          (mt/with-temporary-raw-setting-values [llm-metabot-provider "cache-keying-model/google/gemini-3.5-flash"]
            (mt/user-http-request :crowberto :get 200 "llm/models")
            (mt/user-http-request :crowberto :get 200 "llm/models"))
          (mt/with-temporary-raw-setting-values [llm-metabot-provider "cache-keying-model/anthropic/claude-opus-5"]
            (mt/user-http-request :crowberto :get 200 "llm/models")))
        (is (= ["google/gemini-3.5-flash" "anthropic/claude-opus-5"] @probed))))))

(deftest models-cache-is-seeded-under-the-post-save-selection-test
  (testing "creating the first usable connection caches its listing under the model selected by the save"
    (let [calls (atom 0)]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _]
                                                             (swap! calls inc)
                                                             {:models []})]
        (mt/with-temporary-setting-values [llm-providers []]
          (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
            (mt/user-http-request :crowberto :post 200 "llm/providers"
                                  {:type   "google"
                                   :key    "post-save-create"
                                   :model  "anthropic/claude-opus-5"
                                   :config {:oauth-access-token "ya29.token"
                                            :project-id         "my-project"}})
            (is (= "post-save-create/anthropic/claude-opus-5"
                   (metabot.settings/llm-metabot-provider)))
            (mt/user-http-request :crowberto :get 200 "llm/models")
            (is (= 1 @calls) "the post-save model refetch reuses the credential probe"))))))
  (testing "editing the active fixed-catalog model caches its listing under the followed selection"
    (let [calls (atom 0)]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _]
                                                             (swap! calls inc)
                                                             {:models []})]
        (mt/with-temporary-setting-values [llm-providers [(connection "post-save-update" "google"
                                                                      {:oauth-access-token "ya29.token"
                                                                       :project-id         "my-project"})]]
          (mt/with-temporary-raw-setting-values [llm-metabot-provider
                                                 "post-save-update/google/gemini-3.5-flash"]
            (mt/user-http-request :crowberto :put 200 "llm/providers/post-save-update"
                                  {:config {}
                                   :model  "anthropic/claude-opus-5"})
            (is (= "post-save-update/anthropic/claude-opus-5"
                   (metabot.settings/llm-metabot-provider)))
            (mt/user-http-request :crowberto :get 200 "llm/models")
            (is (= 1 @calls) "the post-save model refetch reuses the credential probe")))))))

(deftest models-for-a-connection-with-a-fixed-catalog-test
  (testing (str "Google's models are the registry's, so every connection of the type offers both of them in the "
                "model picker — but the call is still made, because it is what verifies the credentials")
    (let [probed (atom nil)]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [model proposed-model]}]
                                                             (reset! probed (or model proposed-model))
                                                             {:models []})]
        (mt/with-temporary-setting-values [llm-providers [(connection "gemini-catalog" "google"
                                                                      {:oauth-access-token "ya29.token"
                                                                       :project-id         "my-project"})]]
          ;; nothing names a model for this connection, so the probe has only the catalog to go on
          (mt/with-temporary-raw-setting-values [llm-metabot-provider nil]
            (is (= [{:key    "gemini-catalog"
                     :name   "gemini-catalog"
                     :type   "google"
                     :models [{:id "google/gemini-3.5-flash" :display_name "Gemini 3.5 Flash"}
                              {:id "google/gemini-3.6-flash" :display_name "Gemini 3.6 Flash"}
                              {:id "google/gemini-3.7-flash" :display_name "Gemini 3.7 Flash"}
                              {:id "anthropic/claude-fable-5" :display_name "Claude Fable 5"}
                              {:id "anthropic/claude-opus-5" :display_name "Claude Opus 5"}
                              {:id "anthropic/claude-opus-4-6" :display_name "Claude Opus 4.6"}
                              {:id "anthropic/claude-sonnet-5" :display_name "Claude Sonnet 5"}
                              {:id "anthropic/claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}
                              {:id "anthropic/claude-haiku-4-5@20251001" :display_name "Claude Haiku 4.5"}]}]
                   (mt/user-http-request :crowberto :get 200 "llm/models")))
            (is (= "google/gemini-3.5-flash" @probed))))))))

(deftest models-listing-probes-the-model-the-connection-was-verified-against-test
  (testing (str "Google's catalog spans two families served in different locations, so probing whichever model the "
                "registry lists first can fail on a connection that works — the model the connection was verified "
                "against is probed instead, while the picker still offers the whole catalog")
    (let [probed (atom nil)]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [model proposed-model]}]
                                                             (reset! probed (or model proposed-model))
                                                             {:models []})]
        (mt/with-temporary-setting-values [llm-providers [(connection "claude-only" "google"
                                                                      {:oauth-access-token "ya29.token"
                                                                       :project-id         "my-project"
                                                                       :location           "us-east5"
                                                                       :probed-model       "anthropic/claude-sonnet-4-6"})]]
          (is (=? [{:key "claude-only" :models [{:id "google/gemini-3.5-flash"} some?  some? some? some? some? some? some? some?]}]
                  (mt/user-http-request :crowberto :get 200 "llm/models")))
          (is (= "anthropic/claude-sonnet-4-6" @probed)))))))

(deftest models-listing-probes-the-model-metabot-is-pointed-at-test
  (testing (str "an environment-configured connection is never written back to, so it carries no probed model — the "
                "selection Metabot runs on names it instead")
    (let [probed (atom nil)]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [model proposed-model]}]
                                                             (reset! probed (or model proposed-model))
                                                             {:models []})]
        (mt/with-temporary-setting-values [llm-providers [(connection "env-google" "google"
                                                                      {:oauth-access-token "ya29.token"
                                                                       :project-id         "my-project"})]]
          (mt/with-temporary-raw-setting-values [llm-metabot-provider "env-google/anthropic/claude-opus-5"]
            (mt/user-http-request :crowberto :get 200 "llm/models")
            (is (= "anthropic/claude-opus-5" @probed))))))))

(deftest models-listing-prefers-the-selection-over-the-recorded-probe-test
  (testing "a selection made since the connection was saved is fresher than what it was last verified against"
    (let [probed (atom nil)]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [model proposed-model]}]
                                                             (reset! probed (or model proposed-model))
                                                             {:models []})]
        (mt/with-temporary-setting-values [llm-providers [(connection "reselected-google" "google"
                                                                      {:oauth-access-token "ya29.token"
                                                                       :project-id         "my-project"
                                                                       :probed-model       "anthropic/claude-sonnet-4-6"})]]
          (mt/with-temporary-raw-setting-values [llm-metabot-provider "reselected-google/anthropic/claude-opus-5"]
            (mt/user-http-request :crowberto :get 200 "llm/models")
            (is (= "anthropic/claude-opus-5" @probed))))))))

(deftest models-listing-keeps-the-fixed-catalog-when-the-probed-model-is-not-served-test
  (testing (str "a selection naming a model the project cannot serve fails the probe — the catalog it was picked "
                "from is still offered, so the admin can select a model that works instead of facing an empty picker")
    (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                (fn [_provider _opts]
                                  (throw (ex-info "Google API error: model not found"
                                                  {:api-error true :status 404})))]
      (mt/with-temporary-setting-values [llm-providers [(connection "wrong-model-google" "google"
                                                                    {:oauth-access-token "ya29.token"
                                                                     :project-id         "my-project"})]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider "wrong-model-google/anthropic/claude-opus-5"]
          (is (=? [{:key    "wrong-model-google"
                    :models [{:id "google/gemini-3.5-flash"} some? some? some? some? some? some? some? some?]
                    :error  "Google API error: model not found"}]
                  (mt/user-http-request :crowberto :get 200 "llm/models"))))))))

(deftest models-listing-keeps-the-fixed-catalog-when-the-model-is-not-permitted-test
  (testing (str "a 403 for a publisher whose terms the project has not accepted is about the model, not the "
                "credentials — the catalog stays, because picking another model is the admin's way out")
    (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                (fn [_provider _opts]
                                  (throw (ex-info "Google API error: PERMISSION_DENIED"
                                                  {:api-error true :status 403})))]
      (mt/with-temporary-setting-values [llm-providers [(connection "forbidden-model-google" "google"
                                                                    {:oauth-access-token "ya29.token"
                                                                     :project-id         "my-project"})]]
        (mt/with-temporary-raw-setting-values [llm-metabot-provider "forbidden-model-google/anthropic/claude-opus-5"]
          (is (=? [{:key    "forbidden-model-google"
                    :models [{:id "google/gemini-3.5-flash"} some? some? some? some? some? some? some? some?]
                    :error  "Google API error: PERMISSION_DENIED"}]
                  (mt/user-http-request :crowberto :get 200 "llm/models"))))))))

(deftest models-listing-keeps-the-fixed-catalog-when-the-credentials-are-rejected-test
  (testing (str "rejected credentials are reported as the error on the connection rather than implied by an empty "
                "picker — a catalog the type owns does not depend on the call that failed")
    (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                (fn [_provider _opts]
                                  (throw (ex-info "Google API error: invalid authentication credentials"
                                                  {:api-error true :status 401})))]
      (mt/with-temporary-setting-values [llm-providers [(connection "bad-key-google" "google"
                                                                    {:oauth-access-token "ya29.expired"
                                                                     :project-id         "my-project"})]]
        (is (=? [{:key    "bad-key-google"
                  :name   "bad-key-google"
                  :type   "google"
                  :models [{:id "google/gemini-3.5-flash"} some? some? some? some? some? some? some? some?]
                  :error  "Google API error: invalid authentication credentials"}]
                (mt/user-http-request :crowberto :get 200 "llm/models")))))))

(deftest create-records-the-model-the-probe-verified-test
  (testing "connecting Google against a partner model records it, so the listing that follows probes it too"
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [model]}]
                                                           {:models         []
                                                            :learned-config {:probed-model model}})]
      (mt/with-temporary-setting-values [llm-providers []]
        (mt/user-http-request :crowberto :post 200 "llm/providers"
                              {:type   "google"
                               :config {:oauth-access-token "ya29.token" :project-id "my-project"}
                               :model  "anthropic/claude-sonnet-4-6"})
        (is (= {:oauth-access-token "ya29.token"
                :project-id         "my-project"
                :probed-model       "anthropic/claude-sonnet-4-6"}
               (stored-config "google")))))))

(deftest models-for-a-connection-that-names-its-own-model-test
  (testing "Azure serves a deployment its listing endpoint never returns, so the connection's own model is reported"
    (mt/with-temporary-setting-values [llm-providers [(connection "azure-prod" "azure"
                                                                  {:api-key         "azure-key"
                                                                   :base-url        "https://r.services.ai.azure.com/openai"
                                                                   :model-family    "openai"
                                                                   :deployment-name "gpt-4.1-mini"})]]
      (let [listed-with (atom nil)]
        (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider opts]
                                                               (reset! listed-with opts)
                                                               {:models []})]
          (is (= [{:key    "azure-prod"
                   :name   "azure-prod"
                   :type   "azure"
                   :models [{:id "openai/gpt-4.1-mini" :display_name "gpt-4.1-mini"}]}]
                 (mt/user-http-request :crowberto :get 200 "llm/models")))
          (testing "and the call still happens, because it is what verifies the credentials"
            (is (= "openai/gpt-4.1-mini" (:model @listed-with)))))))))

(deftest models-isolate-per-connection-failures-test
  (mt/with-temporary-setting-values [llm-providers [(connection "failing-anthropic" "anthropic" {:api-key "sk-ant-bad"})
                                                    (connection "working-openai" "openai" {:api-key "sk-good"})]]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                (fn [provider _opts]
                                  (if (= "anthropic" provider)
                                    (throw (ex-info "Anthropic API key expired or invalid"
                                                    {:api-error true :status-code 401}))
                                    {:models [{:id "gpt-5.4" :display_name "gpt-5.4"}]}))]
      (testing "rejected credentials come back as an error on that connection, not a failed request"
        (is (= [{:key    "failing-anthropic"
                 :name   "failing-anthropic"
                 :type   "anthropic"
                 :models []
                 :error  "Anthropic API key expired or invalid"}
                {:key    "working-openai"
                 :name   "working-openai"
                 :type   "openai"
                 :models [{:id "gpt-5.4" :display_name "gpt-5.4"}]}]
               (mt/user-http-request :crowberto :get 200 "llm/models")))))))

(deftest models-isolate-provider-outages-test
  (mt/with-temporary-setting-values [llm-providers [(connection "outage-anthropic" "anthropic" {:api-key "sk-ant-x"})
                                                    (connection "outage-openai" "openai" {:api-key "sk-good"})]]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                (fn [provider _opts]
                                  (if (= "anthropic" provider)
                                    (throw (ex-info "Anthropic API is down" {:api-error true :status-code 500}))
                                    {:models [{:id "gpt-5.4" :display_name "gpt-5.4"}]}))]
      (testing "an outage on one connection does not blank out the others"
        (is (=? [{:key "outage-anthropic" :models [] :error "Anthropic API is down"}
                 {:key "outage-openai" :models [{:id "gpt-5.4"}]}]
                (mt/user-http-request :crowberto :get 200 "llm/models")))))))

(deftest models-for-the-managed-connection-come-from-the-fixed-catalog-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-temporary-setting-values [llm-providers      [(connection "metabase" "metabase")]
                                       llm-proxy-base-url "https://proxy.example.com"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                  (fn [& _]
                                    (throw (ex-info "the proxy must not be listed against" {})))]
        (testing "the proxy serves one fixed model, so nothing is fetched over the wire"
          (is (= [{:key    "metabase"
                   :name   "metabase"
                   :type   "metabase"
                   :models [{:id "anthropic/claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}]}]
                 (mt/user-http-request :crowberto :get 200 "llm/models"))))))))
