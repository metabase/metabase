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
             (mapv #(select-keys % [:id :role :type :message]) result)))))

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

(deftest combine-text-parts-xf-merges-consecutive-text-test
  (testing "consecutive :text parts coalesce; non-text parts split runs"
    (let [parts [{:type :text :text "Hello, "}
                 {:type :text :text "world"}
                 {:type :text :text "!"}
                 {:type :tool-input :id "c1" :function "search"}
                 {:type :text :text "After "}
                 {:type :text :text "tool."}]
          out   (into [] (metabot-persistence/combine-text-parts-xf) parts)]
      (is (= [{:type :text :text "Hello, world!"}
              {:type :tool-input :id "c1" :function "search"}
              {:type :text :text "After tool."}]
             out))))
  (testing "single text part flushes on completion"
    (is (= [{:type :text :text "lone"}]
           (into [] (metabot-persistence/combine-text-parts-xf) [{:type :text :text "lone"}]))))
  (testing "empty input"
    (is (= [] (into [] (metabot-persistence/combine-text-parts-xf) [])))))

(deftest store-native-parts-persists-slack-metadata-on-conversation-test
  (testing "store-native-parts! lands slack-team-id / channel-id / slack-thread-ts on the conversation row,
            and slack-msg-id / channel-id / user-id on the message row, on first insert"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (str (random-uuid))
            team-id         "T-NATIVE"
            channel-id      "C-NATIVE"
            thread-ts       "1700000000.000001"
            slack-msg-id    "1700000000.000099"
            user-id         (mt/user->id :rasta)]
        (mt/with-current-user user-id
          (metabot-persistence/store-native-parts!
           conversation-id
           "metabot-1"
           [{:type :text :text "hello from slack"}]
           :slack-team-id team-id
           :channel-id channel-id
           :slack-thread-ts thread-ts
           :slack-msg-id slack-msg-id
           :user-id user-id))
        (let [conversation (t2/select-one :model/MetabotConversation :id conversation-id)
              message      (t2/select-one :model/MetabotMessage :conversation_id conversation-id)]
          (is (= user-id (:user_id conversation)))
          (is (= team-id (:slack_team_id conversation)))
          (is (= channel-id (:slack_channel_id conversation)))
          (is (= thread-ts (:slack_thread_ts conversation)))
          (is (= channel-id (:channel_id message)))
          (is (= slack-msg-id (:slack_msg_id message)))
          (is (= user-id (:user_id message))))))))

(deftest store-native-parts-does-not-overwrite-slack-metadata-test
  (testing "slack metadata on the conversation row is set once and never overwritten by a later writer"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (metabot-persistence/store-native-parts!
           conversation-id "metabot-1" [{:type :text :text "first"}]
           :slack-team-id "T-FIRST"
           :channel-id "C-FIRST"
           :slack-thread-ts "1700000000.000001"))
        (mt/with-current-user (mt/user->id :lucky)
          (metabot-persistence/store-native-parts!
           conversation-id "metabot-1" [{:type :text :text "second"}]
           :slack-team-id "T-SECOND"
           :channel-id "C-SECOND"
           :slack-thread-ts "1700000000.999999"))
        (let [conversation (t2/select-one :model/MetabotConversation :id conversation-id)]
          (is (= "T-FIRST" (:slack_team_id conversation)))
          (is (= "C-FIRST" (:slack_channel_id conversation)))
          (is (= "1700000000.000001" (:slack_thread_ts conversation))))))))

(deftest conversation-detail-filters-soft-deleted-messages-and-orders-ascending-test
  (testing "conversation-detail returns only non-deleted messages, ordered by :created_at ascending"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (str (random-uuid))
            user-id         (mt/user->id :rasta)
            now             (java.time.OffsetDateTime/now)
            insert!         (fn [{:keys [text created-at deleted-at external-id role]
                                  :or   {role "assistant"}}]
                              (t2/insert-returning-pks!
                               :model/MetabotMessage
                               (cond-> {:conversation_id conversation-id
                                        :role            role
                                        :profile_id      "metabot-1"
                                        :external_id     (or external-id (str (random-uuid)))
                                        :total_tokens    0
                                        :data            [{:type "text" :text text :id (str (random-uuid))}]
                                        :created_at      created-at}
                                 deleted-at (assoc :deleted_at deleted-at))))]
        (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
        (insert! {:text "second" :created-at (.plusSeconds now 2)})
        (insert! {:text "first"  :created-at (.plusSeconds now 1)})
        (insert! {:text "deleted-third"
                  :created-at (.plusSeconds now 3)
                  :deleted-at now})
        (let [detail (metabot-persistence/conversation-detail conversation-id)
              texts  (mapv :message (:chat_messages detail))]
          (is (= conversation-id (:conversation_id detail)))
          (is (= ["first" "second"] texts)))))))

(deftest conversation-detail-returns-nil-for-missing-conversation-test
  (testing "conversation-detail returns nil when the conversation does not exist"
    (is (nil? (metabot-persistence/conversation-detail (str (random-uuid)))))))

(deftest message->chat-messages-stubs-empty-errored-agent-row-test
  (testing "an errored agent row with empty :data emits a placeholder agent message
            so the FE can render the alert"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant :error (json/encode {:message "boom"}) :finished true :data []
                   :external_id "ext-1"})]
      (is (= 1 (count result)))
      (is (= {:role "agent" :type "text" :message ""}
             (select-keys (first result) [:role :type :message])))
      (is (= {:message "boom"} (:error (first result))))
      (is (= "ext-1" (:externalId (first result))))))
  (testing "an aborted agent row with empty :data also gets a stub"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant :finished false :data []})]
      (is (= 1 (count result)))
      (is (false? (:finished (first result))))))
  (testing "a healthy assistant row with empty :data still produces no messages"
    (is (= [] (metabot-persistence/message->chat-messages
               {:role :assistant :finished true :data []})))))

