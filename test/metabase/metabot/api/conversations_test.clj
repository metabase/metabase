(ns metabase.metabot.api.conversations-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api.common :as api]
   [metabase.metabot.api :as metabot.api]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest list-conversations-authentication-test
  (testing "GET /api/metabot/conversations requires auth"
    (is (= "Unauthenticated"
           (mt/client :get 401 "metabot/conversations")))))

(deftest list-conversations-returns-only-conversations-user-participated-in-test
  (testing "GET /api/metabot/conversations returns only conversations the caller participated in"
    (let [rasta-id (mt/user->id :rasta)
          lucky-id (mt/user->id :lucky)]
      (mt/with-temp [:model/MetabotConversation {rasta-convo :id} {:user_id rasta-id :summary "rasta's"}
                     :model/MetabotConversation {lucky-convo :id} {:user_id lucky-id :summary "lucky's"}
                     :model/MetabotMessage _ {:conversation_id rasta-convo :user_id rasta-id}
                     :model/MetabotMessage _ {:conversation_id lucky-convo :user_id lucky-id}]
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations")
              ids      (set (map :conversation_id (:data response)))]
          (is (contains? ids rasta-convo))
          (is (not (contains? ids lucky-convo))))))))

(deftest list-conversations-includes-legacy-originator-conversations-test
  (testing "GET /api/metabot/conversations keeps legacy originator conversations visible"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id :summary "legacy"}
                     ;; No :user_id on the message — simulates a legacy row from before user_id stamping.
                     :model/MetabotMessage _ {:conversation_id convo-id
                                              :data            [{:role "assistant" :content "hello from before user_id stamping"}]}]
        (let [ids (set (map :conversation_id
                            (:data (mt/user-http-request :rasta :get 200 "metabot/conversations"))))]
          (is (contains? ids convo-id)))))))

(deftest list-conversations-includes-shared-multi-user-conversations-test
  (testing "GET /api/metabot/conversations includes conversations with multiple participants for each participant"
    (let [rasta-id (mt/user->id :rasta)
          lucky-id (mt/user->id :lucky)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id rasta-id :summary "shared"}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id rasta-id}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id lucky-id}]
        (testing "originator sees it"
          (let [ids (set (map :conversation_id
                              (:data (mt/user-http-request :rasta :get 200 "metabot/conversations"))))]
            (is (contains? ids convo-id))))
        (testing "non-originator participant sees it too"
          (let [ids (set (map :conversation_id
                              (:data (mt/user-http-request :lucky :get 200 "metabot/conversations"))))]
            (is (contains? ids convo-id))))))))

(deftest list-conversations-includes-message-count-test
  (testing "GET /api/metabot/conversations returns message_count"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id :summary "hi"}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id user-id :role "user"}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id user-id :role "assistant"}]
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations")
              found    (first (filter #(= convo-id (:conversation_id %)) (:data response)))]
          (is (some? found))
          (is (= 2 (:message_count found))))))))

(deftest list-conversations-includes-title-test
  (testing "GET /api/metabot/conversations returns title (nil when unset)"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {with-title :id}    {:user_id user-id :title "Titled chat"}
                     :model/MetabotMessage      _                   {:conversation_id with-title :user_id user-id}
                     :model/MetabotConversation {without-title :id} {:user_id user-id}
                     :model/MetabotMessage      _                   {:conversation_id without-title :user_id user-id}]
        (let [by-id (into {} (map (juxt :conversation_id identity))
                          (:data (mt/user-http-request :rasta :get 200 "metabot/conversations")))]
          (is (= "Titled chat" (:title (get by-id with-title))))
          (is (nil? (:title (get by-id without-title)))))))))

