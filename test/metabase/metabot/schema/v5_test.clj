(ns metabase.metabot.schema.v5-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.schema.v5 :as schema.v5]
   [metabase.util.malli.registry :as mr]))

(def ^:private chunk-cases
  "[valid-payload required-key-or-nil] — one row per uiMessageChunkSchema union member."
  [[{:type "text-start" :id "t1"}                                                          :id]
   [{:type "text-delta" :id "t1" :delta "Hi" :providerMetadata {:openai {:x 1}}}           :delta]
   [{:type "text-end" :id "t1"}                                                            :id]
   [{:type "reasoning-start" :id "r1"}                                                     :id]
   [{:type "reasoning-delta" :id "r1" :delta "thinking"}                                   :delta]
   [{:type "reasoning-end" :id "r1"}                                                       :id]
   [{:type "error" :errorText "boom"}                                                      :errorText]
   [{:type "tool-input-start" :toolCallId "tc1" :toolName "search" :dynamic false}         :toolName]
   [{:type "tool-input-delta" :toolCallId "tc1" :inputTextDelta "{\"q\":"}                 :inputTextDelta]
   [{:type "tool-input-available" :toolCallId "tc1" :toolName "search" :input {:q "x"}}    :input]
   [{:type "tool-input-error" :toolCallId "tc1" :toolName "search" :input nil
     :errorText "bad input"}                                                               :errorText]
   [{:type "tool-approval-request" :approvalId "ap1" :toolCallId "tc1"}                    :approvalId]
   [{:type "tool-output-available" :toolCallId "tc1" :output {:rows []} :preliminary true} :output]
   [{:type "tool-output-error" :toolCallId "tc1" :errorText "failed"}                      :errorText]
   [{:type "tool-output-denied" :toolCallId "tc1"}                                         :toolCallId]
   [{:type "source-url" :sourceId "s1" :url "https://example.com" :title "Example"}        :url]
   [{:type "source-document" :sourceId "s1" :mediaType "application/pdf" :title "Doc"}     :mediaType]
   [{:type "file" :url "data:text/plain;base64,SGk=" :mediaType "text/plain"}              :url]
   [{:type "data-navigate_to" :data "/question/1" :transient true}                         :data]
   [{:type "start-step"}                                                                   nil]
   [{:type "finish-step"}                                                                  nil]
   [{:type "start" :messageId "m1"}                                                        nil]
   [{:type "finish" :finishReason "stop"}                                                  nil]
   [{:type "abort" :reason "user cancelled"}                                               nil]
   [{:type "message-metadata" :messageMetadata {:model "gpt-4o"}}                          :messageMetadata]])

(deftest ^:parallel ui-message-chunk-test
  (doseq [[payload required-key] chunk-cases]
    (testing (:type payload)
      (is (mr/validate ::schema.v5/ui-message-chunk payload))
      (is (not (mr/validate ::schema.v5/ui-message-chunk (assoc payload :unexpected-key 1))))
      (when required-key
        (is (not (mr/validate ::schema.v5/ui-message-chunk (dissoc payload required-key))))))))

(deftest ^:parallel ui-message-chunk-unknown-type-test
  (is (not (mr/validate ::schema.v5/ui-message-chunk {:type "no-such-chunk"})))
  (is (not (mr/validate ::schema.v5/ui-message-chunk {:id "t1"}))))

(def ^:private ui-message-part-cases
  [[{:type "text" :text "Hello" :state "done"}                                            :text]
   [{:type "reasoning" :text "let me think" :state "streaming"}                           :text]
   [{:type "source-url" :sourceId "s1" :url "https://example.com"}                        :url]
   [{:type "source-document" :sourceId "s1" :mediaType "application/pdf" :title "Doc"}    :title]
   [{:type "file" :mediaType "text/plain" :filename "a.txt" :url "https://example.com/a"} :url]
   [{:type "step-start"}                                                                  nil]
   [{:type "tool-search" :toolCallId "tc1" :state "input-streaming"}                      :toolCallId]
   [{:type "tool-search" :toolCallId "tc1" :state "input-available" :input {:q "x"}}      :input]
   [{:type "tool-search" :toolCallId "tc1" :state "approval-requested" :input {:q "x"}
     :approval {:id "ap1"}}                                                               :approval]
   [{:type "tool-search" :toolCallId "tc1" :state "approval-responded" :input {:q "x"}
     :approval {:id "ap1" :approved true :reason "ok"}}                                   :approval]
   [{:type "tool-search" :toolCallId "tc1" :state "output-available" :input {:q "x"}
     :output {:rows []} :preliminary false}                                               :output]
   [{:type "tool-search" :toolCallId "tc1" :state "output-error" :input {:q "x"}
     :rawInput "{\"q\"" :errorText "failed"}                                              :errorText]
   [{:type "tool-search" :toolCallId "tc1" :state "output-denied" :input {:q "x"}
     :approval {:id "ap1" :approved false}}                                               :approval]
   [{:type "dynamic-tool" :toolName "mcp_tool" :toolCallId "tc1" :state "output-available"
     :input {:q "x"} :output "result"}                                                    :toolName]
   [{:type "data-navigate_to" :id "d1" :data "/question/1"}                               :data]])

(deftest ^:parallel ui-message-part-test
  (doseq [[payload required-key] ui-message-part-cases]
    (testing (str (:type payload) " " (:state payload))
      (is (mr/validate ::schema.v5/ui-message-part payload))
      (is (not (mr/validate ::schema.v5/ui-message-part (assoc payload :unexpected-key 1))))
      (when required-key
        (is (not (mr/validate ::schema.v5/ui-message-part (dissoc payload required-key))))))))

(deftest ^:parallel ui-message-test
  (let [message {:id    "msg1"
                 :role  "assistant"
                 :parts [{:type "text" :text "Hello"}
                         {:type "tool-search" :toolCallId "tc1" :state "output-available"
                          :input {:q "x"} :output {:rows []}}]}]
    (is (mr/validate ::schema.v5/ui-message message))
    (is (not (mr/validate ::schema.v5/ui-message (assoc message :role "tool"))))
    (is (not (mr/validate ::schema.v5/ui-message (dissoc message :id))))
    (is (not (mr/validate ::schema.v5/ui-message (assoc message :unexpected-key 1))))))

(def ^:private metabase-ui-message-part-cases
  [[{:type "text" :text "Hello"}                                                       :text]
   [{:type "tool-search" :toolCallId "tc1" :toolName "search" :state "input-available"
     :input {:q "x"}}                                                                  :toolName]
   [{:type "tool-search" :toolCallId "tc1" :toolName "search" :state "output-available"
     :input {:q "x"} :output "rows"}                                                   :input]
   [{:type "tool-search" :toolCallId "tc1" :toolName "search" :state "output-error"
     :input "{\"q\":" :errorText "parse failure"}                                      :toolCallId]
   [{:type "data-navigate_to" :data "/question/1"}                                     :data]])

(deftest ^:parallel metabase-ui-message-part-test
  (doseq [[payload required-key] metabase-ui-message-part-cases]
    (testing (str (:type payload) " " (:state payload))
      (is (mr/validate ::schema.v5/metabase-ui-message-part payload))
      (is (not (mr/validate ::schema.v5/metabase-ui-message-part (assoc payload :unexpected-key 1))))
      (when required-key
        (is (not (mr/validate ::schema.v5/metabase-ui-message-part (dissoc payload required-key))))))))
