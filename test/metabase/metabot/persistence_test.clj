(ns metabase.metabot.persistence-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.metabot.persistence :as metabot-persistence]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(deftest message->chat-messages-test
  (testing "user text block"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :user
                   :data [{:role "user" :content "hello"}]})]
      (is (= 1 (count result)))
      (is (= {:role "user" :type "text" :message "hello"}
             (select-keys (first result) [:role :type :message])))
      (is (string? (:id (first result))))))

  (testing "assistant standard text block preserves block id"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:type "text" :text "hi there" :id "block-1"}]})]
      (is (= [{:id "block-1" :role "agent" :type "text" :message "hi there"}]
             result))))

  (testing "assistant standard text block without id gets a generated one"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:type "text" :text "no id"}]})]
      (is (= 1 (count result)))
      (is (string? (:id (first result))))
      (is (= "no id" (:message (first result))))))

  (testing "assistant slack-format text block"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:role "assistant" :_type "TEXT" :content "from slack"}]})]
      (is (= 1 (count result)))
      (is (= {:role "agent" :type "text" :message "from slack"}
             (select-keys (first result) [:role :type :message])))))

  (testing "tool-input merged with matching tool-output"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:type "tool-input" :id "call-1" :function "search"
                           :arguments {:query "foo"}}
                          {:type "tool-output" :id "call-1" :result {:rows [1 2 3]}}]})]
      (is (= 1 (count result)))
      (is (= {:id       "call-1"
              :role     "agent"
              :type     "tool_call"
              :name     "search"
              :status   "ended"
              :is_error false}
             (select-keys (first result) [:id :role :type :name :status :is_error])))
      (is (= {:query "foo"} (json/decode+kw (:args (first result)))))
      (is (= {:rows [1 2 3]} (json/decode+kw (:result (first result)))))))

  (testing "tool-output flagged as error"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:type "tool-input" :id "call-2" :function "boom" :arguments {}}
                          {:type "tool-output" :id "call-2" :error "exploded"}]})]
      (is (true? (:is_error (first result))))
      (is (nil? (:result (first result))))))

  (testing "tool-input without matching output is left as-is"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:type "tool-input" :id "call-3" :function "search" :arguments {}}]})]
      (is (= 1 (count result)))
      (is (= "tool_call" (:type (first result))))
      (is (not (contains? (first result) :result)))
      (is (not (contains? (first result) :is_error)))))

  (testing "unknown block types are dropped"
    (is (= []
           (metabot-persistence/message->chat-messages
            {:role :assistant
             :data [{:type "data-foo" :payload {}}
                    {:type "mystery"}]}))))

  (testing "data parts are converted to data_part chat messages"
    (let [blocks [{:type "data" :data-type "navigate_to" :data "/question/1"}
                  {:type "data" :data-type "todo_list"   :version 1 :data [{:id "t1"}]}
                  {:type "data" :data-type "code_edit"   :version 1 :data {:buffer_id "b" :value "v"}}]]
      (is (=? [{:role "agent" :type "data_part" :part {:type "navigate_to" :version 1 :value "/question/1"}}
               {:role "agent" :type "data_part" :part {:type "todo_list"   :version 1 :value [{:id "t1"}]}}
               {:role "agent" :type "data_part" :part {:type "code_edit"   :version 1 :value {:buffer_id "b" :value "v"}}}]
              (metabot-persistence/message->chat-messages {:role :assistant :data blocks})))))

  (testing "nil :data yields no messages"
    (is (= [] (metabot-persistence/message->chat-messages {:role :user :data nil})))))

(deftest messages->chat-messages-flattens-across-messages-test
  (let [result (metabot-persistence/messages->chat-messages
                [{:role :user      :data [{:role "user" :content "hi"}]}
                 {:role :assistant :data [{:type "text" :text "hello!" :id "b1"}
                                          {:type "tool-input" :id "t1" :function "f" :arguments {:x 1}}
                                          {:type "tool-output" :id "t1" :result {:ok true}}]}])]
    (is (= 3 (count result)))
    (is (= ["user" "agent" "agent"] (map :role result)))
    (is (= ["text" "text" "tool_call"] (map :type result)))
    (is (= "hi" (:message (nth result 0))))
    (is (= "hello!" (:message (nth result 1))))
    (is (= {:ok true} (json/decode+kw (:result (nth result 2)))))))

(deftest store-message-persists-slack-conversation-metadata-test
  (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
    (let [conversation-id (str (random-uuid))
          team-id         "T123"
          channel-id      "C123"
          thread-ts       "1712785577.123456"]
      (mt/with-current-user (mt/user->id :rasta)
        (metabot-persistence/store-message!
         conversation-id
         "slackbot"
         [{:role "user" :content "hello"}]
         :slack-team-id team-id
         :channel-id channel-id
         :slack-thread-ts thread-ts
         :slack-msg-id "1712785577.123456"))
      (let [conversation (t2/select-one :model/MetabotConversation :id conversation-id)]
        (is (= (mt/user->id :rasta) (:user_id conversation)))
        (is (= team-id (:slack_team_id conversation)))
        (is (= channel-id (:slack_channel_id conversation)))
        (is (= thread-ts (:slack_thread_ts conversation)))))))
