(ns metabase.metabot.models.metabot-message-test
  "Integration tests for the `after-select` hook on :model/MetabotMessage that
  migrates v1 stored data to v2 on-read. These tests exercise the full round trip
  — insert a v1 row with `data_version=1`, read it back via `t2/select`, and
  assert the hook produced the expected v2 shape."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.metabot.models.metabot-message]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- insert-v1-message!
  "Insert a v1 MetabotMessage row directly (bypassing the v2 store fns) so we can
  test the after-select migration against realistic data shapes."
  [conversation-id role data]
  (t2/insert-returning-pk! :model/MetabotMessage
                           {:conversation_id conversation-id
                            :data            data
                            :role            role
                            :profile_id      "internal"
                            :total_tokens    0
                            :ai_proxied      false
                            :data_version    1}))

(deftest after-select-migrates-v1-native-tool-output-test
  (testing "after-select migrates v1-native tool-output success to v2 with :output as a plain string"
    (binding [api/*current-user-id* (mt/user->id :crowberto)]
      (let [conv-id (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conv-id :user_id api/*current-user-id*})
          ;; Mirrors master's stored shape after `strip-tool-output-bloat` ran:
          ;; :result is always a map containing only the :output key.
          (insert-v1-message!
           conv-id :assistant
           [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "orders"}}
            {:type "tool-output" :id "tc1" :result {:output "Found 42 orders"}}])
          (let [msg (t2/select-one :model/MetabotMessage :conversation_id conv-id)
                part (first (:data msg))]
            (is (= "tool-search" (:type part)))
            (is (= "output-available" (:state part)))
            (is (= "Found 42 orders" (:output part))
                "migrated :output should be the inner string, not the whole :result map"))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conv-id)
            (t2/delete! :model/MetabotConversation :id conv-id)))))))

(deftest after-select-migrates-v1-native-tool-error-test
  (testing "after-select migrates v1-native tool-output errors to v2 with :errorText and no :output"
    (binding [api/*current-user-id* (mt/user->id :crowberto)]
      (let [conv-id (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conv-id :user_id api/*current-user-id*})
          ;; Master's error path: `strip-tool-output-bloat` ran `(select-keys nil [:output])`
          ;; which produces `{}`. So real error rows have :result {} plus :error.
          (insert-v1-message!
           conv-id :assistant
           [{:type "tool-input" :id "tc1" :function "search" :arguments {:q "bad"}}
            {:type "tool-output" :id "tc1" :result {} :error {:message "boom"}}])
          (let [msg (t2/select-one :model/MetabotMessage :conversation_id conv-id)
                part (first (:data msg))]
            (is (= "tool-search" (:type part)))
            (is (= "output-error" (:state part)))
            (is (= "boom" (:errorText part)))
            (is (not (contains? part :output))
                "error row should not carry :output {} alongside :errorText"))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conv-id)
            (t2/delete! :model/MetabotConversation :id conv-id)))))))

(deftest after-select-migrates-v1-external-ai-service-test
  (testing "after-select migrates v1-external-ai-service tool-call/result pairs into merged v2 ToolUIPart"
    (binding [api/*current-user-id* (mt/user->id :crowberto)]
      (let [conv-id (str (random-uuid))]
        (try
          (t2/insert! :model/MetabotConversation {:id conv-id :user_id api/*current-user-id*})
          (insert-v1-message!
           conv-id :assistant
           [{:role "assistant" :_type "TOOL_CALL"
             :tool_calls [{:id "tc1" :name "search" :arguments "{\"q\":\"orders\"}"}]}
            {:role "tool" :_type "TOOL_RESULT" :tool_call_id "tc1" :content "Found 42 orders"}])
          (let [msg (t2/select-one :model/MetabotMessage :conversation_id conv-id)
                part (first (:data msg))]
            (is (= "tool-search" (:type part)))
            (is (= "output-available" (:state part)))
            (is (= "Found 42 orders" (:output part))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conv-id)
            (t2/delete! :model/MetabotConversation :id conv-id)))))))

(deftest after-select-leaves-v2-rows-unchanged-test
  (testing "after-select does not re-migrate v2 rows (data_version=2)"
    (binding [api/*current-user-id* (mt/user->id :crowberto)]
      (let [conv-id (str (random-uuid))
            v2-data [{:type "tool-search" :toolCallId "tc1" :toolName "search"
                      :state "output-available" :input {:q "x"} :output "result"}]]
        (try
          (t2/insert! :model/MetabotConversation {:id conv-id :user_id api/*current-user-id*})
          (t2/insert! :model/MetabotMessage
                      {:conversation_id conv-id
                       :data            v2-data
                       :role            :assistant
                       :profile_id      "internal"
                       :total_tokens    0
                       :ai_proxied      false
                       :data_version    2})
          (let [msg (t2/select-one :model/MetabotMessage :conversation_id conv-id)]
            (is (= v2-data (:data msg))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conv-id)
            (t2/delete! :model/MetabotConversation :id conv-id)))))))
