(ns metabase.app-db.custom-migrations.llm-providers-test
  "Tests for the v64.7qmx3p migration that moves the per-provider LLM credential settings onto the `llm-providers`
  connection list. The migration itself is [[metabase.app-db.custom-migrations.llm-providers]], reached through the
  `MigrateLlmProviderSettings` custom change."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- llm-setting-values
  [setting-keys]
  (into {}
        (map (fn [{:keys [key value]}] [key (encryption/maybe-decrypt-accepting-plaintext value)]))
        (t2/query {'select ['key 'value] 'from 'setting 'where ['in 'key setting-keys]})))

(defn- insert-llm-settings!
  [settings]
  (t2/insert! :setting (for [[k v] settings]
                         {:key k :value (encryption/maybe-encrypt v)})))

(defn- llm-connections
  []
  (some-> (llm-setting-values ["llm-providers"]) (get "llm-providers") json/decode+kw))

(deftest migrate-llm-provider-settings-test
  (testing "v64.7qmx3p : per-provider credential settings move onto llm-providers and are deleted"
    (encryption-test/with-secret-key "dont-tell-anyone-about-this"
      (impl/test-migrations ["v64.7qmx3p"] [migrate!]
        (insert-llm-settings! {"llm-anthropic-api-key"      "sk-ant-stored"
                               "llm-anthropic-api-base-url" "https://self-hosted.example"
                               "llm-openai-api-key"         "sk-stored"
                               ;; an access key with no secret is not a configured provider
                               "llm-bedrock-access-key-id"  "AKIAIOSFODNN7EXAMPLE"
                               "llm-metabot-provider"       "anthropic/claude-opus-4-1"})
        (migrate!)
        (is (= [{:key    "anthropic"
                 :type   "anthropic"
                 :name   "Anthropic"
                 :config {:api-key "sk-ant-stored" :base-url "https://self-hosted.example"}}
                {:key    "openai"
                 :type   "openai"
                 :name   "OpenAI"
                 :config {:api-key "sk-stored"}}]
               (llm-connections)))
        (testing "the credentials they came from are gone, so nothing is left holding a stale copy"
          (is (= {} (llm-setting-values ["llm-anthropic-api-key" "llm-anthropic-api-base-url"
                                         "llm-openai-api-key" "llm-bedrock-access-key-id"]))))
        (testing "and the model reference that already named the provider by type still resolves"
          (is (= {"llm-metabot-provider" "anthropic/claude-opus-4-1"}
                 (llm-setting-values ["llm-metabot-provider"]))))))))

(deftest migrate-llm-provider-settings-azure-test
  (testing "v64.7qmx3p : Azure's deployment is recovered from the model reference it used to live in"
    (impl/test-migrations ["v64.7qmx3p"] [migrate!]
      (insert-llm-settings! {"llm-azure-api-key"      "azure-key"
                             "llm-azure-api-base-url" "https://r.services.ai.azure.com/openai"
                             "llm-metabot-provider"   "azure/openai/gpt-4.1-mini"})
      (migrate!)
      (is (= [{:key    "azure"
               :type   "azure"
               :name   "Microsoft Azure"
               :config {:api-key         "azure-key"
                        :base-url        "https://r.services.ai.azure.com/openai"
                        :model-family    "openai"
                        :deployment-name "gpt-4.1-mini"}}]
             (llm-connections))))))

(deftest migrate-llm-provider-settings-google-test
  (testing "v64.7qmx3p : either Google credential on its own is enough"
    (impl/test-migrations ["v64.7qmx3p"] [migrate!]
      (insert-llm-settings! {"llm-google-oauth-access-token" "ya29.stored-token"
                             "llm-google-project-id"         "my-project"
                             "llm-metabot-provider"          "google/google/gemini-3.5-flash"})
      (migrate!)
      (is (= [{:key    "google"
               :type   "google"
               :name   "Google Gemini Enterprise"
               :config {:oauth-access-token "ya29.stored-token"
                        :project-id         "my-project"}}]
             (llm-connections))))))