(deftest message->chat-messages-annotates-agent-status-test
  (testing "agent messages get :finished true and no :error by default"
    (let [[msg] (metabot-persistence/message->chat-messages
                 {:role :assistant
                  :data [{:type "text" :text "ok" :id "b1"}]})]
      (is (true? (:finished msg)))
      (is (not (contains? msg :error)))))
  (testing "agent messages inherit :finished false from the parent row"
    (let [[msg] (metabot-persistence/message->chat-messages
                 {:role :assistant :finished false
                  :data [{:type "text" :text "interrupted" :id "b1"}]})]
      (is (false? (:finished msg)))))
  (testing "agent messages inherit JSON-decoded :error from the parent row"
    (let [[msg] (metabot-persistence/message->chat-messages
                 {:role :assistant :finished true
                  :error (json/encode {:message "boom" :type "RuntimeException"})
                  :data [{:type "text" :text "partial" :id "b1"}]})]
      (is (= {:message "boom" :type "RuntimeException"} (:error msg)))))
  (testing "non-JSON :error column values fall through unchanged"
    (let [[msg] (metabot-persistence/message->chat-messages
                 {:role :assistant :finished true :error "raw legacy text"
                  :data [{:type "text" :text "partial" :id "b1"}]})]
      (is (= "raw legacy text" (:error msg)))))
  (testing "user messages do not receive agent-only status fields"
    (let [[msg] (metabot-persistence/message->chat-messages
                 {:role :user :data [{:role "user" :content "hi"}]})]
      (is (not (contains? msg :finished)))
      (is (not (contains? msg :error))))))

(deftest messages->chat-messages-drops-errored-pairs-by-default-test
  (testing "errored assistant rows and the user prompt that triggered them are removed"
    (let [messages [{:role :user      :data [{:role "user" :content "first"}]}
                    {:role :assistant :data [{:type "text" :text "first reply" :id "a1"}]}
                    {:role :user      :data [{:role "user" :content "broken"}]}
                    {:role :assistant :error (json/encode {:message "boom"}) :data []}
                    {:role :user      :data [{:role "user" :content "third"}]}
                    {:role :assistant :data [{:type "text" :text "third reply" :id "a3"}]}]
          result   (metabot-persistence/messages->chat-messages messages)]
      (is (= ["first" "first reply" "third" "third reply"]
             (mapv :message result)))))
  (testing "an errored row at the start with no preceding user prompt is still dropped"
    (let [result (metabot-persistence/messages->chat-messages
                  [{:role :assistant :error (json/encode {:message "boom"}) :data []}
                   {:role :user      :data [{:role "user" :content "hi"}]}
                   {:role :assistant :data [{:type "text" :text "hello" :id "a1"}]}])]
      (is (= ["hi" "hello"] (mapv :message result))))))

(deftest messages->chat-messages-include-errored-test
  (testing "with :include-errored? true, errored pairs stay and :error surfaces on agent messages"
    (let [messages [{:role :user      :data [{:role "user" :content "broken"}]}
                    {:role :assistant :error (json/encode {:message "boom"}) :finished true
                     :data [{:type "text" :text "partial" :id "a1"}]}
                    {:role :user      :data [{:role "user" :content "ok"}]}
                    {:role :assistant :data [{:type "text" :text "fine" :id "a2"}]}]
          result   (metabot-persistence/messages->chat-messages
                    messages {:include-errored? true})]
      (is (= ["broken" "partial" "ok" "fine"] (mapv :message result)))
      (is (= {:message "boom"} (:error (second result))))
      (is (not (contains? (nth result 3) :error))))))

(deftest store-native-parts-persists-finished-and-error-test
  (testing "store-native-parts! writes :finished true and no :error by default"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (metabot-persistence/store-native-parts!
           conversation-id "metabot-1" [{:type :text :text "hello"}]))
        (let [message (t2/select-one :model/MetabotMessage :conversation_id conversation-id)]
          (is (true? (:finished message)))
          (is (nil? (:error message)))))))
  (testing "aborted turn: :finished? false flows through, no error"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (metabot-persistence/store-native-parts!
           conversation-id "metabot-1" [{:type :text :text "partial"}]
           :finished? false))
        (let [message (t2/select-one :model/MetabotMessage :conversation_id conversation-id)]
          (is (false? (:finished message)))
          (is (nil? (:error message)))))))
  (testing "errored turn: :error map JSON-encoded into the column; partial parts persisted as-is"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (str (random-uuid))
            error-data      {:message "agent loop API error: 503"
                             :type    "java.lang.RuntimeException"
                             :data    {:status 503}}]
        (mt/with-current-user (mt/user->id :rasta)
          (metabot-persistence/store-native-parts!
           conversation-id "metabot-1"
           [{:type :text :text "before failure"}]
           :error error-data))
        (let [message  (t2/select-one :model/MetabotMessage :conversation_id conversation-id)
              [chat-msg] (metabot-persistence/message->chat-messages message)]
          (is (true? (:finished message)))
          (is (string? (:error message)))
          (is (= error-data (json/decode+kw (:error message))))
          (is (= error-data (:error chat-msg)))
          (is (seq (:data message)))))))
  (testing "errored turn: :error string also accepted (any JSON-serializable value)"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (metabot-persistence/store-native-parts!
           conversation-id "metabot-1"
           [{:type :text :text "before failure"}]
           :error "boom"))
        (let [message    (t2/select-one :model/MetabotMessage :conversation_id conversation-id)
              [chat-msg] (metabot-persistence/message->chat-messages message)]
          (is (= "\"boom\"" (:error message)))
          (is (= "boom" (:error chat-msg))))))))