(deftest list-conversations-orders-by-latest-message-activity-test
  (testing "GET /api/metabot/conversations sorts by last_message_at desc, even if the older conversation has the newer message"
    (let [user-id (mt/user->id :rasta)
          t0      (java.time.OffsetDateTime/parse "2020-01-01T00:00:00Z")
          t1      (java.time.OffsetDateTime/parse "2020-02-01T00:00:00Z")
          t2      (java.time.OffsetDateTime/parse "2020-03-01T00:00:00Z")
          t3      (java.time.OffsetDateTime/parse "2020-04-01T00:00:00Z")]
      (mt/with-temp [:model/MetabotConversation {older :id} {:user_id user-id :created_at t0}
                     :model/MetabotConversation {newer :id} {:user_id user-id :created_at t1}
                     ;; `newer` got a message before `older` got its more-recent one,
                     ;; so `older` should sort first.
                     :model/MetabotMessage _ {:conversation_id newer :user_id user-id :created_at t2}
                     :model/MetabotMessage _ {:conversation_id older :user_id user-id :created_at t3}]
        (let [ids (->> (mt/user-http-request :rasta :get 200 "metabot/conversations")
                       :data
                       (map :conversation_id)
                       (filter #{older newer}))]
          (is (= [older newer] ids)))))))

(deftest list-conversations-empty-conversation-sorts-by-conversation-created-at-test
  (testing "GET /api/metabot/conversations includes message-less conversations, sorted by the conversation's own created_at"
    (let [user-id (mt/user->id :rasta)
          t-old   (java.time.OffsetDateTime/parse "2020-01-01T00:00:00Z")
          t-new   (java.time.OffsetDateTime/parse "2020-02-01T00:00:00Z")]
      (mt/with-temp [:model/MetabotConversation {old-empty :id} {:user_id user-id :created_at t-old}
                     :model/MetabotConversation {new-empty :id} {:user_id user-id :created_at t-new}]
        (let [ids (->> (mt/user-http-request :rasta :get 200 "metabot/conversations")
                       :data
                       (map :conversation_id)
                       (filter #{old-empty new-empty}))]
          (is (= [new-empty old-empty] ids)))))))

(deftest get-conversation-participant-can-read-test
  (testing "GET /api/metabot/conversations/:id returns the conversation to any participant"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id :summary "mine" :title "My chat"}
                     :model/MetabotMessage _ {:conversation_id convo-id
                                              :user_id         user-id
                                              :role            "user"
                                              :data            [{:role "user" :content "hello"}]}]
        (let [response (mt/user-http-request :rasta :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= "mine" (:summary response)))
          (is (= "My chat" (:title response)))
          (is (= user-id (:user_id response)))
          (is (= 1 (count (:chat_messages response)))))))))

(deftest get-conversation-includes-history-test
  (testing "GET /api/metabot/conversations/:id returns LLM-format history for the user's chat_messages"
    (let [user-id (mt/user->id :rasta)]
      (testing "user + assistant text only"
        (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id :title "text chat"}
                       :model/MetabotMessage _ {:conversation_id convo-id
                                                :user_id         user-id
                                                :role            "user"
                                                :data            [{:role "user" :content "what is 2+2?"}]}
                       :model/MetabotMessage _ {:conversation_id convo-id
                                                :role            "assistant"
                                                :finished        true
                                                :data            [{:type "text" :text "4"}]}]
          (let [{:keys [history title]} (mt/user-http-request :rasta :get 200
                                                              (str "metabot/conversations/" convo-id))]
            (is (= "text chat" title))
            (is (= [{:role "user" :content "what is 2+2?"}
                    {:role "assistant" :content "4"}]
                   history)))))
      (testing "assistant turn with tool call + tool output"
        (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id}
                       :model/MetabotMessage _ {:conversation_id convo-id
                                                :user_id         user-id
                                                :role            "user"
                                                :data            [{:role "user" :content "search for orders"}]}
                       :model/MetabotMessage _ {:conversation_id convo-id
                                                :role            "assistant"
                                                :finished        true
                                                :data            [{:type "text" :text "searching..."}
                                                                  {:type      "tool-input"
                                                                   :id        "call_1"
                                                                   :function  "search"
                                                                   :arguments {:q "orders"}}
                                                                  {:type   "tool-output"
                                                                   :id     "call_1"
                                                                   :result {:output "Found 3 results"}}]}]
          (let [history (:history (mt/user-http-request :rasta :get 200
                                                        (str "metabot/conversations/" convo-id)))
                assistant (nth history 1)
                tool      (nth history 2)]
            (is (= 3 (count history)))
            (is (= "searching..." (:content assistant)))
            (is (= [{:id "call_1" :name "search" :arguments "{\"q\":\"orders\"}"}]
                   (:tool_calls assistant)))
            (is (= {:role "tool" :tool_call_id "call_1" :content "Found 3 results"}
                   tool))))))))

(deftest get-conversation-second-participant-can-read-test
  (testing "GET /api/metabot/conversations/:id is readable by any participant, not just the originator"
    (let [originator-id (mt/user->id :rasta)
          other-id      (mt/user->id :lucky)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id originator-id :summary "shared"}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id originator-id}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id other-id}]
        (let [response (mt/user-http-request :lucky :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= originator-id (:user_id response))))))))

(deftest get-conversation-superuser-can-read-test
  (testing "GET /api/metabot/conversations/:id is accessible to superusers even if they don't participate"
    (let [owner-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id owner-id :summary "rasta's"}]
        (let [response (mt/user-http-request :crowberto :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= owner-id (:user_id response))))))))

(deftest get-conversation-non-participant-forbidden-test
  (testing "GET /api/metabot/conversations/:id returns 403 for a non-participant non-admin"
    (let [owner-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id owner-id}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id owner-id}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :lucky :get 403 (str "metabot/conversations/" convo-id))))))))

(deftest get-conversation-404-test
  (testing "GET /api/metabot/conversations/:id returns 404 when the conversation does not exist"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404
                                 (str "metabot/conversations/" (random-uuid)))))))

(deftest check-conversation-access-test
  (testing "check-conversation-access!"
    (let [owner-id (mt/user->id :rasta)
          other-id (mt/user->id :lucky)
          check!   @#'metabot.api/check-conversation-access!]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id owner-id}]
        (testing "allows the originator to continue a legacy conversation with no stamped message authors"
          (binding [api/*current-user-id* owner-id]
            (is (some? (check! convo-id)))))
        (testing "throws 403 when a non-participant tries to continue the conversation"
          (binding [api/*current-user-id* other-id]
            (is (thrown-with-msg? Exception #"permissions"
                                  (check! convo-id)))))
        (testing "allows any user to start a brand-new conversation (no row yet)"
          (binding [api/*current-user-id* other-id]
            (is (nil? (check! (str (random-uuid)))))))))))

(deftest originator-not-overwritten-by-second-writer-test
  (testing "metabot_conversation.user_id is set once on insert and never overwritten"
    (let [owner-id (mt/user->id :rasta)
          other-id (mt/user->id :lucky)
          convo-id (str (random-uuid))
          msg      {:role "user" :content "hello"}]
      (try
        (binding [api/*current-user-id* owner-id]
          (metabot.persistence/start-turn! convo-id "slackbot" msg :user-id owner-id))
        (binding [api/*current-user-id* other-id]
          (metabot.persistence/start-turn! convo-id "slackbot" msg :user-id other-id))
        (is (= owner-id
               (:user_id (t2/select-one :model/MetabotConversation :id convo-id)))
            "originator user_id must not be overwritten when a second user writes to the same conversation")
        (finally
          (t2/delete! :model/MetabotMessage :conversation_id convo-id)
          (t2/delete! :model/MetabotConversation :id convo-id))))))
