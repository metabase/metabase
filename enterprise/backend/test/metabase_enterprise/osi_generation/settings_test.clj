(ns metabase-enterprise.osi-generation.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.osi-generation.settings :as osi-generation.settings]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self :as metabot.self]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(defn- connection
  ([conn-key type] (connection conn-key type {}))
  ([conn-key type config] {:key conn-key :type type :name conn-key :config config}))

(deftest model-falls-back-to-metabot-test
  (testing "unset, generation runs on whatever Metabot runs on"
    (mt/with-temporary-setting-values [osi-generation-model nil
                                       llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (is (= "anthropic/claude-sonnet-4-6" (osi-generation.settings/osi-generation-model)))))
  (testing "set, generation runs on its own reference regardless of Metabot's"
    (mt/with-temporary-setting-values [llm-providers [(connection "openai" "openai")]
                                       osi-generation-model "openai/gpt-5.4"
                                       llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (is (= "openai/gpt-5.4" (osi-generation.settings/osi-generation-model))))))

(deftest model-validation-test
  (testing "the setter rejects a reference with no model"
    (is (thrown? clojure.lang.ExceptionInfo
                 (osi-generation.settings/osi-generation-model! "anthropic"))))
  (testing "a padded value is stored trimmed"
    (mt/discard-setting-changes [osi-generation-model]
      (osi-generation.settings/osi-generation-model! "  anthropic/claude-sonnet-4-6  ")
      (is (= "anthropic/claude-sonnet-4-6" (osi-generation.settings/osi-generation-model))))))

(deftest blank-clears-the-override-test
  (testing "blank clears the override, so generation falls back to Metabot's model"
    (doseq [blank [nil "" "   "]]
      (testing (pr-str blank)
        (mt/with-temporary-setting-values [llm-metabot-provider "anthropic/claude-sonnet-4-6"]
          (mt/discard-setting-changes [osi-generation-model]
            (osi-generation.settings/osi-generation-model! "anthropic/claude-haiku-4-5")
            (osi-generation.settings/osi-generation-model! blank)
            (is (= "anthropic/claude-sonnet-4-6"
                   (osi-generation.settings/osi-generation-model)))))))))

(deftest own-connection-own-credentials-test
  (testing "generation can run on a second connection of the same provider type, with its own API key"
    (mt/with-temporary-setting-values
      [llm-providers        [(connection "anthropic" "anthropic" {:api-key "sk-ant-metabot"})
                             (connection "anthropic-osi" "anthropic" {:api-key "sk-ant-generation"})]
       llm-metabot-provider "anthropic/claude-sonnet-4-6"
       osi-generation-model "anthropic-osi/claude-haiku-4-5"]
      (is (true? (osi-generation.settings/configured?)))
      (is (= :connection (osi-generation.settings/credentials-source
                          (osi-generation.settings/osi-generation-model))))
      (testing "the two resolve to different credentials, so spend and limits stay separate"
        (is (= "sk-ant-generation"
               (:api-key (:credentials (llm.provider/resolve-model-ref
                                        "anthropic-osi/claude-haiku-4-5")))))
        (is (= "sk-ant-metabot"
               (:api-key (:credentials (llm.provider/resolve-model-ref
                                        "anthropic/claude-sonnet-4-6")))))))))

(deftest configured?-test
  (testing "an unusable connection reads unconfigured rather than throwing"
    (mt/with-temporary-setting-values [llm-providers        []
                                       osi-generation-model nil
                                       llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (is (false? (osi-generation.settings/configured?)))
      (is (nil? (osi-generation.settings/credentials-source "anthropic/claude-sonnet-4-6"))))))

(deftest llm-call-opts-test
  (testing "llm-call-opts is the whole generator-facing contract"
    (mt/with-temporary-setting-values [llm-providers        [(connection "anthropic" "anthropic")]
                                       osi-generation-model "anthropic/claude-haiku-4-5"]
      (is (= {:model-ref "anthropic/claude-haiku-4-5"
              :source    osi-generation.settings/usage-source}
             (osi-generation.settings/llm-call-opts))))))

(deftest generation-model-follows-an-edited-azure-deployment-test
  (testing "renaming the deployment moves the generation reference too, not just Metabot's"
    ;; The reference bakes in {family}/{deployment-name}, so without this the connection still reports usable
    ;; while every generation request resolves a deployment that no longer exists.
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values
        [llm-providers [{:key    "azure" :type "azure" :name "azure"
                         :config {:api-key         "azure-key"
                                  :base-url        "https://r.services.ai.azure.com/openai"
                                  :model-family    "openai"
                                  :deployment-name "gpt-4.1-mini"}}]]
        (mt/with-temporary-raw-setting-values [osi-generation-model "azure/openai/gpt-4.1-mini"]
          (mt/user-http-request :crowberto :put 200 "llm/providers/azure"
                                {:config {:deployment-name "gpt-4.1"}})
          (is (= "azure/openai/gpt-4.1" (osi-generation.settings/osi-generation-model))))
        (testing "a reference on another connection is left alone"
          (mt/with-temporary-raw-setting-values [osi-generation-model "anthropic/claude-sonnet-4-6"]
            (mt/user-http-request :crowberto :put 200 "llm/providers/azure"
                                  {:config {:deployment-name "gpt-4.1"}})
            (is (= "anthropic/claude-sonnet-4-6"
                   (osi-generation.settings/osi-generation-model)))))))))

(deftest deleting-the-generation-connection-restores-the-metabot-fallback-test
  (testing "deleting the connection generation ran on clears the override rather than leaving it dangling"
    ;; A dead reference would read as unconfigured, contradicting the setting's documented
    ;; "unset means use Metabot's" behaviour.
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values
        [llm-providers        [(connection "anthropic" "anthropic" {:api-key "sk-ant-metabot"})
                               (connection "anthropic-osi" "anthropic" {:api-key "sk-ant-generation"})]
         llm-metabot-provider "anthropic/claude-sonnet-4-6"]
        (mt/with-temporary-raw-setting-values [osi-generation-model "anthropic-osi/claude-haiku-4-5"]
          (is (= "anthropic-osi/claude-haiku-4-5" (osi-generation.settings/osi-generation-model)))
          (mt/user-http-request :crowberto :delete 204 "llm/providers/anthropic-osi")
          (is (= "anthropic/claude-sonnet-4-6" (osi-generation.settings/osi-generation-model))
              "generation falls back to Metabot's model")
          (is (true? (osi-generation.settings/configured?))
              "and is configured again, rather than pointing at a connection that no longer exists"))))))

