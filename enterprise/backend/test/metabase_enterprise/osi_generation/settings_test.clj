(ns metabase-enterprise.osi-generation.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.osi-generation.settings :as osi-generation.settings]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]))

(comment osi-generation.settings/keep-me)

(deftest ^:parallel provider-and-model-falls-back-test
  (testing "unset osi-generation-provider inherits llm-metabot-provider; set returns its own value"
    (mt/with-dynamic-fn-redefs [osi-generation.settings/osi-generation-provider (constantly nil)
                                metabot.settings/llm-metabot-provider (constantly "anthropic/inherited")]
      (is (= "anthropic/inherited" (osi-generation.settings/provider-and-model))))
    (mt/with-dynamic-fn-redefs [osi-generation.settings/osi-generation-provider (constantly " openai/dedicated ")
                                metabot.settings/llm-metabot-provider (constantly "anthropic/inherited")]
      (is (= "openai/dedicated" (osi-generation.settings/provider-and-model))))))

(deftest provider-validation-test
  (testing "the setter rejects an unknown provider, a blank model and a bad azure/family/deployment; nil means inherit"
    (doseq [invalid ["unknown/model" "anthropic/" "azure/family"]]
      (is (thrown? clojure.lang.ExceptionInfo
                   (osi-generation.settings/osi-generation-provider! invalid))
          invalid))))

(deftest ^:parallel shared-credentials-test
  (testing "generation uses the selected provider's existing LLM credentials and attributes cost by usage source"
    (mt/with-dynamic-fn-redefs [metabot.settings/configured-provider-credentials
                                (fn [provider]
                                  (when (= provider "anthropic")
                                    {:api-key "sk-ant-shared"}))]
      (is (= {:api-key "sk-ant-shared"} (osi-generation.settings/credentials "anthropic")))
      (is (= :metabot (osi-generation.settings/credentials-source "anthropic/model")))
      (is (nil? (osi-generation.settings/credentials "openai"))))))

(deftest ^:parallel credentials-no-cross-provider-test
  (testing "credentials are always resolved for the selected provider, never Metabot's selected model"
    (mt/with-dynamic-fn-redefs [osi-generation.settings/osi-generation-provider (constantly "openai/model")
                                metabot.settings/configured-provider-credentials
                                (fn [provider]
                                  (when (= provider "anthropic")
                                    {:api-key "sk-ant-shared"}))]
      (is (nil? (osi-generation.settings/credentials "openai")))
      (is (false? (osi-generation.settings/configured?))))))

(deftest ^:parallel configured?-proxy-test
  (testing "a metabase/* provider is configured from the proxy URL alone, with source :proxy"
    (mt/with-dynamic-fn-redefs [osi-generation.settings/osi-generation-provider (constantly "metabase/anthropic/model")
                                llm.settings/llm-proxy-base-url (constantly "https://proxy.example")]
      (is (true? (osi-generation.settings/configured?)))
      (is (= :proxy (osi-generation.settings/credentials-source "metabase/anthropic/model")))
      (is (not (contains? (osi-generation.settings/llm-call-opts) :credentials))))
    (mt/with-dynamic-fn-redefs [osi-generation.settings/osi-generation-provider (constantly "metabase/anthropic/model")
                                llm.settings/llm-proxy-base-url (constantly nil)]
      (is (false? (osi-generation.settings/configured?)))
      (is (nil? (osi-generation.settings/credentials-source "metabase/anthropic/model"))))
    (mt/with-dynamic-fn-redefs [osi-generation.settings/osi-generation-provider (constantly "metabase/anthropic/model")
                                llm.settings/llm-proxy-base-url (constantly "   ")]
      (is (false? (osi-generation.settings/configured?)))
      (is (nil? (osi-generation.settings/credentials-source "metabase/anthropic/model"))))))

(deftest ^:parallel llm-call-opts-test
  (testing "llm-call-opts is the whole generator-facing contract"
    (mt/with-dynamic-fn-redefs [osi-generation.settings/osi-generation-provider (constantly "anthropic/model")]
      (is (= {:provider-and-model "anthropic/model"
              :source             osi-generation.settings/usage-source}
             (osi-generation.settings/llm-call-opts))))))
