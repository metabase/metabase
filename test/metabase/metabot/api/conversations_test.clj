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

(deftest get-conversation-participant-can-read-test
  (testing "GET /api/metabot/conversations/:id returns the conversation to any participant"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id :summary "mine"}
                     :model/MetabotMessage _ {:conversation_id convo-id
                                              :user_id         user-id
                                              :role            "user"
                                              :data            [{:role "user" :content "hello"}]}]
        (let [response (mt/user-http-request :rasta :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= "mine" (:summary response)))
          (is (= user-id (:user_id response)))
          (is (= 1 (count (:chat_messages response)))))))))

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
          (#'metabot.persistence/store-message! convo-id "slackbot" [msg] :user-id owner-id))
        (binding [api/*current-user-id* other-id]
          (#'metabot.persistence/store-message! convo-id "slackbot" [msg] :user-id other-id))
        (is (= owner-id
               (:user_id (t2/select-one :model/MetabotConversation :id convo-id)))
            "originator user_id must not be overwritten when a second user writes to the same conversation")
        (finally
          (t2/delete! :model/MetabotMessage :conversation_id convo-id)
          (t2/delete! :model/MetabotConversation :id convo-id))))))