(deftest env-supplied-model-is-trimmed-test
  (testing "the environment bypasses the setter, so the read path has to normalize what it finds"
    (mt/with-temporary-setting-values [llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (testing "a padded value still names its connection"
        (mt/with-temp-env-var-value! [mb-osi-generation-model "  anthropic/claude-haiku-4-5  "]
          (is (= "anthropic/claude-haiku-4-5" (osi-generation.settings/osi-generation-model)))))
      (testing "a whitespace-only value is not a choice, so the Metabot fallback still applies"
        (mt/with-temp-env-var-value! [mb-osi-generation-model "   "]
          (is (= "anthropic/claude-sonnet-4-6" (osi-generation.settings/osi-generation-model))))))))

(deftest malformed-env-model-is-not-configured-test
  (testing "a bare connection key from the environment reports unconfigured rather than failing at the call"
    ;; The setter rejects a reference with no model; the environment bypasses it.
    (mt/with-temporary-setting-values [llm-providers        [(connection "anthropic" "anthropic"
                                                                         {:api-key "sk-ant"})]
                                       llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (mt/with-temp-env-var-value! [mb-osi-generation-model "anthropic"]
        (is (= "anthropic" (osi-generation.settings/osi-generation-model)))
        (is (false? (osi-generation.settings/configured?)))))))

(deftest creating-a-connection-realigns-a-waiting-reference-test
  (testing "a reference stored before its connection existed follows the deployment that connection serves"
    ;; `validate-model-ref!` allows a reference to name a connection that does not exist yet, so the
    ;; reference can be older than the connection it names.
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [& _] {:models []})]
      (mt/with-temporary-setting-values [llm-providers        []
                                         llm-metabot-provider "anthropic/claude-sonnet-4-6"]
        (mt/with-temporary-raw-setting-values [osi-generation-model "azure/openai/old-deployment"]
          (mt/user-http-request :crowberto :post 200 "llm/providers"
                                {:key    "azure"
                                 :type   "azure"
                                 :name   "azure"
                                 :config {:api-key         "azure-key"
                                          :base-url        "https://r.services.ai.azure.com/openai"
                                          :model-family    "openai"
                                          :deployment-name "new-deployment"}})
          (is (= "azure/openai/new-deployment" (osi-generation.settings/osi-generation-model))))))))

