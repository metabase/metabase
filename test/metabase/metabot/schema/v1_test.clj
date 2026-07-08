(ns metabase.metabot.schema.v1-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.schema.v1 :as schema.v1]
   [metabase.metabot.util :as metabot.u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(def ^:private ai-service-entries
  "A representative entry for each ai-service `:_type`."
  [{:role "assistant" :_type "TEXT" :content "Hi there"}
   {:role "assistant" :_type "ERROR" :content "Something went wrong"}
   {:_type "DATA" :type "navigate_to" :version 1 :value "/question/1"}
   {:role "assistant" :_type "TOOL_CALL" :tool_calls [{:id "tc1" :name "search" :arguments "{\"q\":\"x\"}"}]}
   {:role "tool" :_type "TOOL_RESULT" :tool_call_id "tc1" :content "<result/>"}
   {:role "assistant" :_type "FINISH_MESSAGE" :finish_reason "stop" :usage {}}])

(deftest ^:parallel ai-service-entries-validate-test
  (is (nil? (mr/explain [:sequential ::schema.v1/ai-service-entry] ai-service-entries))))

(def ^:private native-entries
  "A representative entry for each native `:type`."
  [{:type "text" :id "t1" :text "Hello"}
   {:type "tool-input" :id "tc1" :function "search" :arguments {:q "x"}}
   {:type "tool-output" :id "tc1" :function "search"
    :result {:output "rows" :structured-output {:type "table"}}
    :error nil :duration-ms 12.5}
   {:type "tool-output" :id "tc1"
    :result {:output "rows" :instructions "..." :resources [] :data-parts []}}
   {:type "data" :data-type "navigate_to" :version 1 :data "/question/1"}
   {:type "data" :data-type "debug_log" :version 1 :data [{:iteration 0 :request {} :response []}]}
   {:type "error" :error {:message "boom"}}
   {:type "error" :errorText "Overloaded"}])

(deftest ^:parallel native-entries-validate-test
  (is (nil? (mr/explain [:sequential ::schema.v1/native-entry] native-entries))))

(deftest ^:parallel user-message-validates-test
  (is (nil? (mr/explain ::schema.v1/user-message {:role "user" :content "Do we have orders data?"}))))

(deftest ^:parallel unknown-entry-type-test
  (testing "unknown ai-service :_type fails"
    (is (not (mr/validate ::schema.v1/ai-service-entry
                          {:role "assistant" :_type "NO_SUCH" :content "hi"}))))
  (testing "unknown native :type fails"
    (is (not (mr/validate ::schema.v1/native-entry
                          {:type "no-such" :text "hi"}))))
  (testing "entries with a stray key fail the closed maps"
    (is (not (mr/validate ::schema.v1/ai-service-entry
                          {:role "assistant" :_type "TEXT" :content "hi" :stray "x"})))
    (is (not (mr/validate ::schema.v1/native-entry
                          {:type "text" :id "t1" :text "hi" :stray "x"})))
    (is (not (mr/validate ::schema.v1/user-message
                          {:role "user" :content "hi" :stray "x"})))))

(deftest ^:parallel message-data-test
  (testing "assistant placeholder rows are empty"
    (is (mr/validate ::schema.v1/message-data [])))
  (testing "homogeneous rows validate"
    (is (mr/validate ::schema.v1/message-data
                     [{:role "user" :content "hi"}]))
    (is (mr/validate ::schema.v1/message-data
                     [{:role "assistant" :_type "TEXT" :content "Hello"}
                      {:role "assistant" :_type "FINISH_MESSAGE" :finish_reason "stop" :usage {}}]))
    (is (mr/validate ::schema.v1/message-data
                     [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "x"}}
                      {:type "tool-output" :id "tc1" :result {:output "rows"} :error nil :duration-ms 3}
                      {:type "text" :id "t1" :text "Found it"}])))
  (testing "rows mixing sub-variants fail"
    (is (not (mr/validate ::schema.v1/message-data
                          [{:role "user" :content "hi"}
                           {:type "text" :id "t1" :text "Hello"}])))))

(deftest ^:parallel fixture-parity-test
  (doseq [fixture ["metabase/metabot/aisdkstream1.txt"
                   "metabase/metabot/aisdkstream2.txt"
                   "metabase/metabot/aisdkstream3.txt"
                   "metabase/metabot/aisdkstream4.txt"]]
    (testing fixture
      (let [messages (with-open [r (io/reader (io/resource fixture))]
                       (metabot.u/aisdk->messages "assistant" (line-seq r)))
            ;; the schema describes the at-rest shape, so simulate the `mi/transform-json` write +
            ;; read cycle: keyword values become strings, keys stay keywords
            at-rest  (-> messages json/encode json/decode+kw)]
        (is (nil? (mr/explain ::schema.v1/message-data at-rest)))))))
