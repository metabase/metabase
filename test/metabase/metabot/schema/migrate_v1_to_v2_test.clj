(ns metabase.metabot.schema.migrate-v1-to-v2-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.schema.migrate-v1-to-v2 :as migrate]
   [metabase.metabot.schema.v2 :as schema.v2]
   [metabase.metabot.util :as metabot.u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel migrate-v1-external-ai-service->v2-test
  (testing "TEXT becomes a text part"
    (is (= [{:type "text" :text "hello"}]
           (migrate/migrate-v1-external-ai-service->v2
            [{:role "assistant" :_type "TEXT" :content "hello"}]))))
  (testing "batched TOOL_CALL entries split into one part per call, merged with TOOL_RESULTs in position"
    (is (= [{:type "text" :text "before"}
            {:type "tool-search" :tool_call_id "a" :state "output-available" :input {:q "x"} :output {:output "r1"}}
            {:type "tool-browse" :tool_call_id "b" :state "output-available" :input {} :output {:output "r2"}}
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
      (is (= [{:type "tool-search" :tool_call_id "tc1" :state "output-available" :input {:q "x"} :output {:output "rows"}}]
             (migrate/migrate-v1-native->v2
              [tool-input
               {:type "tool-output" :id "tc1" :result {:output "rows"} :error nil :duration-ms 3}]))))
    (testing "empty result map still produces the :output key"
      (let [[part] (migrate/migrate-v1-native->v2
                    [tool-input {:type "tool-output" :id "tc1" :result {}}])]
        (is (= "output-available" (:state part)))
        (is (contains? part :output))
        (is (= {} (:output part)))))
    (testing "tool-output with a string :error becomes output-error with :error_text and no :output"
      (let [[part] (migrate/migrate-v1-native->v2
                    [tool-input {:type "tool-output" :id "tc1" :result {} :error "boom"}])]
        (is (= "output-error" (:state part)))
        (is (= "boom" (:error_text part)))
        (is (not (contains? part :output)))))
    (testing "map-shaped :error extracts :message"
      (is (= "bad"
             (-> (migrate/migrate-v1-native->v2
                  [tool-input {:type "tool-output" :id "tc1" :error {:message "bad"}}])
                 first :error_text))))
    (testing "map-shaped :error without :message falls back to pr-str"
      (is (= "{:code 500}"
             (-> (migrate/migrate-v1-native->v2
                  [tool-input {:type "tool-output" :id "tc1" :error {:code 500}}])
                 first :error_text))))
    (testing "tool-input without a matching output stays input-available"
      (let [[part] (migrate/migrate-v1-native->v2 [tool-input])]
        (is (= "input-available" (:state part)))
        (is (not (contains? part :output)))
        (is (not (contains? part :error_text))))))
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
               [{:type "error" :error {:message "boom"}}])))))

(deftest ^:parallel migrate-v1->v2-dispatch-test
  (testing "ai-service shape dispatches"
    (is (= ["text" "tool-search" "data-navigate_to"]
           (mapv :type (migrate/migrate-v1->v2
                        [{:role "assistant" :_type "TEXT" :content "hi"}
                         {:role "assistant" :_type "TOOL_CALL"
                          :tool_calls [{:id "tc1" :name "search" :arguments "{}"}]}
                         {:role "tool" :_type "TOOL_RESULT" :tool_call_id "tc1" :content "r"}
                         {:_type "DATA" :type "navigate_to" :version 1 :value "/q/1"}])))))
  (testing "native shape dispatches, including rows with data entries"
    (is (= ["tool-search" "text" "data-state"]
           (mapv :type (migrate/migrate-v1->v2
                        [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "x"}}
                         {:type "tool-output" :id "tc1" :result {:output "rows"}}
                         {:type "text" :id "t1" :text "Found it"}
                         {:type "data" :data-type "state" :version 1 :data {}}])))))
  (testing "user messages convert to text parts"
    (is (= [{:type "text" :text "Do we have data on orders"}]
           (migrate/migrate-v1->v2
            [{:role "user" :content "Do we have data on orders"}]))))
  (testing "empty data passes through unchanged"
    (is (= [] (migrate/migrate-v1->v2 []))))
  (testing "unrecognized shapes throw"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unrecognized v1 storage format"
                          (migrate/migrate-v1->v2
                           [{:role "assistant" :some-unknown-key "x"}])))))

(def ^:private v1-rows
  [[{:role "assistant" :_type "TEXT" :content "hello"}
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
   []])

(deftest ^:parallel migrated-output-validates-against-v2-schema-test
  (doseq [row v1-rows]
    (testing (pr-str row)
      (is (nil? (mr/explain ::schema.v2/message-data
                            (migrate/migrate-v1->v2 row)))))))

(defn- persistence-round-trip
  "Simulate `mi/transform-json` write + read: keyword values become strings, keys stay keywords."
  [x]
  (-> x json/encode json/decode+kw))

(deftest ^:parallel fixture-parity-test
  (doseq [n [1 2 3 4]]
    (testing (str "aisdkstream" n ".txt")
      (let [messages (metabot.u/aisdk->messages "assistant"
                                                (-> (io/resource (str "metabase/metabot/aisdkstream" n ".txt"))
                                                    io/reader
                                                    line-seq))]
        (is (nil? (mr/explain ::schema.v2/message-data
                              (migrate/migrate-v1->v2 (persistence-round-trip messages)))))))))
