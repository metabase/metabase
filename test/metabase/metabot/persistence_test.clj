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

(deftest start-turn-persists-slack-conversation-metadata-test
  (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
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

(deftest start-turn-persists-slack-metadata-on-rows-test
  (testing "start-turn! lands slack-team-id / channel-id / slack-thread-ts on the conversation row,
            and slack-msg-id / channel-id / user-id on the user message row, plus user-id on the
            assistant placeholder row"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
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
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
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
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
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
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                            conversation-id "internal"
                                            {:role "user" :content "hi"})
                created-at-before          (:created_at (t2/select-one :model/MetabotMessage assistant-msg-id))
                _                          (metabot-persistence/finalize-assistant-turn!
                                            conversation-id assistant-msg-id
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
            (is (= [{:type "text" :text "Hello"}] (:data row)))
            (is (= 15 (:total_tokens row)))))))))

(deftest finalize-assistant-turn-passes-through-aborted-and-errored-test
  (testing "finalize-assistant-turn! preserves :finished? false and JSON-encodes :error"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (mt/with-current-user (mt/user->id :rasta)
        (testing "aborted: finished false flows through"
          (let [conversation-id (str (random-uuid))
                {:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                            conversation-id "internal"
                                            {:role "user" :content "go"})]
            (metabot-persistence/finalize-assistant-turn!
             conversation-id assistant-msg-id
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
             conversation-id assistant-msg-id []
             :error error-data)
            (let [row (t2/select-one :model/MetabotMessage assistant-msg-id)]
              (is (true? (:finished row)))
              (is (= error-data (json/decode+kw (:error row)))))))))))

(deftest start-turn-pins-ordering-under-abort-then-retry-test
  (testing "an aborted turn whose finalize fires after a retry still sorts before the retry's rows"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
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
               conversation-id a-pk
               [{:type :text :text "partial-A"}]
               :finished? false)
              ;; Turn B completes normally
              (metabot-persistence/finalize-assistant-turn!
               conversation-id b-pk
               [{:type :text :text "reply-B"}])
              (let [rows (t2/select :model/MetabotMessage :conversation_id conversation-id
                                    {:order-by [[:created_at :asc] [:id :asc]]})]
                (is (= [:user :assistant :user :assistant] (mapv :role rows)))
                (is (= [["user" "A"] "partial-A" ["user" "B"] "reply-B"]
                       (mapv (fn [r]
                               (let [d (first (:data r))]
                                 (if (= "user" (:role d))
                                   [(:role d) (:content d)]
                                   (:text d))))
                             rows)))))))))))

(deftest start-turn-user-and-placeholder-share-created-at-test
  (testing "user-message and assistant-placeholder rows inserted by start-turn! share an instant;
            readers must tiebreak on :id to preserve user-before-assistant ordering"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
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
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          ;; Errored turn: user-msg and asst-row share created_at via start-turn!'s transaction.
          (let [{:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                            conversation-id "internal"
                                            {:role "user" :content "boom"})]
            (metabot-persistence/finalize-assistant-turn!
             conversation-id assistant-msg-id []
             :error {:message "kaboom" :type "RuntimeException"}))
          ;; Healthy follow-up turn — its user-msg and asst-row also collide on created_at.
          (let [{:keys [assistant-msg-id]} (metabot-persistence/start-turn!
                                            conversation-id "internal"
                                            {:role "user" :content "retry"})]
            (metabot-persistence/finalize-assistant-turn!
             conversation-id assistant-msg-id
             [{:type :text :text "ok"}])))
        ;; conversation-detail uses production reader ordering — the errored pair drops,
        ;; leaving just the retry turn.
        (let [{:keys [chat_messages]} (metabot-persistence/conversation-detail conversation-id)]
          (is (= [["user" "retry"] ["agent" "ok"]]
                 (mapv (juxt :role :message) chat_messages))))))))

