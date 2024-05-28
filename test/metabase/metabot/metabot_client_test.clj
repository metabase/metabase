(ns metabase.metabot.metabot-client-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.client :as metabot-client]))

(deftest invoke-metabot-test
  (testing "A simple test showing the expected input and output of invoke-metabot"
    (let [result {:choices [{:message "SELECT * FROM SOMETHING"}]}]
      (with-redefs [metabot-client/*create-chat-completion-endpoint* (fn [_prompt _options]
                                                                       result)]
        (= result
           (metabot-client/invoke-metabot
            {:model    "gpt-4"
             :n        1
             :messages [{:role "system", :content "You are a helpful assistant that writes SQL..."}
                        {:role "assistant", :content "Instruction 1"}
                        {:role "assistant", :content "Instruction 2"}
                        {:role "user", :content "Some prompt"}]}))))))

(deftest create-embedding-test
  (testing "A simple test showing the expected input and output of create-embedding"
    (with-redefs [metabot-client/*create-embedding-endpoint* (fn [{:keys [_model input]} _options]
                                                               {:data  [{:embedding [1.0 0.0 0.0 0.0]}]
                                                                :usage {:prompt_tokens (quot
                                                                                        (count input)
                                                                                        4)}})]
      ;; Note that the "rule of thumb" for token usage is string chars / 4, but this can be all over the place.
      (= {:prompt    "123412341"
          :embedding [1.0 0.0 0.0 0.0]
          :tokens    2}
         (metabot-client/create-embedding "123412341")))))
