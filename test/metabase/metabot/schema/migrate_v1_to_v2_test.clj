(ns metabase.metabot.schema.migrate-v1-to-v2-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.schema.migrate-v1-to-v2 :as migrate]
   [metabase.metabot.schema.v2 :as schema.v2]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel migrate-v1-external-ai-service->v2-test
  (testing "TEXT becomes a text part"
    (is (= [{:type "text" :text "hello"}]
           (migrate/migrate-v1-external-ai-service->v2
            [{:role "assistant" :_type "TEXT" :content "hello"}]))))
  (testing "batched TOOL_CALL entries split into one part per call, merged with TOOL_RESULTs in position"
    (is (= [{:type "text" :text "before"}
            {:type "tool-search" :toolCallId "a" :state "output-available" :input {:q "x"} :output {:output "r1"}}
            {:type "tool-browse" :toolCallId "b" :state "output-available" :input {} :output {:output "r2"}}
            {:type "text" :text "after"}]
           (migrate/migrate-v1-external-ai-service->v2
            [{:role "assistant" :_type "TEXT" :content "before"}
             {:role "assistant" :_type "TOOL_CALL"
              :tool_calls [{:id "a" :name "search" :arguments "{\"q\":\"x\"}"}
                           {:id "b" :name "browse" :arguments "{}"}]}
             {:role "tool" :_type "TOOL_RESULT" :tool_call_id "a" :content "r1"}
             {:role "tool" :_type "TOOL_RESULT" :tool_call_id "b" :content "r2"}
             {:role "assistant" :_type "TEXT" :content "after"}]))))
  (testing "tool name underscores are preserved in :type"
    (is (= "tool-create_sql_query"
           (-> (migrate/migrate-v1-external-ai-service->v2
                [{:role "assistant" :_type "TOOL_CALL"
                  :tool_calls [{:id "tc1" :name "create_sql_query" :arguments "{}"}]}])
               first :type))))
  (testing "TOOL_CALL without a matching result stays input-available with no :output"
    (let [[part] (migrate/migrate-v1-external-ai-service->v2
                  [{:role "assistant" :_type "TOOL_CALL"
                    :tool_calls [{:id "tc1" :name "search" :arguments "{}"}]}])]
      (is (= "input-available" (:state part)))
      (is (not (contains? part :output)))))
  (testing "malformed :arguments JSON falls back to the raw string"
    (is (= "not-json"
           (-> (migrate/migrate-v1-external-ai-service->v2
                [{:role "assistant" :_type "TOOL_CALL"
                  :tool_calls [{:id "tc1" :name "search" :arguments "not-json"}]}])
               first :input))))
  (testing "orphan TOOL_RESULT is dropped"
    (is (= [] (migrate/migrate-v1-external-ai-service->v2
               [{:role "tool" :_type "TOOL_RESULT" :tool_call_id "nope" :content "x"}]))))
  (testing "DATA becomes a data-<type> part, dropping :version"
    (is (= [{:type "data-navigate_to" :data "/metric/17991"}]
           (migrate/migrate-v1-external-ai-service->v2
            [{:_type "DATA" :type "navigate_to" :version 1 :value "/metric/17991"}]))))
  (testing "FINISH_MESSAGE and ERROR are dropped"
    (is (= [{:type "text" :text "hi"}]
           (migrate/migrate-v1-external-ai-service->v2
            [{:role "assistant" :_type "TEXT" :content "hi"}
             {:role "assistant" :_type "ERROR" :content "upstream provider error"}
             {:role "assistant" :_type "FINISH_MESSAGE" :finish_reason "stop" :usage {}}]))))
  (testing "unknown :_type throws"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unrecognized v1 ai-service entry type"
                          (migrate/migrate-v1-external-ai-service->v2
                           [{:role "assistant" :_type "REASONING" :content "hmm"}])))))

