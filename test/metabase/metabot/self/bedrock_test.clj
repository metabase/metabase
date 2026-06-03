(ns metabase.metabot.self.bedrock-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.metabot.self.bedrock :as bedrock]
   [metabase.metabot.self.core :as self.core]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; parts->bedrock-messages
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel parts->bedrock-messages-text-test
  (testing "text parts are converted to assistant messages"
    (is (= [{:role "assistant"
             :content [{:text "Hello, world!"}]}]
           (bedrock/parts->bedrock-messages
            [{:type :text :text "Hello, world!"}])))))

(deftest ^:parallel parts->bedrock-messages-tool-input-test
  (testing "tool-input parts become assistant toolUse messages"
    (is (= [{:role "assistant"
             :content [{:toolUse {:toolUseId "t1"
                                  :name "get-time"
                                  :input {:tz "UTC"}}}]}]
           (bedrock/parts->bedrock-messages
            [{:type :tool-input :id "t1" :function "get-time" :arguments {:tz "UTC"}}])))))

(deftest ^:parallel parts->bedrock-messages-tool-output-test
  (testing "tool-output parts become user toolResult messages"
    (is (= [{:role "user"
             :content [{:toolResult {:toolUseId "t1"
                                     :content [{:text "12:00 PM"}]}}]}]
           (bedrock/parts->bedrock-messages
            [{:type :tool-output :id "t1" :result {:output "12:00 PM"}}])))))

(deftest ^:parallel parts->bedrock-messages-merge-consecutive-test
  (testing "consecutive same-role messages are merged"
    (let [result (bedrock/parts->bedrock-messages
                  [{:type :text :text "Hello"}
                   {:type :text :text "World"}])]
      (is (= 1 (count result)))
      (is (= "assistant" (:role (first result))))
      (is (= 2 (count (:content (first result))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; bedrock->aisdk-chunks-xf transducer
;;; ──────────────────────────────────────────────────────────────────

(defn- run-xf
  "Run the Bedrock→AISDK transducer over a sequence of Bedrock events."
  [events]
  (into [] (bedrock/bedrock->aisdk-chunks-xf) events))

(deftest ^:parallel bedrock-text-streaming-test
  (testing "messageStart + text contentBlock produces start → text-start → text-delta → text-end"
    (let [events [{:messageStart {:role "assistant"}}
                  {:contentBlockStart {:contentBlockIndex 0
                                       :start {:text ""}}}
                  {:contentBlockDelta {:contentBlockIndex 0
                                       :delta {:text "Hello"}}}
                  {:contentBlockDelta {:contentBlockIndex 0
                                       :delta {:text " world"}}}
                  {:contentBlockStop {:contentBlockIndex 0}}
                  {:metadata {:usage {:inputTokens 10 :outputTokens 5}}}
                  {:messageStop {:stopReason "end_turn"}}]
          chunks (run-xf events)]
      (is (= [:start :text-start :text-delta :text-delta :text-end :usage]
             (mapv :type chunks)))
      (is (= "Hello" (:delta (nth chunks 2))))
      (is (= " world" (:delta (nth chunks 3))))
      (is (= {:promptTokens 10 :completionTokens 5}
             (:usage (last chunks)))))))

(deftest ^:parallel bedrock-tool-input-streaming-test
  (testing "tool use contentBlock produces tool-input-start → tool-input-delta → tool-input-available"
    (let [events [{:messageStart {:role "assistant"}}
                  {:contentBlockStart {:contentBlockIndex 0
                                       :start {:toolUse {:toolUseId "t1"
                                                         :name "get-time"}}}}
                  {:contentBlockDelta {:contentBlockIndex 0
                                       :delta {:toolUse {:input "{\"tz\":\"UTC\"}"}}}}
                  {:contentBlockStop {:contentBlockIndex 0}}
                  {:metadata {:usage {:inputTokens 20 :outputTokens 10}}}
                  {:messageStop {:stopReason "tool_use"}}]
          chunks (run-xf events)]
      (is (= [:start :tool-input-start :tool-input-delta :tool-input-available :usage]
             (mapv :type chunks)))
      (is (= "get-time" (:toolName (nth chunks 1))))
      (is (= "t1" (:toolCallId (nth chunks 1))))
      (is (= "{\"tz\":\"UTC\"}" (:inputTextDelta (nth chunks 2)))))))

(deftest ^:parallel bedrock-text-and-tool-streaming-test
  (testing "text followed by tool use produces correct event sequence"
    (let [events [{:messageStart {:role "assistant"}}
                  {:contentBlockStart {:contentBlockIndex 0
                                       :start {:text ""}}}
                  {:contentBlockDelta {:contentBlockIndex 0
                                       :delta {:text "Let me check"}}}
                  {:contentBlockStop {:contentBlockIndex 0}}
                  {:contentBlockStart {:contentBlockIndex 1
                                       :start {:toolUse {:toolUseId "t1"
                                                         :name "lookup"}}}}
                  {:contentBlockDelta {:contentBlockIndex 1
                                       :delta {:toolUse {:input "{}"}}}}
                  {:contentBlockStop {:contentBlockIndex 1}}
                  {:metadata {:usage {:inputTokens 30 :outputTokens 15}}}
                  {:messageStop {:stopReason "tool_use"}}]
          chunks (run-xf events)
          types  (mapv :type chunks)]
      (is (= [:start :text-start :text-delta :text-end
              :tool-input-start :tool-input-delta :tool-input-available
              :usage]
             types)))))

(deftest ^:parallel bedrock-distinct-chunk-types-test
  (testing "distinct chunk types through pipeline"
    (let [events [{:messageStart {:role "assistant"}}
                  {:contentBlockStart {:contentBlockIndex 0 :start {:text ""}}}
                  {:contentBlockDelta {:contentBlockIndex 0 :delta {:text "Hi"}}}
                  {:contentBlockStop {:contentBlockIndex 0}}
                  {:metadata {:usage {:inputTokens 5 :outputTokens 2}}}
                  {:messageStop {:stopReason "end_turn"}}]
          distinct-types (into [] (comp (bedrock/bedrock->aisdk-chunks-xf)
                                        (m/distinct-by :type))
                               events)]
      (is (= [:start :text-start :text-delta :text-end :usage]
             (mapv :type distinct-types))))))

(deftest ^:parallel bedrock-through-aisdk-pipeline-test
  (testing "text events through full AISDK pipeline produce text + usage"
    (let [events [{:messageStart {:role "assistant"}}
                  {:contentBlockStart {:contentBlockIndex 0 :start {:text ""}}}
                  {:contentBlockDelta {:contentBlockIndex 0 :delta {:text "Hello"}}}
                  {:contentBlockStop {:contentBlockIndex 0}}
                  {:metadata {:usage {:inputTokens 10 :outputTokens 3}}}
                  {:messageStop {:stopReason "end_turn"}}]
          result (into [] (comp (bedrock/bedrock->aisdk-chunks-xf)
                                (self.core/aisdk-xf))
                       events)]
      (is (=? [{:type :start :id string?}
               {:type :text :text "Hello"}
               {:type :usage :usage {:promptTokens 10 :completionTokens 3}}]
              result)))))
