(ns metabase.metabot.self.catalog-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.llm.provider :as llm.provider]
   [metabase.llm.test-util :as llm.tu]
   [metabase.metabot.self.catalog :as catalog]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest model-display-name-test
  (mt/with-temporary-setting-values [llm-providers llm.tu/default-connections]
    (testing "a model reference reads back as the name the picker shows for it, with no request to the provider"
      (is (= "Claude Sonnet 4.6" (catalog/model-display-name "anthropic/claude-sonnet-4-6")))
      (is (= "GPT-5.4 Mini" (catalog/model-display-name "openai/gpt-5.4-mini")))
      (is (= "Claude Haiku 4.5" (catalog/model-display-name "openrouter/anthropic/claude-haiku-4.5")))
      (is (= "Mistral Medium 3.5" (catalog/model-display-name "mistral/mistral-medium-3-5")))
      (is (= "GLM-5.2" (catalog/model-display-name "zai/glm-5.2")))
      (is (= "Kimi K3" (catalog/model-display-name "moonshot/kimi-k3")))
      (is (= "Claude Haiku 4.5" (catalog/model-display-name "bedrock/anthropic.claude-haiku-4-5"))))
    (testing "a type whose catalog the registry carries is named from it, not from an adapter whitelist"
      (is (= "Gemini 3.5 Flash" (catalog/model-display-name "google/google/gemini-3.5-flash"))))
    (testing "the managed connection is named by the adapter its model routes to"
      (is (= "Claude Sonnet 4.6" (catalog/model-display-name "metabase/anthropic/claude-sonnet-4-6"))))
    (testing "nothing names an Azure deployment, a model outside the whitelist, or a missing connection"
      (is (nil? (catalog/model-display-name "azure/openai/gpt-4.1-mini")))
      (is (nil? (catalog/model-display-name "anthropic/claude-2")))
      (is (nil? (catalog/model-display-name "gone/whatever"))))))

(deftest model-name-falls-back-to-the-id-test
  (mt/with-temporary-setting-values [llm-providers llm.tu/default-connections]
    (testing "an unnamed model shows the id it was configured with rather than an invented name"
      (is (= "openai/gpt-4.1-mini" (catalog/model-name "azure/openai/gpt-4.1-mini")))
      (is (= "claude-2" (catalog/model-name "anthropic/claude-2"))))
    (testing "a named one shows its name"
      (is (= "Claude Sonnet 4.6" (catalog/model-name "anthropic/claude-sonnet-4-6"))))))

(deftest every-whitelist-backed-type-is-wired-into-the-catalog-test
  (testing "a provider type whose models come from an adapter whitelist must be dispatched here, or its models
            would silently show as raw ids the moment Metabot switches to it. Types whose models the connection
            itself names (Azure, Google, vLLM) or the registry fixes (the managed provider) are exempt: the id is
            already the human-facing name."
    (doseq [{:keys [type default-model model-fields models managed?]} (llm.provider/provider-types)
            :when (and default-model (nil? model-fields) (nil? models) (not managed?))]
      (testing type
        (is (some? (#'catalog/provider-model-display-name type default-model))
            (str "the " type " adapter's whitelist is not wired into catalog/provider-model-display-name"))))))
