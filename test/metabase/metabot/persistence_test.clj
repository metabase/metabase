(ns metabase.metabot.persistence-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.persistence :as metabot-persistence]
   [metabase.metabot.query-analyzer :as nqa]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.used-tables :as used-tables]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log.capture :as log.capture]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defmacro ^:private with-rasta-tx
  "Run `body` in a rollback-only transaction as rasta — the standard preamble for
  these DB-backed persistence tests."
  [& body]
  `(t2/with-transaction [_conn# nil {:rollback-only true}]
     (mt/with-current-user (mt/user->id :rasta)
       ~@body)))

(deftest ^:parallel first-non-forked-user-message-test
  (testing "returns the first non-blank user message from a replayable, live turn"
    (let [deleted-at (t/offset-date-time)]
      (is (= {:content "keep this prompt" :profile-id "internal"}
             (metabot-persistence/first-non-forked-user-message
              [{:id 1 :role :user :profile_id "default"
                :data [{:type "text" :text "errored prompt"}]}
               {:id 2 :role :assistant :finished true :error "boom" :data []}
               {:id 3 :role :user :profile_id "default" :deleted_at deleted-at
                :data [{:type "text" :text "deleted prompt"}]}
               {:id 4 :role :assistant :finished true :data []}
               {:id 5 :role :user :profile_id "default"
                :data [{:type "text" :text "in-flight prompt"}]}
               {:id 6 :role :assistant :finished nil :data []}
               {:id 7 :role :user :profile_id "default"
                :data [{:type "text" :text "  "}]}
               {:id 8 :role :assistant :finished true :data []}
               {:id 9 :role :user :profile_id "internal"
                :data [{:type "text" :text "keep this prompt"}]}
               {:id 10 :role :assistant :finished false :data []}])))))
  (testing "returns nil when no live replayable turn has a non-blank user message"
    (is (nil? (metabot-persistence/first-non-forked-user-message
               [{:id 1 :role :user :data [{:type "text" :text "failed"}]}
                {:id 2 :role :assistant :finished true :error "boom" :data []}]))))
  (testing "skips messages cloned from the source conversation on a fork"
    (is (= {:content "the new direction" :profile-id "default"}
           (metabot-persistence/first-non-forked-user-message
            [{:id 1 :role :user :profile_id "default" :forked_from_message_id 100
              :data [{:type "text" :text "inherited prompt"}]}
             {:id 2 :role :assistant :finished true :forked_from_message_id 101 :data []}
             {:id 3 :role :user :profile_id "default"
              :data [{:type "text" :text "the new direction"}]}
             {:id 4 :role :assistant :finished true :data []}]))))
  (testing "returns nil for a fork with no post-fork user message yet"
    (is (nil? (metabot-persistence/first-non-forked-user-message
               [{:id 1 :role :user :profile_id "default" :forked_from_message_id 100
                 :data [{:type "text" :text "inherited prompt"}]}
                {:id 2 :role :assistant :finished true :forked_from_message_id 101 :data []}])))))

(deftest ^:parallel message->chat-messages-test
  (testing "text part on a user row renders as a user message"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :user
                   :data [{:type "text" :text "hello"}]})]
      (is (= 1 (count result)))
      (is (= {:role "user" :type "text" :message "hello"}
             (select-keys (first result) [:role :type :message])))
      (is (string? (:id (first result)))))))

(deftest ^:parallel message->chat-messages-test-2
  (testing "text part on an assistant row renders as an agent message with a generated id"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:type "text" :text "hi there"}]})]
      (is (= [{:role "agent" :type "text" :message "hi there"}]
             (mapv #(select-keys % [:role :type :message]) result)))
      (is (string? (:id (first result)))))))

(deftest ^:parallel message->chat-messages-test-5
  (testing "resolved tool part carries args and result"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:type "tool-search" :toolCallId "call-1" :state "output-available"
                           :input {:query "foo"} :output {:output "rows!" :structured_output {:query-id "q"}}}]})]
      (is (= 1 (count result)))
      (is (= {:id       "call-1"
              :role     "agent"
              :type     "tool_call"
              :name     "search"
              :status   "ended"
              :is_error false}
             (select-keys (first result) [:id :role :type :name :status :is_error])))
      (is (= {:query "foo"} (json/decode+kw (:args (first result)))))
      (is (= {:output "rows!" :structured_output {:query-id "q"}}
             (json/decode+kw (:result (first result))))))))

(deftest ^:parallel message->chat-messages-test-6
  (testing "errored tool part is flagged and carries no result"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:type "tool-boom" :toolCallId "call-2" :state "output-error"
                           :input {} :errorText "exploded"}]})]
      (is (true? (:is_error (first result))))
      (is (nil? (:result (first result)))))))

(deftest ^:parallel message->chat-messages-test-7
  (testing "unresolved tool part renders without result/error fields"
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:type "tool-search" :toolCallId "call-3" :state "input-available" :input {}}]})]
      (is (= 1 (count result)))
      (is (= "tool_call" (:type (first result))))
      (is (not (contains? (first result) :result)))
      (is (not (contains? (first result) :is_error))))))

(deftest ^:parallel message->chat-messages-test-11
  (testing "resolved tool part with a nil :output yields a nil :result, not the string \"null\""
    (let [result (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:type "tool-search" :toolCallId "call-4" :state "output-available"
                           :input {} :output nil}]})]
      (is (false? (:is_error (first result))))
      (is (nil? (:result (first result)))))))

(deftest ^:parallel message->chat-messages-test-8
  (testing "unknown part types are dropped"
    (is (= []
           (metabot-persistence/message->chat-messages
            {:role :assistant
             :data [{:type "mystery"}]})))))

(deftest ^:parallel message->chat-messages-test-9
  (testing "data parts are converted to data_part chat messages"
    (let [blocks [{:type "data-generated_entity" :data {:type "dashboard" :url "/auto/dashboard/table/1"}}
                  {:type "data-todo_list"   :data [{:id "t1"}]}
                  {:type "data-code_edit"   :data {:buffer_id "b" :value "v"}}]]
      (is (=? [{:role "agent" :type "data_part" :part {:type "data-generated_entity" :data {:type "dashboard" :url "/auto/dashboard/table/1"}}}
               {:role "agent" :type "data_part" :part {:type "data-todo_list"   :data [{:id "t1"}]}}
               {:role "agent" :type "data_part" :part {:type "data-code_edit"   :data {:buffer_id "b" :value "v"}}}]
              (metabot-persistence/message->chat-messages {:role :assistant :data blocks}))))))

(deftest ^:parallel message->chat-messages-test-10
  (testing "nil :data yields no messages"
    (is (= [] (metabot-persistence/message->chat-messages {:role :user :data nil})))))

(deftest ^:parallel messages->chat-messages-flattens-across-messages-test
  (let [result (metabot-persistence/messages->chat-messages
                [{:role :user      :data [{:type "text" :text "hi"}]}
                 {:role :assistant :data [{:type "text" :text "hello!"}
                                          {:type "tool-f" :toolCallId "t1" :state "output-available"
                                           :input {:x 1} :output {:output "ok"}}]}])]
    (is (= 3 (count result)))
    (is (= ["user" "agent" "agent"] (map :role result)))
    (is (= ["text" "text" "tool_call"] (map :type result)))
    (is (= "hi" (:message (nth result 0))))
    (is (= "hello!" (:message (nth result 1))))
    (is (= {:output "ok"} (json/decode+kw (:result (nth result 2)))))))

(deftest ^:parallel messages->chat-messages-active-placeholder-test
  (testing "an in-flight assistant placeholder becomes a trailing turn_in_progress message"
    (let [result (metabot-persistence/messages->chat-messages
                  [{:role :user :data [{:type "text" :text "hi"}]}
                   {:id 2 :role :assistant :external_id "a1"
                    :created_at (t/offset-date-time) :finished nil :data []}])]
      (is (= ["user" "agent"] (map :role result)))
      (is (= ["text" "turn_in_progress"] (map :type result)))
      (is (= "a1" (:externalId (second result)))))))

(deftest ^:parallel messages->chat-messages-stale-placeholder-test
  (testing "a placeholder past the grace window is an aborted (finished=false) turn, not in-progress"
    (let [result (metabot-persistence/messages->chat-messages
                  [{:role :user :data [{:type "text" :text "hi"}]}
                   {:id 2 :role :assistant :external_id "a1"
                    :created_at (t/minus (t/offset-date-time) (t/hours 1))
                    :finished nil :data []}])]
      (is (not-any? #(= "turn_in_progress" (:type %)) result))
      (is (false? (:finished (last result)))))))

(deftest ^:parallel messages->flat-messages-test
  (let [deleted-at (t/offset-date-time)
        messages   (metabot-persistence/messages->flat-messages
                    [{:role :user :data [{:type "text" :text "q1"}]}
                     {:role       :assistant
                      :deleted_at deleted-at
                      :data       [{:type "text" :text "discarded-1"}
                                   {:type "text" :text "discarded-2"}]}
                     {:role :assistant :data [{:type "text" :text "older-live"}]}
                     {:role :assistant :data [{:type "text" :text "kept-1"}
                                              {:type "text" :text "kept-2"}]}
                     {:role :user :data [{:type "text" :text "q2"}]}])
        by-text    #(u/seek (fn [message] (= % (:message message))) messages)
        q1         (by-text "q1")
        discarded-1 (by-text "discarded-1")
        discarded-2 (by-text "discarded-2")
        older-live (by-text "older-live")
        kept-1     (by-text "kept-1")
        kept-2     (by-text "kept-2")
        q2         (by-text "q2")]
    (is (= ["q1" "discarded-1" "discarded-2" "older-live" "kept-1" "kept-2" "q2"]
           (map :message messages)))
    (is (nil? (:parent_message_id q1)))
    (is (= (:id q1) (:parent_message_id discarded-1)))
    (is (= (:id discarded-1) (:parent_message_id discarded-2)))
    (is (= (:id q1) (:parent_message_id older-live)))
    (is (= (:id q1) (:parent_message_id kept-1)))
    (is (= (:id kept-1) (:parent_message_id kept-2)))
    (is (= (:id kept-2) (:parent_message_id q2)))))

(deftest ^:parallel messages->flat-messages-deleted-placeholder-test
  (let [now      (t/offset-date-time)
        messages (metabot-persistence/messages->flat-messages
                  [{:role :user :data [{:type "text" :text "q1"}]}
                   {:id          1
                    :role        :assistant
                    :external_id "a1"
                    :created_at  now
                    :deleted_at  now
                    :finished    nil
                    :data        []}])]
    (is (= ["text" "text"] (map :type messages)))
    (is (false? (:finished (second messages))))))

(deftest ^:parallel messages->flat-messages-keeps-rewound-errored-turn-test
  (let [deleted-at (t/offset-date-time)
        rows       [{:id 1 :role :user :external_id "u1" :deleted_at deleted-at
                     :data [{:type "text" :text "revenue"}]}
                    {:id 2 :role :assistant :external_id "a1" :deleted_at deleted-at
                     :finished true :error "{\"message\":\"boom\"}" :data []}
                    {:id 3 :role :user :external_id "u2" :data [{:type "text" :text "orders"}]}
                    {:id 4 :role :assistant :external_id "a2" :finished true
                     :data [{:type "text" :text "here"}]}]]
    (testing "with :include-rewound-errors? the rewound errored turn shows its prompt and error,
              threaded as a dead branch the live follow-up does not descend from"
      (let [messages (metabot-persistence/messages->flat-messages rows {:include-rewound-errors? true})
            by-text  #(u/seek (fn [m] (= % (:message m))) messages)]
        (is (= ["revenue" "" "orders" "here"] (map :message messages)))
        (is (some (fn [m] (and (= "agent" (:role m)) (some? (:error m)))) messages)
            "the errored reply's error survives")
        (is (nil? (:parent_message_id (by-text "orders")))
            "the live follow-up parents onto the root, not the rewound errored turn")))
    (testing "by default the rewound errored turn is dropped"
      (is (= ["orders" "here"]
             (map :message (metabot-persistence/messages->flat-messages rows)))))))

(deftest ^:parallel messages->flat-messages-drops-cleanly-superseded-turn-test
  (testing "even with :include-rewound-errors?, a soft-deleted prompt with no error is dropped"
    (let [deleted-at (t/offset-date-time)
          messages   (metabot-persistence/messages->flat-messages
                      [{:id 1 :role :user :external_id "u1" :deleted_at deleted-at
                        :data [{:type "text" :text "stale-prompt"}]}
                       {:id 2 :role :assistant :external_id "a1" :deleted_at deleted-at
                        :finished true :data [{:type "text" :text "stale-reply"}]}
                       {:id 3 :role :user :external_id "u2" :data [{:type "text" :text "orders"}]}
                       {:id 4 :role :assistant :external_id "a2" :finished true
                        :data [{:type "text" :text "here"}]}]
                      {:include-rewound-errors? true})]
      (is (= ["orders" "here"] (map :message messages))))))

(deftest start-turn-persists-slack-conversation-metadata-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [conversation-id (str (random-uuid))
          team-id         "T123"
          channel-id      "C123"
          thread-ts       "1712785577.123456"]
      (mt/with-current-user (mt/user->id :rasta)
        (metabot-persistence/start-turn!
         conversation-id
         "slackbot"
         {:role "user" :content "hello"}
         :slack-team-id team-id
         :channel-id channel-id
         :slack-thread-ts thread-ts
         :slack-msg-id "1712785577.123456"))
      (let [conversation (t2/select-one :model/MetabotConversation :id conversation-id)]
        (is (= (mt/user->id :rasta) (:user_id conversation)))
        (is (= team-id (:slack_team_id conversation)))
        (is (= channel-id (:slack_channel_id conversation)))
        (is (= thread-ts (:slack_thread_ts conversation)))))))

(deftest ^:parallel combine-text-parts-xf-merges-consecutive-text-test
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

(deftest ^:parallel parts->storable-content-preserves-non-map-tool-result-test
  ;; Regression: a non-map tool result used to throw in `select-keys`, failing the turn's persist.
  (testing "a bare string/scalar tool result is stored as-is under :output"
    (is (= [{:type "tool-search" :toolCallId "c1" :state "output-available"
             :input {:q "x"} :output "just a string"}]
           (metabot-persistence/parts->storable-content
            [{:type :tool-input :id "c1" :function "search" :arguments {:q "x"}}
             {:type :tool-output :id "c1" :result "just a string"}]))))
  (testing "a map result still trims to {:output … :structured_output …}"
    (is (= [{:type "tool-search" :toolCallId "c1" :state "output-available"
             :input {} :output {:output "rows" :structured_output {:query-id "q"}}}]
           (metabot-persistence/parts->storable-content
            [{:type :tool-input :id "c1" :function "search" :arguments {}}
             {:type   :tool-output :id "c1"
              :result {:output "rows" :structured-output {:query-id "q" :resources [:drop-me]}}}]))))
  (testing "a nil result passes through as nil :output"
    (is (= [{:type "tool-search" :toolCallId "c1" :state "output-available"
             :input {} :output nil}]
           (metabot-persistence/parts->storable-content
            [{:type :tool-input :id "c1" :function "search" :arguments {}}
             {:type :tool-output :id "c1" :result nil}])))))

(deftest ^:parallel parts->storable-content-emits-step-start-boundaries-test
  (testing "each :start becomes a step-start boundary, in stream order"
    (is (= [{:type "step-start"}
            {:type "tool-search" :toolCallId "c1" :state "output-available"
             :input {:q "x"} :output "rows"}
            {:type "step-start"}
            {:type "text" :text "done" :state "done"}]
           (metabot-persistence/parts->storable-content
            [{:type :start :id "m1"}
             {:type :tool-input :id "c1" :function "search" :arguments {:q "x"}}
             {:type :tool-output :id "c1" :result "rows"}
             {:type :start :id "m2"}
             {:type :text :text "done"}]))))
  (testing "step-start renders no chat message on read"
    (is (= [{:role "agent" :type "text" :message "Hello"}]
           (mapv #(select-keys % [:role :type :message])
                 (metabot-persistence/message->chat-messages
                  {:role :assistant
                   :data [{:type "step-start"}
                          {:type "text" :text "Hello"}]}))))))

(deftest start-turn-persists-slack-metadata-on-rows-test
  (testing "start-turn! lands slack-team-id / channel-id / slack-thread-ts on the conversation row,
            and slack-msg-id / channel-id / user-id on the user message row, plus user-id on the
            assistant placeholder row"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))
            team-id         "T-NATIVE"
            channel-id      "C-NATIVE"
            thread-ts       "1700000000.000001"
            slack-msg-id    "1700000000.000099"
            user-id         (mt/user->id :rasta)]
        (mt/with-current-user user-id
          (metabot-persistence/start-turn!
           conversation-id
           "metabot-1"
           {:role "user" :content "hello from slack"}
           :slack-team-id team-id
           :channel-id channel-id
           :slack-thread-ts thread-ts
           :slack-msg-id slack-msg-id
           :user-id user-id))
        (let [conversation (t2/select-one :model/MetabotConversation :id conversation-id)
              [user-msg
               asst-msg]   (t2/select :model/MetabotMessage
                                      :conversation_id conversation-id
                                      {:order-by [[:created_at :asc] [:id :asc]]})]
          (is (= user-id (:user_id conversation)))
          (is (= team-id (:slack_team_id conversation)))
          (is (= channel-id (:slack_channel_id conversation)))
          (is (= thread-ts (:slack_thread_ts conversation)))
          (testing "user row carries slack ids"
            (is (= :user (:role user-msg)))
            (is (= channel-id (:channel_id user-msg)))
            (is (= slack-msg-id (:slack_msg_id user-msg)))
            (is (= user-id (:user_id user-msg))))
          (testing "assistant placeholder is in-flight, no slack_msg_id yet"
            (is (= :assistant (:role asst-msg)))
            (is (nil? (:finished asst-msg)) "in-flight placeholder uses NULL marker")
            (is (= [] (:data asst-msg)))
            (is (= channel-id (:channel_id asst-msg)))
            (is (nil? (:slack_msg_id asst-msg)))
            (is (= user-id (:user_id asst-msg)))))))))

(deftest start-turn-does-not-overwrite-slack-metadata-on-subsequent-turns-test
  (testing "conversation-level slack metadata is set once and never overwritten by a later turn"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (metabot-persistence/start-turn!
           conversation-id "metabot-1" {:role "user" :content "first"}
           :slack-team-id "T-FIRST"
           :channel-id "C-FIRST"
           :slack-thread-ts "1700000000.000001"))
        (mt/with-current-user (mt/user->id :lucky)
          (metabot-persistence/start-turn!
           conversation-id "metabot-1" {:role "user" :content "second"}
           :slack-team-id "T-SECOND"
           :channel-id "C-SECOND"
           :slack-thread-ts "1700000000.999999"))
        (let [conversation (t2/select-one :model/MetabotConversation :id conversation-id)]
          (is (= "T-FIRST" (:slack_team_id conversation)))
          (is (= "C-FIRST" (:slack_channel_id conversation)))
          (is (= "1700000000.000001" (:slack_thread_ts conversation))))))))

(deftest start-turn-returns-assistant-pk-and-external-id-test
  (testing "start-turn! returns the assistant placeholder PK and a fresh external_id;
            inserts exactly one user row + one assistant placeholder row"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{:keys [assistant-msg-id assistant-external-id]}
                (metabot-persistence/start-turn!
                 conversation-id "internal" {:role "user" :content "hi"})
                rows (t2/select :model/MetabotMessage :conversation_id conversation-id
                                {:order-by [[:created_at :asc] [:id :asc]]})]
            (is (pos-int? assistant-msg-id))
            (is (string? assistant-external-id))
            (is (= 2 (count rows)))
            (is (= [:user :assistant] (mapv :role rows)))
            (testing "assistant row matches returned ids"
              (let [asst (second rows)]
                (is (= assistant-msg-id (:id asst)))
                (is (= assistant-external-id (:external_id asst)))
                (is (nil? (:finished asst)) "in-flight placeholder uses NULL marker")
                (is (= [] (:data asst)))))))))))

(deftest finalize-assistant-turn-updates-placeholder-in-place-test
  (testing "finalize-assistant-turn! UPDATEs the placeholder; row count and created_at unchanged"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                            conversation-id "internal"
                                            {:role "user" :content "hi"})
                created-at-before          (:created_at (t2/select-one :model/MetabotMessage assistant-msg-id))
                _                          (metabot-persistence/finalize-assistant-turn!
                                            assistant-msg-id
                                            [{:type :text :text "Hello"}
                                             {:type  :usage
                                              :model "claude-sonnet-4-6"
                                              :usage {:promptTokens 10 :completionTokens 5}}])
                row                        (t2/select-one :model/MetabotMessage assistant-msg-id)
                rows                       (t2/select :model/MetabotMessage
                                                      :conversation_id conversation-id)]
            (is (= 2 (count rows))                 "no extra row inserted on finalize")
            (is (= created-at-before (:created_at row)) "created_at is not changed on UPDATE")
            (is (true? (:finished row))            "default :finished? is true")
            (is (nil? (:error row)))
            (is (= [{:type "text" :text "Hello" :state "done"}] (:data row)))
            (is (= 15 (:total_tokens row)))))))))

(deftest finalize-assistant-turn-passes-through-aborted-and-errored-test
  (testing "finalize-assistant-turn! preserves :finished? false and JSON-encodes :error"
    (with-rasta-tx
      (testing "aborted: finished false flows through"
        (let [conversation-id (str (random-uuid))
              {:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                          conversation-id "internal"
                                          {:role "user" :content "go"})]
          (metabot-persistence/finalize-assistant-turn!
           assistant-msg-id
           [{:type :text :text "partial"}]
           :finished? false)
          (is (=? {:finished false :error nil}
                  (t2/select-one :model/MetabotMessage assistant-msg-id)))))
      (testing "errored: error map JSON-encoded into the error column"
        (let [conversation-id (str (random-uuid))
              error-data      {:message "boom" :type "RuntimeException"}
              {:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                          conversation-id "internal"
                                          {:role "user" :content "go"})]
          (metabot-persistence/finalize-assistant-turn!
           assistant-msg-id []
           :error error-data)
          (let [row (t2/select-one :model/MetabotMessage assistant-msg-id)]
            (is (true? (:finished row)))
            (is (= error-data (json/decode+kw (:error row))))))))))

(deftest start-turn-pins-ordering-under-abort-then-retry-test
  (testing "an aborted turn whose finalize fires after a retry still sorts before the retry's rows"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          ;; Turn A: starts and is left in-flight
          (let [{a-pk :assistant-msg-id} (metabot-persistence/start-turn!
                                          conversation-id "internal"
                                          {:role "user" :content "A"})]
            ;; Turn B (retry) — its rows are inserted *while* Turn A is still in-flight
            (Thread/sleep 5)
            (let [{b-pk :assistant-msg-id} (metabot-persistence/start-turn!
                                            conversation-id "internal"
                                            {:role "user" :content "B"})]
              ;; Now Turn A's stream finally lands (abort): UPDATE on its placeholder
              (Thread/sleep 5)
              (metabot-persistence/finalize-assistant-turn!
               a-pk
               [{:type :text :text "partial-A"}]
               :finished? false)
              ;; Turn B completes normally
              (metabot-persistence/finalize-assistant-turn!
               b-pk
               [{:type :text :text "reply-B"}])
              (let [rows (t2/select :model/MetabotMessage :conversation_id conversation-id
                                    {:order-by [[:created_at :asc] [:id :asc]]})]
                (is (= [:user :assistant :user :assistant] (mapv :role rows)))
                (is (= ["A" "partial-A" "B" "reply-B"]
                       (mapv #(-> % :data first :text) rows)))))))))))

(deftest start-turn-user-and-placeholder-share-created-at-test
  (testing "user-message and assistant-placeholder rows inserted by start-turn! share an instant;
            readers must tiebreak on :id to preserve user-before-assistant ordering"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (metabot-persistence/start-turn!
           conversation-id "internal" {:role "user" :content "hi"}))
        (let [[u a] (t2/select :model/MetabotMessage
                               :conversation_id conversation-id
                               {:order-by [[:id :asc]]})]
          (is (= :user      (:role u)))
          (is (= :assistant (:role a)))
          (is (< (:id u) (:id a)) "user row is inserted first; smaller :id")
          (is (<= (compare (:created_at u) (:created_at a)) 0)
              "user row's created_at is no later than the placeholder's"))))))

(deftest conversation-detail-drops-errored-pair-under-created-at-collision-test
  (testing "drop-errored-pairs works correctly when the errored user/asst rows share created_at"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          ;; Errored turn: user-msg and asst-row share created_at via start-turn!'s transaction.
          (let [{:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                            conversation-id "internal"
                                            {:role "user" :content "boom"})]
            (metabot-persistence/finalize-assistant-turn!
             assistant-msg-id []
             :error {:message "kaboom" :type "RuntimeException"}))
          ;; Healthy follow-up turn — its user-msg and asst-row also collide on created_at.
          (let [{:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                            conversation-id "internal"
                                            {:role "user" :content "retry"})]
            (metabot-persistence/finalize-assistant-turn!
             assistant-msg-id
             [{:type :text :text "ok"}])))
        ;; conversation-detail uses production reader ordering — the errored pair drops,
        ;; leaving just the retry turn.
        (let [{:keys [messages]} (metabot-persistence/conversation-detail conversation-id)]
          (is (= [["user" "retry"] ["agent" "ok"]]
                 (mapv (juxt :role :message) messages))))))))

(deftest placeholder-still-active-uses-nil-finished-marker-test
  (testing "the in-flight predicate keys off finished IS NULL (not :data emptiness or :error)"
    (let [recent (java.time.OffsetDateTime/now)
          stale  (.minusHours recent 2)
          base   {:role :assistant :data [] :error nil}]
      (testing "finished=nil + recent created_at → in-progress turn"
        (is (=? [{:type "turn_in_progress" :role "agent"}]
                (metabot-persistence/messages->chat-messages
                 [(assoc base :finished nil :created_at recent)]))))
      (testing "finished=nil + stale created_at → not filtered (renders aborted stub)"
        (is (=? [{:type "text" :message "" :finished false}]
                (metabot-persistence/messages->chat-messages
                 [(assoc base :finished nil :created_at stale)]))))
      (testing "finished=false → never filtered, even within grace"
        (is (=? [{:type "text" :message "" :finished false}]
                (metabot-persistence/messages->chat-messages
                 [(assoc base :finished false :created_at recent)]))))
      (testing "finished=true → never filtered"
        (is (= [] (metabot-persistence/messages->chat-messages
                   [(assoc base :finished true :created_at recent)]))
            "no stub: finished=true with no error is a successful empty turn")))))

(deftest conversation-detail-filters-soft-deleted-messages-and-orders-ascending-test
  (testing "conversation-detail returns only non-deleted messages, ordered by :created_at ascending"
    (t2/with-transaction [_conn nil {:rollback-only true}]
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
                                        :data            [{:type "text" :text text}]
                                        :data_version    2
                                        :created_at      created-at
                                        :finished        true}
                                 deleted-at (assoc :deleted_at deleted-at))))]
        (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
        (insert! {:text "second" :created-at (.plusSeconds now 2)})
        (insert! {:text "first"  :created-at (.plusSeconds now 1)})
        (insert! {:text "deleted-third"
                  :created-at (.plusSeconds now 3)
                  :deleted-at now})
        (let [detail (metabot-persistence/conversation-detail conversation-id)
              texts  (mapv :message (:messages detail))]
          (is (= conversation-id (:conversation_id detail)))
          (is (= ["first" "second"] texts)))))))

(deftest conversation-detail-returns-nil-for-missing-conversation-test
  (testing "conversation-detail returns nil when the conversation does not exist"
    (is (nil? (metabot-persistence/conversation-detail (str (random-uuid)))))))

(deftest leaf-external-id-nil-for-conversation-with-no-messages-test
  (testing "nil for a conversation with no messages yet"
    (is (nil? (metabot-persistence/leaf-external-id (str (random-uuid)))))))

(deftest leaf-external-id-returns-current-placeholder-after-start-turn-test
  (testing "returns the assistant placeholder's external_id right after start-turn!"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{:keys [assistant-external-id]} (metabot-persistence/start-turn!
                                                 conversation-id "internal"
                                                 {:role "user" :content "hi"})]
            (is (= assistant-external-id
                   (metabot-persistence/leaf-external-id conversation-id)))))))))

(deftest leaf-external-id-advances-to-latest-turn-test
  (testing "advances to the second turn's external_id, not the first"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{a-pk :assistant-msg-id} (metabot-persistence/start-turn!
                                          conversation-id "internal"
                                          {:role "user" :content "A"})]
            (metabot-persistence/finalize-assistant-turn!
             a-pk [{:type :text :text "reply-A"}]))
          (let [{b-pk :assistant-msg-id b-ext :assistant-external-id}
                (metabot-persistence/start-turn!
                 conversation-id "internal" {:role "user" :content "B"})]
            (metabot-persistence/finalize-assistant-turn!
             b-pk [{:type :text :text "reply-B"}])
            (is (= b-ext (metabot-persistence/leaf-external-id conversation-id)))))))))

(deftest leaf-external-id-unaffected-by-errored-finalize-test
  (testing "still returns the row's external_id when the turn finalizes as errored"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{:keys [assistant-msg-id assistant-external-id]}
                (metabot-persistence/start-turn!
                 conversation-id "internal" {:role "user" :content "hi"})]
            (metabot-persistence/finalize-assistant-turn!
             assistant-msg-id []
             :error {:message "boom" :type "RuntimeException"})
            (is (= assistant-external-id
                   (metabot-persistence/leaf-external-id conversation-id)))))))))

(deftest leaf-external-id-never-returns-a-user-row-even-when-the-trailing-assistant-reply-is-deleted-test
  (testing "returns the earlier turn's assistant external_id, not the later turn's undeleted user row"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{a-pk :assistant-msg-id a-ext :assistant-external-id}
                (metabot-persistence/start-turn!
                 conversation-id "internal" {:role "user" :content "A"})]
            (metabot-persistence/finalize-assistant-turn!
             a-pk [{:type :text :text "reply-A"}])
            (let [{b-pk :assistant-msg-id} (metabot-persistence/start-turn!
                                            conversation-id "internal"
                                            {:role "user" :content "B"})]
              (metabot-persistence/finalize-assistant-turn!
               b-pk [{:type :text :text "reply-B"}])
              ;; soft-delete only turn B's assistant reply — its user row stays undeleted
              ;; and is now the most-recent non-deleted row overall.
              (t2/update! :model/MetabotMessage b-pk {:deleted_at (java.time.OffsetDateTime/now)})
              (is (= a-ext (metabot-persistence/leaf-external-id conversation-id))
                  "must not fall through to turn B's undeleted user row"))))))))

(deftest start-turn-returns-user-external-id-test
  (testing "start-turn! returns the user row's external_id"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{:keys [user-external-id]} (metabot-persistence/start-turn!
                                            conversation-id "internal"
                                            {:role "user" :content "hi"})]
            (is (string? user-external-id))
            (is (= user-external-id
                   (t2/select-one-fn :external_id :model/MetabotMessage
                                     :conversation_id conversation-id :role "user")))))))))

(deftest start-turn-honors-client-minted-external-ids-test
  (testing "start-turn! persists the turn's rows under client-supplied external ids"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))
            user-id         (str (random-uuid))
            assistant-id    (str (random-uuid))]
        (is (=? {:user-external-id      user-id
                 :assistant-external-id assistant-id}
                (metabot-persistence/start-turn!
                 conversation-id "internal" {:role "user" :content "hi"}
                 :user-external-id user-id
                 :assistant-external-id assistant-id)))
        (is (= {:user user-id :assistant assistant-id}
               (t2/select-fn->fn :role :external_id :model/MetabotMessage
                                 :conversation_id conversation-id)))))))

(deftest retry-turn-honors-client-minted-external-id-test
  (testing "retry-turn! inserts the fresh placeholder under a client-supplied external id"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))
            {a-pk :assistant-msg-id} (metabot-persistence/start-turn!
                                      conversation-id "internal" {:role "user" :content "hi"})
            _        (metabot-persistence/finalize-assistant-turn!
                      a-pk [{:type :text :text "reply"}])
            user-ext (t2/select-one-fn :external_id :model/MetabotMessage
                                       :conversation_id conversation-id :role "user")
            retry-id (str (random-uuid))]
        (is (= retry-id
               (:assistant-external-id
                (metabot-persistence/retry-turn! conversation-id "internal" user-ext
                                                 :assistant-external-id retry-id))))
        (is (= retry-id (metabot-persistence/leaf-external-id conversation-id)))))))

(deftest start-turn-taken-external-id-trips-unique-constraint-test
  (testing "a taken client-supplied external id trips uq_metabot_message_external_id —
            the violation the API layer translates into a 409"
    (with-rasta-tx
      (letfn [(conflict? [thunk]
                (try
                  (thunk)
                  false
                  (catch Exception e
                    (boolean (some #(re-find #"(?i)uq_metabot_message_external_id" (str (ex-message %)))
                                   (u/full-exception-chain e))))))]
        (let [conversation-id (str (random-uuid))
              {:keys [assistant-msg-id assistant-external-id user-external-id]}
              (metabot-persistence/start-turn!
               conversation-id "internal" {:role "user" :content "hi"})]
          (is (true? (conflict? #(metabot-persistence/start-turn!
                                  conversation-id "internal" {:role "user" :content "again"}
                                  :user-external-id user-external-id))))
          (testing "soft-deleted rows keep their ids reserved"
            (metabot-persistence/soft-delete-messages! {:id assistant-msg-id} (mt/user->id :rasta))
            (is (true? (conflict? #(metabot-persistence/start-turn!
                                    conversation-id "internal" {:role "user" :content "again"}
                                    :assistant-external-id assistant-external-id))))))))))

(deftest retry-turn-test
  (testing "retry-turn! soft-deletes the old response, keeps the prompt, and inserts a fresh placeholder"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{a-pk :assistant-msg-id} (metabot-persistence/start-turn!
                                          conversation-id "internal"
                                          {:role "user" :content "hi"})
                _        (metabot-persistence/finalize-assistant-turn!
                          a-pk [{:type :text :text "reply"}])
                user-ext (t2/select-one-fn :external_id :model/MetabotMessage
                                           :conversation_id conversation-id :role "user")
                {:keys [assistant-msg-id assistant-external-id user-external-id]}
                (metabot-persistence/retry-turn! conversation-id "internal" user-ext
                                                 :delete-message-ids [a-pk])]
            (is (pos-int? assistant-msg-id))
            (is (string? assistant-external-id))
            (is (= user-ext user-external-id))
            (testing "old response is soft-deleted with the deleting user stamped"
              (is (=? {:deleted_at some? :deleted_by_user_id (mt/user->id :rasta)}
                      (t2/select-one :model/MetabotMessage a-pk))))
            (testing "prompt row stays live"
              (is (=? {:deleted_at nil}
                      (t2/select-one :model/MetabotMessage :external_id user-ext))))
            (testing "fresh placeholder is the new leaf"
              (is (=? {:finished nil :data [] :deleted_at nil}
                      (t2/select-one :model/MetabotMessage assistant-msg-id)))
              (is (= assistant-external-id
                     (metabot-persistence/leaf-external-id conversation-id))))
            (testing "conversation-detail shows the prompt exactly once"
              (metabot-persistence/finalize-assistant-turn!
               assistant-msg-id [{:type :text :text "retried reply"}])
              (let [messages (:messages (metabot-persistence/conversation-detail conversation-id))]
                (is (= ["hi" "retried reply"] (map :message messages)))))))))))

(deftest retry-turn-deletes-all-trailing-assistant-rows-test
  (testing "retry-turn! soft-deletes every live assistant row after the retried prompt"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{a-pk :assistant-msg-id} (metabot-persistence/start-turn!
                                          conversation-id "internal"
                                          {:role "user" :content "hi"})
                _        (metabot-persistence/finalize-assistant-turn!
                          a-pk [{:type :text :text "reply"}])
                extra-pk (t2/insert-returning-pk!
                          :model/MetabotMessage
                          {:conversation_id conversation-id
                           :role            "assistant"
                           :profile_id      "internal"
                           :external_id     (str (random-uuid))
                           :total_tokens    0
                           :data            [{:type "text" :text "extra"}]
                           :data_version    2
                           :finished        true
                           :created_at      (t/plus (t/offset-date-time) (t/seconds 60))})
                user-ext (t2/select-one-fn :external_id :model/MetabotMessage
                                           :conversation_id conversation-id :role "user")]
            (metabot-persistence/retry-turn! conversation-id "internal" user-ext
                                             :delete-message-ids [a-pk extra-pk])
            (is (some? (t2/select-one-fn :deleted_at :model/MetabotMessage a-pk)))
            (is (some? (t2/select-one-fn :deleted_at :model/MetabotMessage extra-pk)))))))))

(deftest start-turn-delete-message-ids-test
  (testing "start-turn! soft-deletes :delete-message-ids alongside inserting the replacement rows"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{a-pk :assistant-msg-id} (metabot-persistence/start-turn!
                                          conversation-id "internal"
                                          {:role "user" :content "fails"})
                _    (metabot-persistence/finalize-assistant-turn!
                      a-pk []
                      :error {:message "boom"})
                u-pk (t2/select-one-fn :id :model/MetabotMessage
                                       :conversation_id conversation-id :role "user")]
            (metabot-persistence/start-turn!
             conversation-id "internal" {:role "user" :content "replacement"}
             :delete-message-ids [u-pk a-pk])
            (let [rows (t2/select :model/MetabotMessage :conversation_id conversation-id
                                  {:order-by [[:created_at :asc] [:id :asc]]})
                  live (remove :deleted_at rows)]
              (is (= [:user :assistant] (mapv :role live)))
              (is (= "replacement" (-> live first :data first :text)))
              (is (= [(mt/user->id :rasta) (mt/user->id :rasta)]
                     (map :deleted_by_user_id (filter :deleted_at rows)))))))))))

(deftest retry-turn-without-live-response-test
  (testing "retry-turn! with no live trailing assistant only inserts a fresh placeholder"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{a-pk :assistant-msg-id user-ext :user-external-id}
                (metabot-persistence/start-turn! conversation-id "internal" {:role "user" :content "hi"})
                _ (metabot-persistence/soft-delete-messages! {:id a-pk} (mt/user->id :rasta))
                {:keys [assistant-external-id]}
                (metabot-persistence/retry-turn! conversation-id "internal" user-ext)
                rows (t2/select :model/MetabotMessage :conversation_id conversation-id)]
            (is (= [a-pk] (map :id (filter :deleted_at rows)))
                "retry soft-deleted nothing new")
            (is (= assistant-external-id
                   (metabot-persistence/leaf-external-id conversation-id)))))))))

(deftest message->chat-messages-annotates-agent-row-test
  (testing "empty :data on errored row emits a stub agent message so the FE can render the alert"
    (is (=? [{:id "ext-1" :role "agent" :type "text" :message ""
              :finished true :error {:message "boom"} :externalId "ext-1"}]
            (metabot-persistence/message->chat-messages
             {:role :assistant :error (json/encode {:message "boom"}) :finished true :data []
              :external_id "ext-1"}))))
  (testing "empty :data on aborted row also gets a stub"
    (is (=? [{:role "agent" :type "text" :message "" :finished false}]
            (metabot-persistence/message->chat-messages
             {:role :assistant :finished false :data []}))))
  (testing "empty :data on healthy row produces no messages"
    (is (= [] (metabot-persistence/message->chat-messages
               {:role :assistant :finished true :data []}))))
  (testing "agent message gets :finished true and no :error by default"
    (let [[msg] (metabot-persistence/message->chat-messages
                 {:role :assistant :data [{:type "text" :text "ok"}]})]
      (is (=? {:finished true} msg))
      (is (not (contains? msg :error)))))
  (testing "agent message inherits :finished false from parent row"
    (is (=? [{:finished false}]
            (metabot-persistence/message->chat-messages
             {:role :assistant :finished false
              :data [{:type "text" :text "interrupted"}]}))))
  (testing "agent message inherits JSON-decoded :error from parent row"
    (is (=? [{:error {:message "boom" :type "RuntimeException"}}]
            (metabot-persistence/message->chat-messages
             {:role :assistant :finished true
              :error (json/encode {:message "boom" :type "RuntimeException"})
              :data [{:type "text" :text "partial"}]}))))
  (testing "non-JSON :error column values fall through unchanged"
    (is (=? [{:error "raw legacy text"}]
            (metabot-persistence/message->chat-messages
             {:role :assistant :finished true :error "raw legacy text"
              :data [{:type "text" :text "partial"}]}))))
  (testing "user messages do not receive agent-only status fields"
    (let [[msg] (metabot-persistence/message->chat-messages
                 {:role :user :data [{:type "text" :text "hi"}]})]
      (is (not-any? #(contains? msg %) [:finished :error]))))
  (testing "multi-block assistant row: only the last agent message is annotated"
    (let [result     (metabot-persistence/message->chat-messages
                      {:role :assistant :finished false
                       :error (json/encode {:message "boom"})
                       :data [{:type "text" :text "first"}
                              {:type "tool-search" :toolCallId "call-1" :state "input-available" :input nil}
                              {:type "text" :text "last"}]})
          annotated? #(or (contains? % :finished) (contains? % :error))]
      (is (=? [{:message "first"}
               {:type "tool_call" :name "search"}
               {:message "last" :finished false :error {:message "boom"}}]
              result))
      (is (= [false false true] (mapv annotated? result))))))

(deftest messages->chat-messages-errored-pairs-test
  (testing "by default, errored assistant rows and the preceding user prompt are dropped"
    (is (= ["first" "first reply" "third" "third reply"]
           (mapv :message
                 (metabot-persistence/messages->chat-messages
                  [{:role :user      :data [{:type "text" :text "first"}]}
                   {:role :assistant :data [{:type "text" :text "first reply"}]}
                   {:role :user      :data [{:type "text" :text "broken"}]}
                   {:role :assistant :error (json/encode {:message "boom"}) :data []}
                   {:role :user      :data [{:type "text" :text "third"}]}
                   {:role :assistant :data [{:type "text" :text "third reply"}]}])))))
  (testing "with :include-errored? true, errored pairs stay and :error surfaces on the agent message"
    (let [result (metabot-persistence/messages->chat-messages
                  [{:role :user      :data [{:type "text" :text "broken"}]}
                   {:role :assistant :error (json/encode {:message "boom"}) :finished true
                    :data [{:type "text" :text "partial"}]}
                   {:role :user      :data [{:type "text" :text "ok"}]}
                   {:role :assistant :data [{:type "text" :text "fine"}]}]
                  {:include-errored? true})]
      (is (= ["broken" "partial" "ok" "fine"] (mapv :message result)))
      (is (= [nil {:message "boom"} nil nil] (mapv :error result))))))

(defn- start-and-finalize!
  "Run start-turn! then finalize-assistant-turn! with a one-text-part body (as :rasta).
  Returns `[asst-row chat-msg]`."
  [& finalize-opts]
  (let [conversation-id (str (random-uuid))]
    (mt/with-current-user (mt/user->id :rasta)
      (let [{:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                        conversation-id "metabot-1"
                                        {:role "user" :content "go"})]
        (apply metabot-persistence/finalize-assistant-turn!
               assistant-msg-id
               [{:type :text :text "x"}]
               finalize-opts)
        (let [row (t2/select-one :model/MetabotMessage assistant-msg-id)]
          [row (first (metabot-persistence/message->chat-messages row))])))))

(deftest throwable->error-payload-test
  (testing "matches the streamed :error part shape produced by the agent loop's
            own catch (agent/core/error-part), so a thrown turn and a streamed
            :error turn render identically through the FE."
    (testing "ExceptionInfo with ex-data carries :message, :type, :data"
      (is (= {:message "boom" :type "clojure.lang.ExceptionInfo" :data {:status 503}}
             (metabot-persistence/throwable->error-payload
              (ex-info "boom" {:status 503})))))
    (testing "throwable without a message falls back to .toString so :message is never blank"
      (let [payload (metabot-persistence/throwable->error-payload (NullPointerException.))]
        (is (= "java.lang.NullPointerException" (:type payload)))
        (is (string? (:message payload)))
        (is (seq (:message payload)))))
    (testing "empty ex-data is omitted (no spurious :data key)"
      (is (not (contains? (metabot-persistence/throwable->error-payload (ex-info "x" {}))
                          :data))))
    (testing "non-ExceptionInfo throwables carry no :data"
      (is (not (contains? (metabot-persistence/throwable->error-payload (RuntimeException. "oops"))
                          :data))))))

(deftest safe-encode-error-falls-back-when-encode-throws-test
  (testing "If json/encode throws (e.g. an Object fallback encoder isn't loaded
            in some early-init context), the error payload is re-encoded with
            :data downgraded to pr-str so the row's error column is still
            valid JSON. Without this, an unusual ex-data value would fail the
            whole UPDATE and the row would stay with error=nil — looking like
            a clean success."
    (let [real-encode json/encode
          ;; Simulate an encoder that chokes on a specific marker value, but
          ;; otherwise behaves normally — so the fallback's *second* encode call
          ;; (with :data swapped for pr-str) still succeeds.
          fail-encode (fn fail-encode
                        ([v] (fail-encode v nil))
                        ([v opts]
                         (if (and (map? v)
                                  (= ::poison (some-> v :data :marker)))
                           (throw (ex-info "simulated encoder failure" {}))
                           (if opts (real-encode v opts) (real-encode v)))))]
      (with-redefs [json/encode fail-encode]
        (let [encoded (#'metabot-persistence/safe-encode-error
                       {:message "wrapper"
                        :type    "java.lang.RuntimeException"
                        :data    {:marker ::poison :other "x"}})
              decoded (json/decode+kw encoded)]
          (is (= "wrapper" (:message decoded))
              "top-level message survives the fallback")
          (is (= "java.lang.RuntimeException" (:type decoded))
              "top-level type survives the fallback")
          (is (string? (:data decoded))
              ":data is downgraded to a pr-str string")
          (is (re-find #":marker" (:data decoded))
              "stringified :data still carries enough info for triage"))))))

(deftest finalize-assistant-turn-persists-finished-and-error-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (testing "default: finished true, no error"
      (let [[row] (start-and-finalize!)]
        (is (=? {:finished true :error nil} row))))
    (testing "aborted: finished false flows through, no error"
      (let [[row] (start-and-finalize! :finished? false)]
        (is (=? {:finished false :error nil} row))))
    (testing "errored map: JSON-encoded into column, decoded onto chat msg; partial parts persisted"
      (let [error-data     {:message "agent loop API error: 503"
                            :type    "java.lang.RuntimeException"
                            :data    {:status 503}}
            [row chat-msg] (start-and-finalize! :error error-data)]
        (is (=? {:finished true :error string? :data seq} row))
        (is (= error-data (json/decode+kw (:error row))))
        (is (= error-data (:error chat-msg)))))
    (testing "errored string: any JSON-serializable value accepted"
      (let [[row chat-msg] (start-and-finalize! :error "boom")]
        (is (= "\"boom\"" (:error row)))
        (is (= "boom" (:error chat-msg)))))))

(deftest finalize-persists-streamed-error-text-part-to-error-column-test
  ;; Regression guard: before the `aisdk-chunks->part` fix the error chunk passed through unchanged, so the
  ;; part carried `:errorText` (not `:error`); api.clj's `(:error (u/seek ...))` extraction then returned nil
  ;; and the error column silently stayed NULL — an errored turn looked like a success in the appdb.
  (testing "a streamed AI SDK v5 :errorText part lands in the assistant row's error column as a {:message ...} map"
    (with-rasta-tx
      (let [conversation-id            (str (random-uuid))
            {:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                        conversation-id "internal"
                                        {:role "user" :content "go"})
            ;; Provider adapters emit AI SDK v5 chunks; `aisdk-xf` collects them into the parts
            ;; vector that feeds finalize in `metabase.metabot.api`.
            parts                      (into [] (self.core/aisdk-xf)
                                             [{:type :start :messageId "m1"}
                                              {:type      :error
                                               :errorText "The model provider failed to complete the response"}])
            error-data                 (:error (u/seek #(= :error (:type %)) parts))]
        (is (= {:message "The model provider failed to complete the response"} error-data)
            "the error part carries an :error map (not a passed-through :errorText), so api.clj's extraction is non-nil")
        (metabot-persistence/finalize-assistant-turn!
         assistant-msg-id parts
         :error error-data)
        (let [row (t2/select-one :model/MetabotMessage assistant-msg-id)]
          (is (= {:message "The model provider failed to complete the response"}
                 (json/decode+kw (:error row)))
              "the streamed errorText is persisted into the error column as a {:message ...} map")
          (is (true? (:finished row))
              "an errored turn still finalizes as finished"))))))

(deftest messages-chat-messages-in-flight-placeholders-test
  (testing "in-flight placeholders (assistant role, finished=nil, recent created_at)
            become a trailing turn_in_progress message, so a resumed mid-stream read
            renders a 'Response in progress…' row"
    (let [recent      (java.time.OffsetDateTime/now)
          ;; Comfortably outside the grace window so the test isn't sensitive
          ;; to the exact value of `placeholder-grace-period-ms`.
          stale       (.minusHours recent 2)
          placeholder {:role :assistant :data [] :finished nil :error nil :created_at recent}
          stale-stub  {:role :assistant :data [] :finished nil :error nil :created_at stale}
          user-msg    {:role :user :data [{:type "text" :text "hi"}]}
          done-asst   {:role :assistant :data [{:type "text" :text "done"}] :finished true}]
      (testing "in-flight placeholder renders as turn_in_progress; surrounding messages still render"
        (let [out (metabot-persistence/messages->chat-messages [user-msg done-asst placeholder])]
          (is (= ["hi" "done" nil] (mapv :message out)))
          (is (= ["text" "text" "turn_in_progress"] (mapv :type out)))))
      (testing "stale placeholder (older than grace window) still renders as the aborted-turn stub"
        (let [out (metabot-persistence/messages->chat-messages [user-msg stale-stub])]
          (is (= 2 (count out)))
          (is (=? [{:message "hi"} {:type "text" :message "" :finished false}] out))))
      (testing "row with :error set is treated as errored (not in-flight) — the errored pair is dropped from default reads but visible to the audit path"
        (let [errored {:role :assistant :data [] :finished true
                       :error (json/encode {:message "boom"})
                       :created_at recent}]
          (is (= []
                 (metabot-persistence/messages->chat-messages
                  [user-msg errored] {:include-errored? false}))
              "default read drops the errored row AND the preceding user prompt")
          (is (= ["hi" ""]
                 (mapv :message (metabot-persistence/messages->chat-messages
                                 [user-msg errored] {:include-errored? true})))
              "audit read keeps both rows; the empty-data stub renders so the FE has somewhere to hang the error alert"))))))

;;; ---------------------------------------- used-table recording ----------------------------------------

(defn- ->notebook-parts
  "Build a minimal `construct_notebook_query` tool-input/output pair whose query references the given table id."
  [call-id source-table-id]
  (let [mp    (mt/metadata-provider)
        query (lib/query mp (lib.metadata/table mp source-table-id))]
    [{:type      :tool-input
      :id        call-id
      :function  "construct_notebook_query"
      :arguments {:reasoning "x"}}
     {:type   :tool-output
      :id     call-id
      :result {:output            "<result>...</result>"
               :structured-output {:query-id "qid"
                                   :query    query}}}]))

(deftest finalize-records-used-tables-test
  (testing "finalize-assistant-turn! inserts metabot_used_table rows for successful query-generating tool calls"
    (with-rasta-tx
      (let [table-id                   (mt/id :orders)
            conversation-id            (str (random-uuid))
            {:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                        conversation-id
                                        "internal"
                                        {:role "user" :content "go"})]
        (binding [used-tables/*run-synchronously?* true]
          (metabot-persistence/finalize-assistant-turn!
           assistant-msg-id
           (into [{:type :text :text "ok"}] (->notebook-parts "c1" table-id))))
        (is (=? [{:message_id assistant-msg-id
                  :table_id table-id}]
                (t2/select :model/MetabotUsedTable :message_id assistant-msg-id)))))))

(deftest finalize-records-used-tables-in-background-test
  (testing "with the default (non-synchronous) path, finalize-assistant-turn! eventually records used tables on the background worker"
    ;; No rollback transaction and no `*run-synchronously?*` binding: the extraction + insert run on
    ;; the background executor (its own connection), so we commit real rows and clean up in `finally`.
    (mt/with-current-user (mt/user->id :rasta)
      (let [table-id                   (mt/id :orders)
            conversation-id            (str (random-uuid))
            {:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                        conversation-id
                                        "internal"
                                        {:role "user" :content "go"})]
        (try
          (metabot-persistence/finalize-assistant-turn!
           assistant-msg-id
           (into [{:type :text :text "ok"}] (->notebook-parts "c1" table-id)))
          (is (=? [{:message_id assistant-msg-id
                    :table_id   table-id}]
                  (tu/poll-until 5000
                                 (seq (t2/select :model/MetabotUsedTable :message_id assistant-msg-id)))))
          (finally
            ;; CASCADE from metabot_message cleans up the used-table row.
            (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(defn- ->transform-python-parts
  "Build a `write_transform_python` tool-input/output pair that declares `table-id` as its single source table.
  Used to verify the end-to-end transform extraction path."
  [call-id table-id]
  [{:type      :tool-input
    :id        call-id
    :function  "write_transform_python"
    :arguments {:transform_name "T"
                :edit_action    {:mode        "replace"
                                 :new_content "def transform(): pass"}
                :source_tables  [{:alias       "t"
                                  :table_id    table-id
                                  :schema      "PUBLIC"
                                  :database_id (mt/id)}]}}
   {:type   :tool-output
    :id     call-id
    :result {:output            "ok"
             :structured-output {:transform {:source {:type "python"}}
                                 :thinking  "x"
                                 :message   "Transform Python updated successfully."}}}])

(defn- ->transform-sql-parts
  "Build a `write_transform_sql` tool-input/output pair whose suggested transform's `[:source :query]` is a native query.
  The structured-output's `:transform` key is dropped by the storable conversion, so this pair exercises finalize's
  raw-parts extraction path."
  [call-id db-id sql]
  (let [query (lib/native-query (mt/metadata-provider) sql)]
    [{:type      :tool-input
      :id        call-id
      :function  "write_transform_sql"
      :arguments {:database_id db-id
                  :edit_action {:mode "replace" :new_content sql}}}
     {:type   :tool-output
      :id     call-id
      :result {:output "ok"
               :structured-output
               {:transform {:id          nil
                            :name        "T"
                            :description ""
                            :target      {:type "table" :name "" :database db-id :schema nil}
                            :source      {:type  "query"
                                          :query query}}
                :thinking  "x"
                :message   "Transform SQL updated successfully."}}}]))

(deftest finalize-records-used-tables-for-python-transform-test
  (testing "finalize-assistant-turn! records `metabot_used_table` rows for a write_transform_python tool call."
    (with-rasta-tx
      (let [table-id                   (mt/id :orders)
            conversation-id            (str (random-uuid))
            {:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                        conversation-id
                                        "transforms_codegen"
                                        {:role "user" :content "make a transform"})]
        (binding [used-tables/*run-synchronously?* true]
          (metabot-persistence/finalize-assistant-turn!
           assistant-msg-id
           (into [{:type :text :text "ok"}] (->transform-python-parts "t1" table-id))))
        (is (=? [{:message_id assistant-msg-id
                  :table_id   table-id}]
                (t2/select :model/MetabotUsedTable :message_id assistant-msg-id)))))))

(deftest finalize-records-used-tables-for-sql-transform-test
  (testing "finalize-assistant-turn! parses the SQL transform's native query."
    (with-rasta-tx
      (let [orders-id                  (mt/id :orders)
            conversation-id            (str (random-uuid))
            {:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                        conversation-id
                                        "transforms_codegen"
                                        {:role "user" :content "make a SQL transform"})]
        (binding [used-tables/*run-synchronously?* true]
          (mt/with-dynamic-fn-redefs [nqa/tables-for-native (fn [_ & _] {:tables [{:table-id orders-id}]})]
            (metabot-persistence/finalize-assistant-turn!
             assistant-msg-id
             (into [{:type :text :text "ok"}]
                   (->transform-sql-parts "t1" (mt/id) "SELECT * FROM orders")))))
        (is (=? [{:message_id assistant-msg-id :table_id orders-id}]
                (t2/select :model/MetabotUsedTable :message_id assistant-msg-id)))))))

(deftest finalize-records-nothing-without-query-tools-test
  (testing "finalize-assistant-turn! inserts no used-table rows for text-only or non-query tool turns"
    (with-rasta-tx
      (let [conversation-id            (str (random-uuid))
            {:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                        conversation-id
                                        "internal"
                                        {:role "user" :content "go"})]
        (binding [used-tables/*run-synchronously?* true]
          (metabot-persistence/finalize-assistant-turn!
           assistant-msg-id
           [{:type      :text
             :text      "just text"}
            {:type      :tool-input
             :id        "n1"
             :function  "navigate_user"
             :arguments {}}
            {:type      :tool-output
             :id        "n1"
             :result    {:output "ok"}}]))
        (is (zero? (t2/count :model/MetabotUsedTable :message_id assistant-msg-id)))))))

(deftest insert-failure-does-not-fail-finalize-test
  (testing "a failed used-table INSERT is logged and finalize still completes"
    (with-rasta-tx
      (let [conversation-id            (str (random-uuid))
            {:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                        conversation-id
                                        "internal"
                                        {:role "user" :content "go"})]
        (with-redefs [used-tables/extract-used-tables-with-timing! (fn [_ _]
                                                                     [{:message_id assistant-msg-id :table_id 1}])
                      t2/insert! (fn [& _]
                                   (throw (ex-info "boom" {})))]
          (log.capture/with-log-messages-for-level [logs [metabase.metabot.used-tables :warn]]
            (binding [used-tables/*run-synchronously?* true]
              (metabot-persistence/finalize-assistant-turn!
               assistant-msg-id
               [{:type :text :text "ok"}]))
            (is (=? {:finished true
                     :data     [{:type "text" :text "ok"}]}
                    (t2/select-one :model/MetabotMessage assistant-msg-id))
                "message UPDATE still landed")
            (is (some #(re-find #"Failed to record metabot used tables" (:message %)) (logs))
                "warn line captured")))))))

(defn- seed-turn!
  "Start a user turn and finalize its assistant reply with `parts`. Returns the
  assistant placeholder pk."
  [conversation-id prompt parts & finalize-opts]
  (let [{:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                    conversation-id "internal" {:role "user" :content prompt})]
    (apply metabot-persistence/finalize-assistant-turn!
           assistant-msg-id parts finalize-opts)
    assistant-msg-id))

(deftest history-empty-conversation-test
  (testing "a conversation with no live messages reconstructs to an empty history"
    (is (= [] (metabot-persistence/history (metabot-persistence/live-messages (str (random-uuid))))))))

(deftest history-multi-turn-ordering-test
  (testing "successful turns reconstruct as alternating user/assistant messages in order"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))]
        (seed-turn! conversation-id "first" [{:type :text :text "reply one"}])
        (seed-turn! conversation-id "second" [{:type :text :text "reply two"}])
        (is (= [{:role :user :content "first"}
                {:role :assistant :content "reply one"}
                {:role :user :content "second"}
                {:role :assistant :content "reply two"}]
               (metabot-persistence/history (metabot-persistence/live-messages conversation-id))))))))

(deftest history-tool-call-conversion-test
  (testing "text and tool parts interleave; tool calls become an assistant call + tool result pair"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))]
        (seed-turn! conversation-id "look it up"
                    [{:type :text :text "on it"}
                     {:type :tool-input :id "c1" :function "search" :arguments {:q "x"}}
                     {:type :tool-output :id "c1" :result {:output "rows" :structured-output {:query-id "q"}}}])
        (let [history (metabot-persistence/history (metabot-persistence/live-messages conversation-id))]
          (is (mr/validate ::metabot.schema/messages history)
              "reconstructed history validates against the LLM message schema")
          (is (= [{:role :user :content "look it up"}
                  {:role :assistant :content "on it"}
                  {:role :assistant :tool_calls [{:id "c1" :name "search" :arguments (json/encode {:q "x"})}]}
                  {:role :tool :tool_call_id "c1" :content "rows"}]
                 history)))))))

(deftest history-tool-output-shapes-test
  (testing "bare-scalar, nil, and errored tool outputs each coerce to a string tool result"
    (with-rasta-tx
      (let [tool-content (fn [parts]
                           (let [conversation-id (str (random-uuid))]
                             (seed-turn! conversation-id "go" parts)
                             (->> (metabot-persistence/history (metabot-persistence/live-messages conversation-id))
                                  (filter #(= :tool (:role %)))
                                  first
                                  :content)))]
        (testing "bare scalar output is stringified"
          (is (= "just a string"
                 (tool-content [{:type :tool-input :id "c1" :function "search" :arguments {}}
                                {:type :tool-output :id "c1" :result "just a string"}]))))
        (testing "nil output becomes an empty string"
          (is (= ""
                 (tool-content [{:type :tool-input :id "c1" :function "search" :arguments {}}
                                {:type :tool-output :id "c1" :result nil}]))))
        (testing "errored tool output uses the error text"
          (is (= "kaboom"
                 (tool-content [{:type :tool-input :id "c1" :function "search" :arguments {}}
                                {:type :tool-output :id "c1" :error {:message "kaboom"}}]))))))))

(deftest history-drops-errored-turn-test
  (testing "a turn whose reply errored is dropped whole; surrounding turns survive"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))]
        (seed-turn! conversation-id "before" [{:type :text :text "ok before"}])
        (seed-turn! conversation-id "boom" [] :error {:message "kaboom"})
        (seed-turn! conversation-id "after" [{:type :text :text "ok after"}])
        (is (= [{:role :user :content "before"}
                {:role :assistant :content "ok before"}
                {:role :user :content "after"}
                {:role :assistant :content "ok after"}]
               (metabot-persistence/history (metabot-persistence/live-messages conversation-id))))))))

(deftest history-drops-unfinished-turn-test
  (testing "an in-flight placeholder (finished nil) drops its whole turn — this is how the current turn is excluded"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))]
        (seed-turn! conversation-id "done" [{:type :text :text "answered"}])
        ;; start-turn! leaves a nil-finished placeholder, like the in-flight turn
        (metabot-persistence/start-turn! conversation-id "internal" {:role "user" :content "pending"})
        (is (= [{:role :user :content "done"}
                {:role :assistant :content "answered"}]
               (metabot-persistence/history (metabot-persistence/live-messages conversation-id))))))))

(deftest history-keeps-aborted-turn-with-synthetic-interrupt-test
  (testing "an aborted turn replays its partial text and pairs an unresolved tool call with a synthetic interrupt"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))]
        (seed-turn! conversation-id "start something"
                    [{:type :text :text "let me check"}
                     {:type :tool-input :id "c1" :function "search" :arguments {:q "x"}}]
                    :finished? false)
        (is (= [{:role :user :content "start something"}
                {:role :assistant :content "let me check"}
                {:role :assistant :tool_calls [{:id "c1" :name "search" :arguments (json/encode {:q "x"})}]}
                {:role :tool :tool_call_id "c1" :content "Tool execution interrupted by user"}]
               (metabot-persistence/history (metabot-persistence/live-messages conversation-id))))))))

(deftest history-excludes-superseded-retry-response-test
  (testing "after a retry the soft-deleted old reply is excluded; the prompt appears once with the new reply"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))]
        (seed-turn! conversation-id "question" [{:type :text :text "old answer"}])
        (let [user-ext (t2/select-one-fn :external_id :model/MetabotMessage
                                         :conversation_id conversation-id :role "user")
              {:keys [assistant-msg-id]} (metabot-persistence/retry-turn!
                                          conversation-id "internal" user-ext)]
          (testing "before finalize, only prior (pre-retry-prompt) turns are present"
            (is (= [] (metabot-persistence/history (metabot-persistence/live-messages conversation-id)))))
          (metabot-persistence/finalize-assistant-turn!
           assistant-msg-id [{:type :text :text "new answer"}])
          (is (= [{:role :user :content "question"}
                  {:role :assistant :content "new answer"}]
                 (metabot-persistence/history (metabot-persistence/live-messages conversation-id)))))))))

(deftest history-last-live-assistant-row-wins-test
  (testing "when a turn has multiple live assistant rows, only the last is replayed"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))]
        (seed-turn! conversation-id "hi" [{:type :text :text "first reply"}])
        (t2/insert! :model/MetabotMessage
                    {:conversation_id conversation-id
                     :role            "assistant"
                     :profile_id      "internal"
                     :external_id     (str (random-uuid))
                     :total_tokens    0
                     :data            [{:type "text" :text "second reply"}]
                     :data_version    2
                     :finished        true
                     :created_at      (t/plus (t/offset-date-time) (t/seconds 60))})
        (is (= [{:role :user :content "hi"}
                {:role :assistant :content "second reply"}]
               (metabot-persistence/history (metabot-persistence/live-messages conversation-id))))))))

(deftest history-skips-data-parts-test
  (testing "data parts in an assistant reply are not leaked into LLM history"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))]
        (seed-turn! conversation-id "hi"
                    [{:type :text :text "before"}
                     {:type :data :data-type "navigate_to" :data "/question/1"}
                     {:type :text :text "after"}])
        (is (= [{:role :user :content "hi"}
                {:role :assistant :content "before"}
                {:role :assistant :content "after"}]
               (metabot-persistence/history (metabot-persistence/live-messages conversation-id))))))))

(deftest ^:parallel conversation-state-merges-message-states-test
  (testing "merges live assistant rows' :state in order — maps merge, other values take the latest"
    (is (= {:queries {:q1 {:database 1} :q2 {:database 2}}
            :todos   [{:id "b"}]}
           (metabot-persistence/conversation-state
            [{:role :assistant :finished true :state {:queries {:q1 {:database 1}} :todos [{:id "a"}]}}
             {:role :user}
             {:role :assistant :finished true :state {:queries {:q2 {:database 2}} :todos [{:id "b"}]}}]))))
  (testing "user rows and rows without state are ignored; empty input reconstructs to {}"
    (is (= {} (metabot-persistence/conversation-state [])))
    (is (= {} (metabot-persistence/conversation-state
               [{:role :user :state {:queries {:q1 {:database 1}}}}
                {:role :assistant :finished true}]))))
  (testing "errored and in-flight turns are skipped, so their state never leaks into the baseline"
    (is (= {:todos [{:id "keep"}]}
           (metabot-persistence/conversation-state
            [{:role :assistant :finished true :error "boom" :state {:todos [{:id "errored"}]}}
             {:role :assistant :finished nil :state {:todos [{:id "in-flight"}]}}
             {:role :assistant :finished true :state {:todos [{:id "keep"}]}}])))))

(deftest finalize-writes-turn-state-test
  (testing "finalize records the turn-state on the row; nothing writes to the conversation"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))
            msg-id (seed-turn! conversation-id "hi"
                               [{:type :text :text "reply"}]
                               :turn-state {:queries {"q2" {:database 2}}})]
        (is (= {:queries {:q2 {:database 2}}}
               (t2/select-one-fn :state :model/MetabotMessage msg-id)))
        (is (nil? (t2/select-one-fn :state :model/MetabotConversation :id conversation-id)))))))

(deftest finalize-skips-empty-turn-state-test
  (testing "a turn that produced no state leaves the row's state NULL"
    (with-rasta-tx
      (doseq [turn-opts [[] [:turn-state {}]]]
        (let [conversation-id (str (random-uuid))
              msg-id (apply seed-turn! conversation-id "hi" [{:type :text :text "reply"}] turn-opts)]
          (is (nil? (t2/select-one-fn :state :model/MetabotMessage msg-id))))))))

(deftest conversation-state-rewinds-on-retry-test
  (testing "a retried turn's soft-deleted state drops out of the reconstruction"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))
            cstate #(metabot-persistence/conversation-state
                     (metabot-persistence/live-messages conversation-id))]
        (seed-turn! conversation-id "one" [] :turn-state {:todos [{:id "a"}]})
        (let [two-pk (seed-turn! conversation-id "two" [] :turn-state {:todos [{:id "b"}]})]
          (is (= {:todos [{:id "b"}]} (cstate)))
          (let [user-ext (t2/select-one-fn :external_id :model/MetabotMessage
                                           :conversation_id conversation-id
                                           :role "user"
                                           {:order-by [[:created_at :desc] [:id :desc]]})]
            (metabot-persistence/retry-turn! conversation-id "internal" user-ext
                                             :delete-message-ids [two-pk])
            (is (= {:todos [{:id "a"}]} (cstate))
                "the in-flight retry placeholder contributes nothing and the superseded turn is gone")))))))

(deftest conversation-detail-includes-state-test
  (testing "conversation-detail returns the reconstructed state"
    (with-rasta-tx
      (let [conversation-id (str (random-uuid))]
        (seed-turn! conversation-id "one" [{:type :text :text "reply"}]
                    :turn-state {:todos [{:id "a"}]})
        (is (= {:todos [{:id "a"}]}
               (:state (metabot-persistence/conversation-detail conversation-id))))))))
