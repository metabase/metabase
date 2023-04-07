(ns metabase.metabot.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.settings :as metabot-settings]))

(deftest select-models-test
  (testing "Ensure we are downselecting to the right models."
    (let [wierd-models (shuffle
                        [{:id "froob", :owned_by "openai"}
                         {:id "froob-32", :owned_by "openai"}
                         {:id "gpt-3.5-turbo", :owned_by "openai"}
                         {:id "gpt-3.5-turbo-0301", :owned_by "openai"}
                         {:id "gpt-4", :owned_by "openai"}
                         {:id "GPT-4.1", :owned_by "openai"}
                         {:id "gpt-4.0", :owned_by "openai"}
                         {:id "gpt-4.55", :owned_by "openai"}
                         {:id "gpt-4-0314", :owned_by "openai"}
                         {:id "gpt-5", :owned_by "openai"}
                         {:id "gpt-5.0", :owned_by "openai"}])]
      (is (= [{:id "gpt-5.0", :owned_by "openai"}
              {:id "gpt-4.55", :owned_by "openai"}
              {:id "gpt-3.5-turbo", :owned_by "openai"}]
             (#'metabot-settings/select-models wierd-models))))
    (let [realistic-models (shuffle
                            [{:id "gpt-3.5-turbo", :owned_by "openai"}
                             {:id "gpt-3.5-turbo-0301", :owned_by "openai"}
                             {:id "gpt-4", :owned_by "openai"}
                             {:id "gpt-4-0314", :owned_by "openai"}])]
      (is (= [{:id "gpt-4", :owned_by "openai"}
              {:id "gpt-3.5-turbo", :owned_by "openai"}]
             (#'metabot-settings/select-models realistic-models))))))