(deftest migrate-llm-provider-settings-managed-test
  (testing "v64.7qmx3p : an instance already on the managed provider gets the connection its reference names"
    (impl/test-migrations ["v64.7qmx3p"] [migrate!]
      (insert-llm-settings! {"llm-metabot-provider" "metabase/anthropic/claude-sonnet-4-6"})
      (migrate!)
      (is (= [{:key "metabase" :type "metabase" :name "Metabase AI service" :config {}}]
             (llm-connections))))))

(deftest migrate-llm-provider-settings-keeps-an-existing-list-test
  (testing "v64.7qmx3p : a connection list that already exists is what the instance runs on, and wins"
    (impl/test-migrations ["v64.7qmx3p"] [migrate!]
      (insert-llm-settings! {"llm-providers"         (json/encode [{:key    "anthropic-evals"
                                                                    :type   "anthropic"
                                                                    :name   "Anthropic (evals)"
                                                                    :config {:api-key "sk-ant-list"}}])
                             "llm-anthropic-api-key" "sk-ant-stale"})
      (migrate!)
      (is (= [{:key "anthropic-evals" :type "anthropic" :name "Anthropic (evals)"
               :config {:api-key "sk-ant-list"}}]
             (llm-connections)))
      (testing "and the setting it superseded is deleted rather than left behind as a stale credential"
        (is (= {} (llm-setting-values ["llm-anthropic-api-key"])))))))

(deftest rollback-llm-provider-settings-test
  (testing "v64.7qmx3p : rolling back writes the connection list back into the settings older code reads"
    (encryption-test/with-secret-key "dont-tell-anyone-about-this"
      (impl/test-migrations ["v64.7qmx3p"] [migrate!]
        (insert-llm-settings! {"llm-anthropic-api-key" "sk-ant-stored"
                               "llm-metabot-provider"  "anthropic/claude-opus-4-1"})
        (migrate!)
        (t2/query {'update 'setting
                   'set    {:value (encryption/maybe-encrypt
                                    (json/encode [{:key    "anthropic"
                                                   :type   "anthropic"
                                                   :name   "Anthropic"
                                                   :config {:api-key "sk-ant-rotated"}}]))}
                   'where  ['= 'key "llm-providers"]})
        (migrate! :down 63)
        (testing "the rotated credential is what older code finds, not the one the upgrade started from"
          (is (= {"llm-anthropic-api-key" "sk-ant-rotated"}
                 (llm-setting-values ["llm-anthropic-api-key"]))))
        (testing "and the list is dropped, so upgrading again re-reads the settings"
          (is (= {} (llm-setting-values ["llm-providers"]))))))))

(deftest rollback-llm-provider-settings-drops-what-settings-cannot-hold-test
  (testing "v64.7qmx3p : a connection keyed by anything but its provider type has nowhere to go on rollback"
    (impl/test-migrations ["v64.7qmx3p"] [migrate!]
      (insert-llm-settings! {"llm-anthropic-api-key" "sk-ant-stored"})
      (migrate!)
      (t2/query {'update 'setting
                 'set    {:value (encryption/maybe-encrypt
                                  (json/encode [{:key    "anthropic-evals"
                                                 :type   "anthropic"
                                                 :name   "Anthropic (evals)"
                                                 :config {:api-key "sk-ant-evals"}}]))}
                 'where  ['= 'key "llm-providers"]})
      (insert-llm-settings! {"llm-metabot-provider" "anthropic-evals/claude-opus-4-1"})
      (migrate! :down 63)
      (testing "its credentials are not written under a provider they did not belong to"
        (is (= {} (llm-setting-values ["llm-anthropic-api-key"]))))
      (testing "and the reference naming it is rewritten to something older code can resolve"
        (is (= {"llm-metabot-provider" "anthropic/claude-opus-4-1"}
               (llm-setting-values ["llm-metabot-provider"])))))))