(deftest placeholder-still-active-uses-nil-finished-marker-test
  (testing "the in-flight predicate keys off finished IS NULL (not :data emptiness or :error)"
    (let [recent (java.time.OffsetDateTime/now)
          stale  (.minusHours recent 2)
          base   {:role :assistant :data [] :error nil}]
      (testing "finished=nil + recent created_at → filtered"
        (is (= [] (metabot-persistence/messages->chat-messages
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
              texts  (mapv :message (:chat_messages detail))]
          (is (= conversation-id (:conversation_id detail)))
          (is (= ["first" "second"] texts)))))))

(deftest conversation-detail-returns-nil-for-missing-conversation-test
  (testing "conversation-detail returns nil when the conversation does not exist"
    (is (nil? (metabot-persistence/conversation-detail (str (random-uuid)))))))

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
                 {:role :assistant :data [{:type "text" :text "ok" :id "b1"}]})]
      (is (=? {:finished true} msg))
      (is (not (contains? msg :error)))))
  (testing "agent message inherits :finished false from parent row"
    (is (=? [{:finished false}]
            (metabot-persistence/message->chat-messages
             {:role :assistant :finished false
              :data [{:type "text" :text "interrupted" :id "b1"}]}))))
  (testing "agent message inherits JSON-decoded :error from parent row"
    (is (=? [{:error {:message "boom" :type "RuntimeException"}}]
            (metabot-persistence/message->chat-messages
             {:role :assistant :finished true
              :error (json/encode {:message "boom" :type "RuntimeException"})
              :data [{:type "text" :text "partial" :id "b1"}]}))))
  (testing "non-JSON :error column values fall through unchanged"
    (is (=? [{:error "raw legacy text"}]
            (metabot-persistence/message->chat-messages
             {:role :assistant :finished true :error "raw legacy text"
              :data [{:type "text" :text "partial" :id "b1"}]}))))
  (testing "user messages do not receive agent-only status fields"
    (let [[msg] (metabot-persistence/message->chat-messages
                 {:role :user :data [{:role "user" :content "hi"}]})]
      (is (not-any? #(contains? msg %) [:finished :error]))))
  (testing "multi-block assistant row: only the last agent message is annotated"
    (let [result     (metabot-persistence/message->chat-messages
                      {:role :assistant :finished false
                       :error (json/encode {:message "boom"})
                       :data [{:type "text" :text "first" :id "b1"}
                              {:type "tool-input" :id "call-1" :function "search"}
                              {:type "text" :text "last" :id "b2"}]})
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
                  [{:role :user      :data [{:role "user" :content "first"}]}
                   {:role :assistant :data [{:type "text" :text "first reply" :id "a1"}]}
                   {:role :user      :data [{:role "user" :content "broken"}]}
                   {:role :assistant :error (json/encode {:message "boom"}) :data []}
                   {:role :user      :data [{:role "user" :content "third"}]}
                   {:role :assistant :data [{:type "text" :text "third reply" :id "a3"}]}])))))
  (testing "with :include-errored? true, errored pairs stay and :error surfaces on the agent message"
    (let [result (metabot-persistence/messages->chat-messages
                  [{:role :user      :data [{:role "user" :content "broken"}]}
                   {:role :assistant :error (json/encode {:message "boom"}) :finished true
                    :data [{:type "text" :text "partial" :id "a1"}]}
                   {:role :user      :data [{:role "user" :content "ok"}]}
                   {:role :assistant :data [{:type "text" :text "fine" :id "a2"}]}]
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
               conversation-id assistant-msg-id
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
  (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
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

(deftest messages-chat-messages-skips-in-flight-placeholders-test
  (testing "in-flight placeholders (assistant role, finished=nil, recent created_at)
            are filtered out of the chat-message conversion, so a mid-stream read does not
            render a stub 'Response was interrupted' alert"
    (let [recent      (java.time.OffsetDateTime/now)
          ;; Comfortably outside the grace window so the test isn't sensitive
          ;; to the exact value of `placeholder-grace-period-ms`.
          stale       (.minusHours recent 2)
          placeholder {:role :assistant :data [] :finished nil :error nil :created_at recent}
          stale-stub  {:role :assistant :data [] :finished nil :error nil :created_at stale}
          user-msg    {:role :user :data [{:role "user" :content "hi"}]}
          done-asst   {:role :assistant :data [{:type "text" :text "done" :id "b1"}] :finished true}]
      (testing "in-flight placeholder is skipped; surrounding messages still render"
        (is (= ["hi" "done"]
               (mapv :message (metabot-persistence/messages->chat-messages [user-msg done-asst placeholder])))))
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
