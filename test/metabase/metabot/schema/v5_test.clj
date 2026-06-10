(ns metabase.metabot.schema.v5-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.schema.v5 :as schema.v5]
   [metabase.util.malli.registry :as mr]))

(def ^:private chunk-cases
  "[valid-payload required-key-or-nil] — one row per uiMessageChunkSchema union member."
  [[{:type "text-start" :id "t1"}                                                            :id]
   [{:type "text-delta" :id "t1" :delta "Hi" :provider_metadata {:openai {:x 1}}}            :delta]
   [{:type "text-end" :id "t1"}                                                              :id]
   [{:type "error" :error_text "boom"}                                                       :error_text]
   [{:type "tool-input-start" :tool_call_id "tc1" :tool_name "search" :dynamic false}        :tool_name]
   [{:type "tool-input-delta" :tool_call_id "tc1" :input_text_delta "{\"q\":"}               :input_text_delta]
   [{:type "tool-input-available" :tool_call_id "tc1" :tool_name "search" :input {:q "x"}}   :input]
   [{:type "tool-input-error" :tool_call_id "tc1" :tool_name "search" :input nil
     :error_text "bad input"}                                                                :error_text]
   [{:type "tool-approval-request" :approval_id "ap1" :tool_call_id "tc1"}                   :approval_id]
   [{:type "tool-output-available" :tool_call_id "tc1" :output {:rows []} :preliminary true} :output]
   [{:type "tool-output-error" :tool_call_id "tc1" :error_text "failed"}                     :error_text]
   [{:type "tool-output-denied" :tool_call_id "tc1"}                                         :tool_call_id]
   [{:type "reasoning-start" :id "r1"}                                                       :id]
   [{:type "reasoning-delta" :id "r1" :delta "thinking"}                                     :delta]
   [{:type "reasoning-end" :id "r1"}                                                         :id]
   [{:type "source-url" :source_id "s1" :url "https://example.com" :title "Example"}         :url]
   [{:type "source-document" :source_id "s1" :media_type "application/pdf" :title "Doc"}     :media_type]
   [{:type "file" :url "data:text/plain;base64,SGk=" :media_type "text/plain"}               :url]
   [{:type "data-navigate_to" :data "/question/1" :transient true}                           :data]
   [{:type "start-step"}                                                                     nil]
   [{:type "finish-step"}                                                                    nil]
   [{:type "start" :message_id "m1"}                                                         nil]
   [{:type "finish" :finish_reason "stop"}                                                   nil]
   [{:type "abort" :reason "user cancelled"}                                                 nil]
   [{:type "message-metadata" :message_metadata {:model "gpt-4o"}}                           :message_metadata]])

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
  [[{:type "text" :text "Hello" :state "done"}                                              :text]
   [{:type "reasoning" :text "let me think" :state "streaming"}                             :text]
   [{:type "source-url" :source_id "s1" :url "https://example.com"}                         :url]
   [{:type "source-document" :source_id "s1" :media_type "application/pdf" :title "Doc"}    :title]
   [{:type "file" :media_type "text/plain" :filename "a.txt" :url "https://example.com/a"}  :url]
   [{:type "step-start"}                                                                    nil]
   [{:type "tool-search" :tool_call_id "tc1" :state "input-streaming"}                      :tool_call_id]
   [{:type "tool-search" :tool_call_id "tc1" :state "input-available" :input {:q "x"}}      :input]
   [{:type "tool-search" :tool_call_id "tc1" :state "approval-requested" :input {:q "x"}
     :approval {:id "ap1"}}                                                                 :approval]
   [{:type "tool-search" :tool_call_id "tc1" :state "approval-responded" :input {:q "x"}
     :approval {:id "ap1" :approved true :reason "ok"}}                                     :approval]
   [{:type "tool-search" :tool_call_id "tc1" :state "output-available" :input {:q "x"}
     :output {:rows []} :preliminary false}                                                 :output]
   [{:type "tool-search" :tool_call_id "tc1" :state "output-error" :input {:q "x"}
     :raw_input "{\"q\"" :error_text "failed"}                                              :error_text]
   [{:type "tool-search" :tool_call_id "tc1" :state "output-denied" :input {:q "x"}
     :approval {:id "ap1" :approved false}}                                                 :approval]
   [{:type "dynamic-tool" :tool_name "mcp_tool" :tool_call_id "tc1" :state "output-available"
     :input {:q "x"} :output "result"}                                                      :tool_name]
   [{:type "data-navigate_to" :id "d1" :data "/question/1"}                                 :data]])

(deftest ^:parallel ui-message-part-test
  (doseq [[payload required-key] ui-message-part-cases]
    (testing (str (:type payload) " " (:state payload))
      (is (mr/validate ::schema.v5/ui-message-part payload))
      (is (not (mr/validate ::schema.v5/ui-message-part (assoc payload :unexpected-key 1))))
      (when required-key
        (is (not (mr/validate ::schema.v5/ui-message-part (dissoc payload required-key))))))))

(deftest ^:parallel tool-approval-shape-test
  (testing "approval-requested approvals carry only an id"
    (let [part {:type "tool-search" :tool_call_id "tc1" :state "approval-requested"
                :input {:q "x"} :approval {:id "ap1"}}]
      (is (mr/validate ::schema.v5/ui-message-part part))
      (is (not (mr/validate ::schema.v5/ui-message-part (assoc-in part [:approval :approved] true))))))
  (testing "approval-responded approvals require the approved flag"
    (let [part {:type "tool-search" :tool_call_id "tc1" :state "approval-responded"
                :input {:q "x"} :approval {:id "ap1" :approved false :reason "no"}}]
      (is (mr/validate ::schema.v5/ui-message-part part))
      (is (not (mr/validate ::schema.v5/ui-message-part (update part :approval dissoc :approved))))))
  (testing "output-available approvals must be approved"
    (let [part {:type "tool-search" :tool_call_id "tc1" :state "output-available"
                :input {:q "x"} :output {:rows []} :approval {:id "ap1" :approved true}}]
      (is (mr/validate ::schema.v5/ui-message-part part))
      (is (not (mr/validate ::schema.v5/ui-message-part (assoc-in part [:approval :approved] false))))))
  (testing "output-denied approvals must be denied"
    (let [part {:type "dynamic-tool" :tool_name "mcp_tool" :tool_call_id "tc1" :state "output-denied"
                :input {:q "x"} :approval {:id "ap1" :approved false}}]
      (is (mr/validate ::schema.v5/ui-message-part part))
      (is (not (mr/validate ::schema.v5/ui-message-part (assoc-in part [:approval :approved] true)))))))

(deftest ^:parallel ui-message-test
  (let [message {:id    "msg1"
                 :role  "assistant"
                 :parts [{:type "text" :text "Hello"}
                         {:type "tool-search" :tool_call_id "tc1" :state "output-available"
                          :input {:q "x"} :output {:rows []}}]}]
    (is (mr/validate ::schema.v5/ui-message message))
    (is (not (mr/validate ::schema.v5/ui-message (assoc message :role "tool"))))
    (is (not (mr/validate ::schema.v5/ui-message (dissoc message :id))))
    (is (not (mr/validate ::schema.v5/ui-message (assoc message :parts []))))
    (is (not (mr/validate ::schema.v5/ui-message (assoc message :unexpected-key 1))))))
