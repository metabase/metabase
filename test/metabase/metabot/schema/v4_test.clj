(ns metabase.metabot.schema.v4-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.schema.v4 :as schema.v4]
   [metabase.metabot.util :as metabot.u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(def ^:private data-stream-part-cases
  [[{:role "assistant" :_type "TEXT" :content "Hi there"}                          :content]
   [{:role "assistant" :_type "ERROR" :content "Something went wrong"}             :content]
   [{:_type "DATA" :type "navigate_to" :version 1 :value "/question/1"}            :version]
   [{:role "assistant" :_type "TOOL_CALL"
     :tool_calls [{:id "tc1" :name "search" :arguments "{\"q\":\"x\"}"}]}          :tool_calls]
   [{:role "tool" :_type "TOOL_RESULT" :tool_call_id "tc1" :content "<result/>"}   :tool_call_id]
   [{:role "assistant" :_type "FINISH_MESSAGE" :finish_reason "stop" :usage {}}    :usage]])

(def ^:private part-cases
  [[{:type "text" :id "t1" :text "Hello"}                                          :text]
   [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "x"}}          :function]
   [{:type "tool-output" :id "tc1" :function "search"
     :result {:output "rows" :structured-output {:type "table"}}
     :error nil :duration-ms 12.5}                                                 :id]
   [{:type "data" :data-type "navigate_to" :version 1 :data "/question/1"}         :data-type]
   [{:type "error" :error {:message "boom"}}                                       :error]])

(deftest ^:parallel entry-test
  (doseq [[schema cases] {::schema.v4/data-stream-part data-stream-part-cases
                          ::schema.v4/part             part-cases
                          ::schema.v4/user-message     [[{:role "user" :content "Do we have orders data?"} :content]]}
          [payload required-key] cases]
    (testing (str schema " " (or (:_type payload) (:type payload) (:role payload)))
      (is (mr/validate schema payload))
      (is (not (mr/validate schema (assoc payload :unexpected-key 1))))
      (is (not (mr/validate schema (dissoc payload required-key)))))))

(deftest ^:parallel message-data-test
  (testing "assistant placeholder rows are empty"
    (is (mr/validate ::schema.v4/message-data [])))
  (testing "homogeneous rows validate"
    (is (mr/validate ::schema.v4/message-data
                     [{:role "user" :content "hi"}]))
    (is (mr/validate ::schema.v4/message-data
                     [{:role "assistant" :_type "TEXT" :content "Hello"}
                      {:role "assistant" :_type "FINISH_MESSAGE" :finish_reason "stop" :usage {}}]))
    (is (mr/validate ::schema.v4/message-data
                     [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "x"}}
                      {:type "tool-output" :id "tc1" :result {:output "rows"} :error nil :duration-ms 3}
                      {:type "text" :id "t1" :text "Found it"}])))
  (testing "rows mixing sub-variants fail"
    (is (not (mr/validate ::schema.v4/message-data
                          [{:role "user" :content "hi"}
                           {:type "text" :id "t1" :text "Hello"}]))))
  (testing "extra keys fail"
    (is (not (mr/validate ::schema.v4/message-data
                          [{:role "user" :content "hi" :unexpected-key 1}])))))

(deftest ^:parallel normalize-entry-test
  (testing "full tool-output results are trimmed to the persisted subset"
    (let [entry {:type   "tool-output"
                 :id     "tc1"
                 :result {:output            "rows"
                          :structured-output {:type "table"}
                          :instructions      "..."
                          :resources         []
                          :data-parts        []}}]
      (is (= {:type   "tool-output"
              :id     "tc1"
              :result {:output "rows" :structured-output {:type "table"}}}
             (schema.v4/normalize-entry entry)))))
  (testing "nil results pass through"
    (is (= {:type "tool-output" :id "tc1" :result nil}
           (schema.v4/normalize-entry {:type "tool-output" :id "tc1" :result nil}))))
  (testing "errorText errors are rewritten to the error key"
    (is (= {:type "error" :error "Overloaded"}
           (schema.v4/normalize-entry {:type "error" :errorText "Overloaded"}))))
  (testing "compliant entries pass through unchanged"
    (is (= {:type "error" :error {:message "boom"}}
           (schema.v4/normalize-entry {:type "error" :error {:message "boom"}})))
    (is (= {:type "text" :id "t1" :text "hi"}
           (schema.v4/normalize-entry {:type "text" :id "t1" :text "hi"})))
    (is (= "not a map" (schema.v4/normalize-entry "not a map")))))

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
        (is (nil? (mr/explain ::schema.v4/message-data
                              (persistence-round-trip messages))))))))