(deftest env-reference-the-call-path-would-reject-is-not-configured-test
  (testing "a reference only the setter would have caught reports unconfigured, not ready-then-failing"
    ;; `MB_OSI_GENERATION_MODEL` bypasses `normalize-model-ref`, so these reach the gate unvalidated.
    (mt/with-temporary-setting-values
      [llm-providers        [(connection "azure" "azure" {:api-key         "azure-key"
                                                          :base-url        "https://r.services.ai.azure.com/openai"
                                                          :model-family    "openai"
                                                          :deployment-name "d1"})
                             (connection "bedrock" "bedrock" {:access-key-id     "AKIA"
                                                              :secret-access-key "secret"
                                                              :region            "us-east-1"})
                             (connection "anthropic" "anthropic" {:api-key "sk-ant"})]
       llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (testing "an Azure model missing its {family}/{deployment} shape"
        (mt/with-temp-env-var-value! [mb-osi-generation-model "azure/not-a-family"]
          (is (false? (osi-generation.settings/configured?)))
          (is (nil? (osi-generation.settings/credentials-source "azure/not-a-family")))))
      (testing "a Bedrock model with no vendor prefix — the adapter routes on that prefix"
        (mt/with-temp-env-var-value! [mb-osi-generation-model "bedrock/unsupported"]
          (is (false? (osi-generation.settings/configured?)))))
      (testing "a Bedrock vendor prefix naming no model"
        (mt/with-temp-env-var-value! [mb-osi-generation-model "bedrock/anthropic."]
          (is (false? (osi-generation.settings/configured?)))))
      (testing "an env-pinned Azure reference the connection no longer serves"
        ;; The edit path repoints stored references; an env-pinned one cannot be rewritten, so it would
        ;; otherwise report ready and call a deployment that is gone.
        (mt/with-temp-env-var-value! [mb-osi-generation-model "azure/openai/was-renamed"]
          (is (false? (osi-generation.settings/configured?)))))
      (testing "a managed model outside the proxy's catalog"
        (mt/with-temp-env-var-value! [mb-osi-generation-model "metabase/anthropic/not-served"]
          (is (false? (osi-generation.settings/configured?)))))
      (testing "a well-formed reference on a usable connection is still configured"
        (mt/with-temp-env-var-value! [mb-osi-generation-model "azure/openai/d1"]
          (is (true? (osi-generation.settings/configured?))))))))

(deftest readiness-never-throws-test
  (testing "the public configured? setting must not raise for a reference the validator rejects"
    ;; It backs `osi-generation-llm-configured?`, read unauthenticated in session properties, so the
    ;; validator's refusal has to become false rather than propagate. The connections below are
    ;; deliberately usable: with none configured the readiness check short-circuits before it ever
    ;; reaches the validator, and this would pass without proving anything.
    (mt/with-temporary-setting-values
      [llm-providers        [(connection "azure" "azure" {:api-key         "azure-key"
                                                          :base-url        "https://r.services.ai.azure.com/openai"
                                                          :model-family    "openai"
                                                          :deployment-name "d1"})
                             (connection "anthropic" "anthropic" {:api-key "sk-ant"})]
       llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (doseq [bad ["azure/nope" "azure/not-a-family/x/y" "metabase/anthropic/not-served"]]
        (testing (pr-str bad)
          (mt/with-temp-env-var-value! [mb-osi-generation-model bad]
            (is (false? (osi-generation.settings/osi-generation-llm-configured?)))))))))
