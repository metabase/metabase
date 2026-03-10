(ns metabase-enterprise.metabot-v3.util-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.util :as metabot.u]))

(deftest ^:parallel aisdk-line-parse-test
  (testing "We should be able to parse AI SDK streaming format to ai-service format 1"
    (is (=? [{:role       "assistant"
              :_type      :TOOL_CALL
              :tool_calls [{:id        "call_hZ6Q9AwsxqXaL0lbtpoAEdBi"
                            :name      "construct_notebook_query"
                            :arguments #"\{\"query_plan\":.*\}"}]}
             {:role         "tool"
              :_type        :TOOL_RESULT
              :tool_call_id "call_hZ6Q9AwsxqXaL0lbtpoAEdBi"
              :content      #"(?s)\n<result>.*</instructions>"}
             {:role    "assistant"
              :_type   :TEXT
              :content #"(?s)I created.*let me know!"}
             {:type    "state"
              :_type   :DATA
              :version 1
              :value   {}}
             {:finish_reason "stop"
              :_type         :FINISH_MESSAGE
              :usage         {}}]
            (metabot.u/aisdk->messages "assistant"
                                       (-> (io/resource "metabase_enterprise/metabot_v3/aisdkstream1.txt")
                                           io/reader
                                           line-seq)))))
  (testing "We should be able to parse AI SDK streaming format to ai-service format 2"
    (is (=? [{:role       "assistant"
              :_type      :TOOL_CALL
              :tool_calls [{:id        "call_sJpEjRXSqi5vSjAOJXFdJhjt"
                            :name      "create_chart"
                            :arguments #"\{\"data_source\":.*\}"}]}
             {:role         "tool"
              :_type        :TOOL_RESULT
              :tool_call_id "call_sJpEjRXSqi5vSjAOJXFdJhjt"
              :content      #"(?s)\n<result>.*</instructions>"}
             {:role       "assistant"
              :_type      :TOOL_CALL
              :tool_calls [{:id        "call_oPCH01Dt3jlFAwRuemtq9fTt"
                            :name      "navigate_user"
                            :arguments #"\{\"destination\":.*\}"}]}
             {:type    "navigate_to"
              :_type   :DATA
              :version 1
              :value   #"/question#eyJ.*"}
             {:role         "tool"
              :_type        :TOOL_RESULT
              :tool_call_id "call_oPCH01Dt3jlFAwRuemtq9fTt"
              :content      #"(?s)The user now can see the result of the chart.*"}
             {:role    "assistant"
              :_type   :TEXT
              :content #"(?s)I created.*more details!"}
             {:type    "state"
              :_type   :DATA
              :version 1
              :value   {}}
             {:finish_reason "stop"
              :_type         :FINISH_MESSAGE
              :usage         {}}]
            (metabot.u/aisdk->messages "assistant"
                                       (-> (io/resource "metabase_enterprise/metabot_v3/aisdkstream2.txt")
                                           io/reader
                                           line-seq)))))
  (testing "We should be able to parse AI SDK streaming format with error messages 3"
    (is (=? [{:role    "assistant"
              :_type   :ERROR
              :content #"litellm.ServiceUnavailableError: litellm.MidStreamFallbackError:.*Connection closed."}
             {:finish_reason "error"
              :_type         :FINISH_MESSAGE
              :usage         {}}]
            (metabot.u/aisdk->messages "assistant"
                                       (-> (io/resource "metabase_enterprise/metabot_v3/aisdkstream3.txt")
                                           io/reader
                                           line-seq)))))
  (testing "We should be able to parse AI SDK streaming format with error messages 4"
    (is (=? [{:role    "assistant"
              :_type   :TEXT
              :content #"(?s)I'll help.*find the right source."}
             {:role       "assistant"
              :_type      :TOOL_CALL
              :tool_calls [{:id        "toolu_bdrk_01GPPfFCzqWpZhsDdGMi9mYi"
                            :name      "search"
                            :arguments #"\{\"semantic_queries\":.*\}"}]}
             {:role         "tool"
              :_type        :TOOL_RESULT
              :tool_call_id "toolu_bdrk_01GPPfFCzqWpZhsDdGMi9mYi"
              :content      #"(?s)\n<result>.*</instructions>"}
             {:role    "assistant"
              :_type   :ERROR
              :content #"litellm.Timeout: Timeout Error: OpenrouterException.*seconds"}
             {:finish_reason "error"
              :_type         :FINISH_MESSAGE
              :usage         {}}]
            (metabot.u/aisdk->messages "assistant"
                                       (-> (io/resource "metabase_enterprise/metabot_v3/aisdkstream4.txt")
                                           io/reader
                                           line-seq))))))
