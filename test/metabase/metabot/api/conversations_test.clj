(ns metabase.metabot.api.conversations-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api.common :as api]
   [metabase.metabot.api :as metabot.api]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-conversation!
  [{:keys [id user-id summary created-at]}]
  (t2/insert! :model/MetabotConversation
              (cond-> {:id      id
                       :user_id user-id}
                summary    (assoc :summary summary)
                created-at (assoc :created_at created-at))))

(defn- insert-message!
  [{:keys [conversation-id role profile-id total-tokens data created-at user-id]
    :or   {role "assistant" profile-id "gpt-5" total-tokens 0 data []}}]
  (t2/insert! :model/MetabotMessage
              (cond-> {:conversation_id conversation-id
                       :role            role
                       :profile_id      profile-id
                       :total_tokens    total-tokens
                       :data            data}
                user-id    (assoc :user_id user-id)
                created-at (assoc :created_at created-at))))

(defn- seed-participation!
  "Insert a message authored by `user-id` so they pass the participation check."
  [conversation-id user-id]
  (insert-message! {:conversation-id conversation-id
                    :user-id         user-id
                    :role            "assistant"}))

(defn- cleanup! [ids]
  (when (seq ids)
    (t2/delete! :model/MetabotMessage {:where [:in :conversation_id ids]})
    (t2/delete! :model/MetabotConversation {:where [:in :id ids]})))

(deftest list-conversations-authentication-test
  (testing "GET /api/metabot/conversations requires auth"
    (is (= "Unauthenticated"
           (mt/client :get 401 "metabot/conversations")))))

(deftest list-conversations-returns-only-conversations-user-participated-in-test
  (testing "GET /api/metabot/conversations returns only conversations the caller participated in"
    (let [rasta-id    (mt/user->id :rasta)
          lucky-id    (mt/user->id :lucky)
          rasta-convo (str (random-uuid))
          lucky-convo (str (random-uuid))]
      (try
        (insert-conversation! {:id rasta-convo :user-id rasta-id :summary "rasta's"})
        (insert-conversation! {:id lucky-convo :user-id lucky-id :summary "lucky's"})
        (seed-participation! rasta-convo rasta-id)
        (seed-participation! lucky-convo lucky-id)
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations")
              ids      (set (map :conversation_id (:data response)))]
          (is (contains? ids rasta-convo))
          (is (not (contains? ids lucky-convo))))
        (finally
          (cleanup! [rasta-convo lucky-convo]))))))

(deftest list-conversations-includes-legacy-originator-conversations-test
  (testing "GET /api/metabot/conversations keeps legacy originator conversations visible"
    (let [user-id  (mt/user->id :rasta)
          convo-id (str (random-uuid))]
      (try
        (insert-conversation! {:id convo-id :user-id user-id :summary "legacy"})
        (insert-message! {:conversation-id convo-id
                          :role            "assistant"
                          :data            [{:role "assistant" :content "hello from before user_id stamping"}]})
        (let [ids (set (map :conversation_id
                            (:data (mt/user-http-request :rasta :get 200 "metabot/conversations"))))]
          (is (contains? ids convo-id)))
        (finally
          (cleanup! [convo-id]))))))

(deftest list-conversations-includes-shared-multi-user-conversations-test
  (testing "GET /api/metabot/conversations includes conversations with multiple participants for each participant"
    (let [rasta-id (mt/user->id :rasta)
          lucky-id (mt/user->id :lucky)
          convo-id (str (random-uuid))]
      (try
        (insert-conversation! {:id convo-id :user-id rasta-id :summary "shared"})
        (seed-participation! convo-id rasta-id)
        (seed-participation! convo-id lucky-id)
        (testing "originator sees it"
          (let [ids (set (map :conversation_id
                              (:data (mt/user-http-request :rasta :get 200 "metabot/conversations"))))]
            (is (contains? ids convo-id))))
        (testing "non-originator participant sees it too"
          (let [ids (set (map :conversation_id
                              (:data (mt/user-http-request :lucky :get 200 "metabot/conversations"))))]
            (is (contains? ids convo-id))))
        (finally
          (cleanup! [convo-id]))))))

