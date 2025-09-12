(ns metabase-enterprise.metabot-v3.util-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.util :as metabot.u]))

(deftest aisdk-line-parse-test
  (testing "We should be able to parse AI SDK streaming format to ai-service format 1"
    (is (=? [{:role       "assistant"
              :tool_calls [{:id        "call_hZ6Q9AwsxqXaL0lbtpoAEdBi"
                            :name      "construct_notebook_query"
                            :arguments #"\{\"query_plan\":.*\}"}]}
             {:role         "tool"
              :tool_call_id "call_hZ6Q9AwsxqXaL0lbtpoAEdBi"
              :content      #"(?s)\n<result>.*</instructions>"}
             {:role    "assistant"
              :content #"(?s)I created.*let me know!"}
             {:type    "state"
              :version 1
              :value   {}}
             {:finish_reason "stop"
              :usage         {}}]
            (metabot.u/aisdk->messages "assistant"
                                       (-> (io/resource "metabase_enterprise/metabot_v3/aisdkstream1.txt")
                                           io/reader
                                           line-seq)))))
  (testing "We should be able to parse AI SDK streaming format to ai-service format 2"
    (is (=? [{:role       "assistant"
              :tool_calls [{:id        "call_sJpEjRXSqi5vSjAOJXFdJhjt"
                            :name      "create_chart"
                            :arguments #"\{\"data_source\":.*\}"}]}
             {:role         "tool"
              :tool_call_id "call_sJpEjRXSqi5vSjAOJXFdJhjt"
              :content      #"(?s)\n<result>.*</instructions>"}
             {:role       "assistant"
              :tool_calls [{:id        "call_oPCH01Dt3jlFAwRuemtq9fTt"
                            :name      "navigate_user"
                            :arguments #"\{\"destination\":.*\}"}]}
             {:type    "navigate_to"
              :version 1
              :value   #"/question#eyJ.*"}
             {:role         "tool"
              :tool_call_id "call_oPCH01Dt3jlFAwRuemtq9fTt"
              :content      #"(?s)The user now can see the result of the chart.*"}
             {:role    "assistant"
              :content #"(?s)I created.*more details!"}
             {:type    "state"
              :version 1
              :value   {}}
             {:finish_reason "stop"
              :usage         {}}]
            (metabot.u/aisdk->messages "assistant"
                                       (-> (io/resource "metabase_enterprise/metabot_v3/aisdkstream2.txt")
                                           io/reader
                                           line-seq))))))
