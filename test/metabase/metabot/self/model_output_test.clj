(ns metabase.metabot.self.model-output-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]))

(deftest ^:parallel provider-adapters-prefer-model-output-test
  (testing "all providers prefer compact model output, preserve ordering, and fall back to :output"
    (let [compact-output (str "<result query-id=\"q-1\"><summary>20 of 500 rows</summary>"
                              "<citation id=\"citation-1\" /></result>")
          legacy-output  "<result query-id=\"q-2\"><summary>legacy output</summary></result>"
          full-result    {:output            (str "<result query-id=\"q-1\"><rows>all 500 rows</rows>"
                                                  "<citation id=\"citation-1\" /></result>")
                          :model-output      compact-output
                          :structured-output {:query-id "q-1"
                                              :row-count 500
                                              :citations [{:id "citation-1"}]}}
          parts          [{:type :tool-output :id "call-1" :result full-result}
                          {:type :tool-output :id "call-2" :result {:output legacy-output}}]
          openai-output  (mapv :output (openai/parts->openai-input parts))
          claude-output  (mapv :content (-> (claude/parts->claude-messages parts) first :content))
          router-output  (mapv :content
                               (:messages (openrouter/openrouter-request-body
                                           {:model "openai/gpt-5.4" :input parts})))]
      (is (= [compact-output legacy-output] openai-output))
      (is (= [compact-output legacy-output] claude-output))
      (is (= [compact-output legacy-output] router-output))
      (is (= full-result (:result (first parts)))
          "adapter conversion does not mutate or replace the full result"))))
