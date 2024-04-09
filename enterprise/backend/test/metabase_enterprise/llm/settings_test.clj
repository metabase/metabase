(ns metabase-enterprise.llm.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.llm.settings :as llm.settings]
   [metabase.test :as mt]))

(deftest ai-features-enabled-test
  (testing "LLM setting `ee-ai-features-enabled`"
    (mt/with-premium-features #{:llm-autodescription}
      (mt/with-temporary-setting-values [ee-openai-api-key nil
                                         ee-ai-features-enabled false]
        (testing "cannot be set and remains `false` when `ee-openai-api-key` is not set."
          (llm.settings/ee-ai-features-enabled! true)
          (is (= false
                 (llm.settings/ee-ai-features-enabled))))
        (testing "can be set to `true` when `ee-openai-api-key` is set."
          (llm.settings/ee-openai-api-key! "TOTALLY_REAL_KEY")
          (llm.settings/ee-ai-features-enabled! true)
          (is (= true
                 (llm.settings/ee-ai-features-enabled))))))))