(deftest list-conversations-includes-message-count-test
  (testing "GET /api/metabot/conversations returns message_count"
    (let [user-id  (mt/user->id :rasta)
          convo-id (str (random-uuid))]
      (try
        (insert-conversation! {:id convo-id :user-id user-id :summary "hi"})
        (insert-message! {:conversation-id convo-id :role "user" :user-id user-id})
        (insert-message! {:conversation-id convo-id :role "assistant" :user-id user-id})
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations")
              found    (first (filter #(= convo-id (:conversation_id %)) (:data response)))]
          (is (some? found))
          (is (= 2 (:message_count found))))
        (finally
          (cleanup! [convo-id]))))))

(deftest get-conversation-participant-can-read-test
  (testing "GET /api/metabot/conversations/:id returns the conversation to any participant"
    (let [user-id  (mt/user->id :rasta)
          convo-id (str (random-uuid))]
      (try
        (insert-conversation! {:id convo-id :user-id user-id :summary "mine"})
        (insert-message! {:conversation-id convo-id :role "user"
                          :user-id         user-id
                          :data [{:role "user" :content "hello"}]})
        (let [response (mt/user-http-request :rasta :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= "mine" (:summary response)))
          (is (= user-id (:user_id response)))
          (is (= 1 (count (:chat_messages response)))))
        (finally
          (cleanup! [convo-id]))))))

(deftest get-conversation-second-participant-can-read-test
  (testing "GET /api/metabot/conversations/:id is readable by any participant, not just the originator"
    (let [originator-id (mt/user->id :rasta)
          other-id      (mt/user->id :lucky)
          convo-id      (str (random-uuid))]
      (try
        (insert-conversation! {:id convo-id :user-id originator-id :summary "shared"})
        (seed-participation! convo-id originator-id)
        (seed-participation! convo-id other-id)
        (let [response (mt/user-http-request :lucky :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= originator-id (:user_id response))))
        (finally
          (cleanup! [convo-id]))))))

(deftest get-conversation-superuser-can-read-test
  (testing "GET /api/metabot/conversations/:id is accessible to superusers even if they don't participate"
    (let [owner-id (mt/user->id :rasta)
          convo-id (str (random-uuid))]
      (try
        (insert-conversation! {:id convo-id :user-id owner-id :summary "rasta's"})
        (let [response (mt/user-http-request :crowberto :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= owner-id (:user_id response))))
        (finally
          (cleanup! [convo-id]))))))

(deftest get-conversation-non-participant-forbidden-test
  (testing "GET /api/metabot/conversations/:id returns 403 for a non-participant non-admin"
    (let [owner-id (mt/user->id :rasta)
          convo-id (str (random-uuid))]
      (try
        (insert-conversation! {:id convo-id :user-id owner-id})
        (seed-participation! convo-id owner-id)
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :lucky :get 403 (str "metabot/conversations/" convo-id))))
        (finally
          (cleanup! [convo-id]))))))

(deftest get-conversation-404-test
  (testing "GET /api/metabot/conversations/:id returns 404 when the conversation does not exist"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404
                                 (str "metabot/conversations/" (random-uuid)))))))

(deftest check-conversation-access-test
  (testing "check-conversation-access!"
    (let [owner-id (mt/user->id :rasta)
          other-id (mt/user->id :lucky)
          convo-id (str (random-uuid))
          check!   @#'metabot.api/check-conversation-access!]
      (try
        (insert-conversation! {:id convo-id :user-id owner-id})
        (testing "allows the originator to continue a legacy conversation with no stamped message authors"
          (binding [api/*current-user-id* owner-id]
            (is (some? (check! convo-id)))))
        (testing "throws 403 when a non-participant tries to continue the conversation"
          (binding [api/*current-user-id* other-id]
            (is (thrown-with-msg? Exception #"permissions"
                                  (check! convo-id)))))
        (testing "allows any user to start a brand-new conversation (no row yet)"
          (binding [api/*current-user-id* other-id]
            (is (nil? (check! (str (random-uuid)))))))
        (finally
          (cleanup! [convo-id]))))))

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
          (cleanup! [convo-id]))))))
