(ns metabase.metabot.schema.v2-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.schema.v2 :as schema.v2]
   [metabase.util.malli.registry :as mr]))

(def ^:private chunks
  "A representative chunk for each uiMessageChunkSchema union member."
  [{:type "text-start" :id "t1"}
   {:type "text-delta" :id "t1" :delta "Hi" :providerMetadata {:openai {:x 1}}}
   {:type "text-end" :id "t1"}
   {:type "error" :errorText "boom"}
   {:type "tool-input-start" :toolCallId "tc1" :toolName "search" :dynamic false}
   {:type "tool-input-delta" :toolCallId "tc1" :inputTextDelta "{\"q\":"}
   {:type "tool-input-available" :toolCallId "tc1" :toolName "search" :input {:q "x"}}
   {:type "tool-input-error" :toolCallId "tc1" :toolName "search" :input nil :errorText "bad input"}
   {:type "tool-approval-request" :approvalId "ap1" :toolCallId "tc1"}
   {:type "tool-output-available" :toolCallId "tc1" :output {:rows []} :preliminary true}
   {:type "tool-output-error" :toolCallId "tc1" :errorText "failed"}
   {:type "tool-output-denied" :toolCallId "tc1"}
   {:type "reasoning-start" :id "r1"}
   {:type "reasoning-delta" :id "r1" :delta "thinking"}
   {:type "reasoning-end" :id "r1"}
   {:type "source-url" :sourceId "s1" :url "https://example.com" :title "Example"}
   {:type "source-document" :sourceId "s1" :mediaType "application/pdf" :title "Doc"}
   {:type "file" :url "data:text/plain;base64,SGk=" :mediaType "text/plain"}
   {:type "data-navigate_to" :data "/question/1" :transient true}
   {:type "start-step"}
   {:type "finish-step"}
   {:type "start" :messageId "m1"}
   {:type "finish" :finishReason "stop"}
   {:type "abort" :reason "user cancelled"}
   {:type "message-metadata" :messageMetadata {:model "gpt-4o"}}])

(def ^:private ui-message-parts
  "A representative part for each uiMessagePartSchema union member, including every tool state."
  [{:type "text" :text "Hello" :state "done"}
   {:type "reasoning" :text "let me think" :state "streaming"}
   {:type "source-url" :sourceId "s1" :url "https://example.com"}
   {:type "source-document" :sourceId "s1" :mediaType "application/pdf" :title "Doc"}
   {:type "file" :mediaType "text/plain" :filename "a.txt" :url "https://example.com/a"}
   {:type "step-start"}
   {:type "tool-search" :toolCallId "tc1" :state "input-streaming"}
   {:type "tool-search" :toolCallId "tc1" :state "input-available" :input {:q "x"}}
   {:type "tool-search" :toolCallId "tc1" :state "approval-requested" :input {:q "x"}
    :approval {:id "ap1"}}
   {:type "tool-search" :toolCallId "tc1" :state "approval-responded" :input {:q "x"}
    :approval {:id "ap1" :approved true :reason "ok"}}
   {:type "tool-search" :toolCallId "tc1" :state "output-available" :input {:q "x"}
    :output {:rows []} :preliminary false}
   {:type "tool-search" :toolCallId "tc1" :state "output-error" :input {:q "x"}
    :rawInput "{\"q\"" :errorText "failed"}
   {:type "tool-search" :toolCallId "tc1" :state "output-denied" :input {:q "x"}
    :approval {:id "ap1" :approved false}}
   {:type "dynamic-tool" :toolName "mcp_tool" :toolCallId "tc1" :state "output-available"
    :input {:q "x"} :output "result"}
   {:type "data-navigate_to" :id "d1" :data "/question/1"}])

(deftest ^:parallel chunks-validate-test
  (is (nil? (mr/explain [:sequential ::schema.v2/ui-message-chunk] chunks))))

(deftest ^:parallel unknown-chunk-type-test
  (is (not (mr/validate ::schema.v2/ui-message-chunk {:type "no-such-chunk"})))
  (is (not (mr/validate ::schema.v2/ui-message-chunk {:id "t1"}))))

(deftest ^:parallel parts-validate-test
  (is (nil? (mr/explain [:sequential ::schema.v2/ui-message-part] ui-message-parts))))

(deftest ^:parallel aisdk-runtime-validator-equivalence-test
  (testing "at-rest parts are open maps: the upstream validator strips undeclared keys rather than rejecting"
    (is (mr/validate ::schema.v2/ui-message-part
                     {:type "text" :text "hi" :somethingExtra 1})))
  (testing "wire chunks are closed maps: the upstream validator rejects undeclared keys"
    (is (not (mr/validate ::schema.v2/ui-message-chunk
                          {:type "text-start" :id "t1" :somethingExtra 1}))))
  (testing "untyped fields like :input and :output may be absent entirely"
    (is (mr/validate ::schema.v2/ui-message-part
                     {:type "tool-search" :toolCallId "tc1" :state "output-available"})))
  (testing "forbidden fields reject any present value, keeping tool states mutually exclusive"
    (is (not (mr/validate ::schema.v2/ui-message-part
                          {:type "tool-search" :toolCallId "tc1" :state "output-available"
                           :errorText "boom"})))
    (is (not (mr/validate ::schema.v2/ui-message-part
                          {:type "tool-search" :toolCallId "tc1" :state "input-available"
                           :input {} :approval {:id "a1"}})))))

(deftest ^:parallel tool-approval-shape-test
  (testing "approval-requested approvals carry only an id"
    (let [part {:type "tool-search" :toolCallId "tc1" :state "approval-requested"
                :input {:q "x"} :approval {:id "ap1"}}]
      (is (mr/validate ::schema.v2/ui-message-part part))
      (is (not (mr/validate ::schema.v2/ui-message-part (assoc-in part [:approval :approved] true))))))
  (testing "approval-responded approvals require the approved flag"
    (let [part {:type "tool-search" :toolCallId "tc1" :state "approval-responded"
                :input {:q "x"} :approval {:id "ap1" :approved false :reason "no"}}]
      (is (mr/validate ::schema.v2/ui-message-part part))
      (is (not (mr/validate ::schema.v2/ui-message-part (update part :approval dissoc :approved))))))
  (testing "output-available approvals must be approved"
    (let [part {:type "tool-search" :toolCallId "tc1" :state "output-available"
                :input {:q "x"} :output {:rows []} :approval {:id "ap1" :approved true}}]
      (is (mr/validate ::schema.v2/ui-message-part part))
      (is (not (mr/validate ::schema.v2/ui-message-part (assoc-in part [:approval :approved] false))))))
  (testing "output-denied approvals must be denied"
    (let [part {:type "dynamic-tool" :toolName "mcp_tool" :toolCallId "tc1" :state "output-denied"
                :input {:q "x"} :approval {:id "ap1" :approved false}}]
      (is (mr/validate ::schema.v2/ui-message-part part))
      (is (not (mr/validate ::schema.v2/ui-message-part (assoc-in part [:approval :approved] true)))))))

(deftest ^:parallel ui-message-validates-test
  (is (nil? (mr/explain ::schema.v2/ui-message
                        {:id    "msg1"
                         :role  "assistant"
                         :parts [{:type "text" :text "Hello"}
                                 {:type "tool-search" :toolCallId "tc1" :state "output-available"
                                  :input {:q "x"} :output {:rows []}}]}))))