(deftest ^:parallel migrate-v1-native->v2-test
  (let [tool-input {:type "tool-input" :id "tc1" :function "search" :arguments {:q "x"}}]
    (testing "tool-input merged with tool-output becomes output-available carrying the result map"
      (is (= [{:type "tool-search" :toolCallId "tc1" :state "output-available" :input {:q "x"} :output {:output "rows"}}]
             (migrate/migrate-v1-native->v2
              [tool-input
               {:type "tool-output" :id "tc1" :result {:output "rows"} :error nil :duration-ms 3}]))))
    (testing "empty result map still produces the :output key"
      (let [[part] (migrate/migrate-v1-native->v2
                    [tool-input {:type "tool-output" :id "tc1" :result {}}])]
        (is (= "output-available" (:state part)))
        (is (contains? part :output))
        (is (= {} (:output part)))))
    (testing "tool-output with a string :error becomes output-error with :errorText and no :output"
      (let [[part] (migrate/migrate-v1-native->v2
                    [tool-input {:type "tool-output" :id "tc1" :result {} :error "boom"}])]
        (is (= "output-error" (:state part)))
        (is (= "boom" (:errorText part)))
        (is (not (contains? part :output)))))
    (testing "map-shaped :error extracts :message"
      (is (= "bad"
             (-> (migrate/migrate-v1-native->v2
                  [tool-input {:type "tool-output" :id "tc1" :result nil :error {:message "bad"}}])
                 first :errorText))))
    (testing "map-shaped :error without :message falls back to pr-str"
      (is (= "{:code 500}"
             (-> (migrate/migrate-v1-native->v2
                  [tool-input {:type "tool-output" :id "tc1" :result nil :error {:code 500}}])
                 first :errorText))))
    (testing "map-shaped :error with a non-string :message falls back to pr-str"
      (is (= "{:message {:code 500}}"
             (-> (migrate/migrate-v1-native->v2
                  [tool-input {:type "tool-output" :id "tc1" :result nil :error {:message {:code 500}}}])
                 first :errorText))))
    (testing "tool-input without a matching output stays input-available"
      (let [[part] (migrate/migrate-v1-native->v2 [tool-input])]
        (is (= "input-available" (:state part)))
        (is (not (contains? part :output)))
        (is (not (contains? part :errorText))))))
  (testing "text passes through with :id stripped"
    (is (= [{:type "text" :text "Found it"}]
           (migrate/migrate-v1-native->v2
            [{:type "text" :id "t1" :text "Found it"}]))))
  (testing "data entries convert like external DATA entries"
    (is (= [{:type "data-navigate_to" :data "/question/1"}]
           (migrate/migrate-v1-native->v2
            [{:type "data" :data-type "navigate_to" :version 1 :data "/question/1"}]))))
  (testing "error entries are dropped"
    (is (= [] (migrate/migrate-v1-native->v2
               [{:type "error" :error {:message "boom"}}]))))
  (testing "unknown :type throws"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unrecognized v1 native entry type"
                          (migrate/migrate-v1-native->v2
                           [{:type "reasoning" :text "hmm"}])))))

(deftest ^:parallel migrate-v1-user-message->v2-test
  (testing "user messages convert to text parts"
    (is (= [{:type "text" :text "Do we have data on orders"}]
           (migrate/migrate-v1-user-message->v2
            [{:role "user" :content "Do we have data on orders"}])))))

(deftest ^:parallel migrate-v1->v2-invalid-data-test
  (testing "a row resembling a v1 shape but failing its schema throws, explaining against the format it resembles"
    (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unrecognized v1 storage format"
                                  (migrate/migrate-v1->v2 [{:type "text"}])))]
      (is (= [{:text ["missing required key"]}]
             (:explanation (ex-data e)))))))

(deftest ^:parallel migrated-rows-validate-test
  (testing "migrating every v1 row shape should produce valid v2 message data"
    ;; one row per v1 storage format — ai-service, native, user message, and empty —
    ;; collectively exercising every entry type a format can hold
    (let [v1-rows [[{:role "assistant" :_type "TEXT" :content "hello"}
                    {:role "assistant" :_type "TOOL_CALL"
                     :tool_calls [{:id "a" :name "create_sql_query" :arguments "{\"q\":\"x\"}"}
                                  {:id "b" :name "browse" :arguments "{}"}]}
                    {:role "tool" :_type "TOOL_RESULT" :tool_call_id "a" :content "r1"}
                    {:_type "DATA" :type "navigate_to" :version 1 :value "/q/1"}
                    {:role "assistant" :_type "FINISH_MESSAGE" :finish_reason "stop" :usage {}}]
                   [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "x"}}
                    {:type "tool-output" :id "tc1" :result {:output "rows"} :error nil :duration-ms 3}
                    {:type "tool-input" :id "tc2" :function "browse" :arguments {}}
                    {:type "tool-output" :id "tc2" :result {} :error {:message "boom"}}
                    {:type "tool-input" :id "tc3" :function "search" :arguments {:q "y"}}
                    {:type "text" :id "t1" :text "Found it"}
                    {:type "data" :data-type "state" :version 1 :data {}}
                    {:type "error" :error {:message "boom"}}]
                   [{:role "user" :content "Do we have data on orders"}]
                   []]]
      (is (nil? (mr/explain [:sequential ::schema.v2/message-data]
                            (mapv migrate/migrate-v1->v2 v1-rows)))))))