(deftest rollback-llm-provider-settings-drops-a-post-migration-type-test
  (testing "v64.7qmx3p : a provider type added after this migration is not in its frozen table, so a rollback has
            nowhere to put it — the versions this rolls back to cannot serve that provider either"
    (impl/test-migrations ["v64.7qmx3p"] [migrate!]
      (insert-llm-settings! {"llm-anthropic-api-key" "sk-ant-stored"})
      (migrate!)
      (t2/query {'update 'setting
                 'set    {:value (encryption/maybe-encrypt
                                  (json/encode [{:key    "deepseek"
                                                 :type   "deepseek"
                                                 :name   "DeepSeek"
                                                 :config {:api-key "sk-deepseek"}}]))}
                 'where  ['= 'key "llm-providers"]})
      (insert-llm-settings! {"llm-metabot-provider" "deepseek/deepseek-v4-flash"})
      (migrate! :down 63)
      (testing "the credential is dropped rather than written to a setting nothing reads"
        (is (= {} (llm-setting-values ["llm-deepseek-api-key"]))))
      (testing "and the reference naming it falls back to the default rather than pointing at a provider that is gone"
        (is (= {} (llm-setting-values ["llm-metabot-provider"])))))))

(deftest rollback-llm-provider-settings-encrypts-only-secrets-test
  (testing "v64.7qmx3p : the downgrade encrypts what the pre-migration code stored encrypted, and nothing else"
    (encryption-test/with-secret-key "dont-tell-anyone-about-this"
      (impl/test-migrations ["v64.7qmx3p"] [migrate!]
        (insert-llm-settings! {"llm-anthropic-api-key"      "sk-ant-stored"
                               "llm-anthropic-api-base-url" "https://self-hosted.example"
                               "llm-metabot-provider"       "anthropic/claude-opus-4-1"})
        (migrate!)
        (migrate! :down 63)
        (let [raw (into {}
                        (map (juxt :key :value))
                        (t2/query {'select ['key 'value]
                                   'from   'setting
                                   'where  ['in 'key ["llm-anthropic-api-key"
                                                      "llm-anthropic-api-base-url"
                                                      "llm-metabot-provider"]]}))]
          (testing "the API key is sensitive, so it comes back as ciphertext"
            (is (not= "sk-ant-stored" (get raw "llm-anthropic-api-key")))
            (is (= "sk-ant-stored" (encryption/maybe-decrypt-accepting-plaintext (get raw "llm-anthropic-api-key")))))
          (testing "settings declared :encryption :no come back as the plaintext they were declared to hold"
            (is (= "https://self-hosted.example" (get raw "llm-anthropic-api-base-url")))
            (is (= "anthropic/claude-opus-4-1" (get raw "llm-metabot-provider")))))))))

(deftest rollback-llm-provider-settings-managed-round-trip-test
  (testing "v64.7qmx3p : a managed-AI instance survives the round trip — the connection holds no credentials, so
            rolling back only needs to keep the model reference that names it"
    (impl/test-migrations ["v64.7qmx3p"] [migrate!]
      (insert-llm-settings! {"llm-metabot-provider" "metabase/anthropic/claude-sonnet-4-6"})
      (migrate!)
      (is (= [{:key "metabase" :type "metabase" :name "Metabase AI service" :config {}}]
             (llm-connections)))
      (migrate! :down 63)
      (testing "the reference the pre-migration code resolves off the prefix alone is still there"
        (is (= {"llm-metabot-provider" "metabase/anthropic/claude-sonnet-4-6"}
               (llm-setting-values ["llm-metabot-provider"]))))
      (testing "and the list is dropped, so upgrading again re-materializes the connection"
        (is (= {} (llm-setting-values ["llm-providers"])))))))

(deftest rollback-llm-provider-settings-drops-a-blank-config-connection-test
  (testing "v64.7qmx3p : a known-type connection with nothing in its config writes no settings on rollback"
    (impl/test-migrations ["v64.7qmx3p"] [migrate!]
      (migrate!)
      (insert-llm-settings! {"llm-providers" (json/encode [{:key    "anthropic"
                                                            :type   "anthropic"
                                                            :name   "Anthropic"
                                                            :config {}}])})
      (migrate! :down 63)
      (is (= {} (llm-setting-values ["llm-anthropic-api-key" "llm-anthropic-api-base-url"])))
      (testing "and the list is dropped either way"
        (is (= {} (llm-setting-values ["llm-providers"])))))))
