(ns metabase.llm.api.provider-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.llm.api.provider :as llm.api.provider]
   [metabase.llm.provider :as llm.provider]
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
      (is (= #{"anthropic" "openai" "openrouter" "mistral" "zai" "azure" "bedrock" "metabase"}
             (set (map :type types))))
      (is (= ["anthropic" "openai" "openrouter" "mistral" "zai" "azure" "bedrock"]
             (remove #{"metabase"} (map :type types)))
          "the bring-your-own-key providers keep their registry order")
      (is (=? {:type          "anthropic"
               :label         "Anthropic"
               :icon          "ai"
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
      (is (= [{:key      "anthropic"
               :type     "anthropic"
               :name     "anthropic"
               :source   "db"
               :usable   true
               :env_vars []
               :config   {:api-key "**********et" :base-url "https://api.anthropic.com"}}
              {:key      "openai"
               :type     "openai"
               :name     "openai"
               :source   "db"
               :usable   false
               :env_vars []
               :config   {:api-key ""}}]
             (mt/user-http-request :crowberto :get 200 "llm/providers"))))))

(deftest list-providers-marks-env-connections-test
  (testing "a connection synthesized from the single-provider environment variables is reported as read-only"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key "sk-ant-env"]
        (is (= [{:key      "anthropic"
                 :type     "anthropic"
                 :name     "Anthropic"
                 :source   "env"
                 :usable   true
                 :env_vars ["MB_LLM_ANTHROPIC_API_KEY"]
                 :config   {:api-key "**********nv" :base-url "https://api.anthropic.com"}}]
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
          (is (= {:key      "anthropic"
                  :type     "anthropic"
                  :name     "Anthropic"
                  :source   "db"
                  :usable   true
                  :env_vars []
                  :config   {:api-key "**********id"}}
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
        (is (= "Unknown provider type \"gemini\"."
               (mt/user-http-request :crowberto :post 400 "llm/providers"
                                     {:type "gemini" :config {:api-key "whatever"}}))))
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
      (is (= {:key      "anthropic"
              :type     "anthropic"
              :name     "Anthropic (prod)"
              :source   "db"
              :usable   true
              :env_vars []
              :config   {:api-key "**********ed" :base-url "https://new.example.com"}}
             (mt/user-http-request :crowberto :put 200 "llm/providers/anthropic"
                                   {:name   "Anthropic (prod)"
                                    :config {:api-key  "**********ed"
                                             :base-url "https://new.example.com"}})))
      (is (= {:api-key "sk-ant-stored" :base-url "https://new.example.com"} (stored-config "anthropic"))))))

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

(deftest models-are-grouped-by-connection-test
  (mt/with-temporary-setting-values [llm-providers [(connection "grouped-anthropic" "anthropic" {:api-key "sk-ant-a"})
                                                    (connection "grouped-openai" "openai" {:api-key "sk-o"})]]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models
                                (fn [provider _opts]
                                  (case provider
                                    "anthropic" {:models [{:id "claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}
                                                          {:id "claude-haiku-4-5" :display_name "Claude Haiku 4.5"}]}
                                    "openai"    {:models [{:id "gpt-5.4" :display_name "gpt-5.4"}
                                                          {:id "gpt-4.1-mini" :display_name "gpt-4.1-mini"}]}))]
      (testing "each connection reports its own models, sorted into picker groups"
        (is (= [{:key    "grouped-anthropic"
                 :name   "grouped-anthropic"
                 :type   "anthropic"
                 :models [{:id "claude-haiku-4-5" :display_name "Claude Haiku 4.5" :group "Haiku"}
                          {:id "claude-sonnet-4-6" :display_name "Claude Sonnet 4.6" :group "Sonnet"}]}
                {:key    "grouped-openai"
                 :name   "grouped-openai"
                 :type   "openai"
                 :models [{:id "gpt-4.1-mini" :display_name "gpt-4.1-mini" :group "GPT-4.1"}
                          {:id "gpt-5.4" :display_name "gpt-5.4" :group "GPT-5.4"}]}]
               (mt/user-http-request :crowberto :get 200 "llm/models")))))))

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
                 :models [{:id "gpt-5.4" :display_name "gpt-5.4" :group "GPT-5.4"}]}]
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
