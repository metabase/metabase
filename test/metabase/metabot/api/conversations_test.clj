(ns metabase.metabot.api.conversations-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api.common :as api]
   [metabase.metabot.api :as metabot.api]
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
  [{:keys [conversation-id role profile-id total-tokens data created-at external-id]
    :or   {role "assistant" profile-id "gpt-5" total-tokens 0 data []}}]
  (t2/insert! :model/MetabotMessage
              (cond-> {:conversation_id conversation-id
                       :role            role
                       :profile_id      profile-id
                       :total_tokens    total-tokens
                       :data            data
                       :external_id     (or external-id (str (random-uuid)))}
                created-at (assoc :created_at created-at))))

(defn- cleanup! [ids]
  (when (seq ids)
    (t2/delete! :model/MetabotMessage {:where [:in :conversation_id ids]})
    (t2/delete! :model/MetabotConversation {:where [:in :id ids]})))

(deftest list-conversations-authentication-test
  (testing "GET /api/metabot/conversations requires auth"
    (is (= "Unauthenticated"
           (mt/client :get 401 "metabot/conversations")))))

(deftest list-conversations-returns-only-current-users-convos-test
  (testing "GET /api/metabot/conversations returns only the caller's conversations"
    (let [rasta-id     (mt/user->id :rasta)
          lucky-id     (mt/user->id :lucky)
          rasta-convo  (str (random-uuid))
          lucky-convo  (str (random-uuid))]
      (try
        (insert-conversation! {:id rasta-convo :user-id rasta-id :summary "rasta's"})
        (insert-conversation! {:id lucky-convo :user-id lucky-id :summary "lucky's"})
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations")
              ids      (set (map :conversation_id (:data response)))]
          (is (contains? ids rasta-convo))
          (is (not (contains? ids lucky-convo))))
        (finally
          (cleanup! [rasta-convo lucky-convo]))))))

(deftest list-conversations-includes-message-count-test
  (testing "GET /api/metabot/conversations returns message_count"
    (let [user-id  (mt/user->id :rasta)
          convo-id (str (random-uuid))]
      (try
        (insert-conversation! {:id convo-id :user-id user-id :summary "hi"})
        (insert-message! {:conversation-id convo-id :role "user"})
        (insert-message! {:conversation-id convo-id :role "assistant"})
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations")
              found    (first (filter #(= convo-id (:conversation_id %)) (:data response)))]
          (is (some? found))
          (is (= 2 (:message_count found))))
        (finally
          (cleanup! [convo-id]))))))

(deftest get-conversation-owner-can-read-test
  (testing "GET /api/metabot/conversations/:id returns the conversation to its owner"
    (let [user-id  (mt/user->id :rasta)
          convo-id (str (random-uuid))]
      (try
        (insert-conversation! {:id convo-id :user-id user-id :summary "mine"})
        (insert-message! {:conversation-id convo-id :role "user"
                          :data [{:role "user" :content "hello"}]})
        (let [response (mt/user-http-request :rasta :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= "mine" (:summary response)))
          (is (= user-id (:user_id response)))
          (is (= 1 (count (:chat_messages response)))))
        (finally
          (cleanup! [convo-id]))))))

(deftest get-conversation-superuser-can-read-test
  (testing "GET /api/metabot/conversations/:id is accessible to superusers even if they don't own it"
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

(deftest get-conversation-non-owner-forbidden-test
  (testing "GET /api/metabot/conversations/:id returns 403 for a non-owner non-admin"
    (let [owner-id (mt/user->id :rasta)
          convo-id (str (random-uuid))]
      (try
        (insert-conversation! {:id convo-id :user-id owner-id})
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :lucky :get 403 (str "metabot/conversations/" convo-id))))
        (finally
          (cleanup! [convo-id]))))))

(deftest get-conversation-404-test
  (testing "GET /api/metabot/conversations/:id returns 404 when the conversation does not exist"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404
                                 (str "metabot/conversations/" (random-uuid)))))))

(deftest check-conversation-owner-test
  (testing "check-conversation-owner!"
    (let [owner-id (mt/user->id :rasta)
          other-id (mt/user->id :lucky)
          convo-id (str (random-uuid))
          check!   @#'metabot.api/check-conversation-owner!]
      (try
        (insert-conversation! {:id convo-id :user-id owner-id})
        (testing "allows the conversation's owner to continue it"
          (binding [api/*current-user-id* owner-id]
            (is (some? (check! convo-id)))))
        (testing "throws 403 when a different user tries to continue a conversation"
          (binding [api/*current-user-id* other-id]
            (is (thrown-with-msg? Exception #"permissions"
                                  (check! convo-id)))))
        (testing "allows any user to start a brand-new conversation (no row yet)"
          (binding [api/*current-user-id* other-id]
            (is (nil? (check! (str (random-uuid)))))))
        (finally
          (cleanup! [convo-id]))))))
