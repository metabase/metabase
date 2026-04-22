(ns metabase-enterprise.metabot.api-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- with-owned-message!
  "Create a conversation + assistant message owned by `user-id` and call `f` with
   the message's external_id, cleaning up afterwards."
  [user-id f]
  (let [conversation-id (str (random-uuid))
        external-id     (str (random-uuid))]
    (try
      (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
      (t2/insert-returning-pks!
       :model/MetabotMessage
       {:conversation_id conversation-id
        :role            "assistant"
        :profile_id      "gpt-x"
        :external_id     external-id
        :total_tokens    5
        :data            [{:type "text" :text "hi"}]})
      (f external-id)
      (finally
        (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
        (t2/delete! :model/MetabotConversation :id conversation-id)))))

(deftest feedback-endpoint-test
  (let [store-url  "http://hm.example"
        fake-token "test-fake-token-for-feedback"]
    (testing "Persists feedback locally and proxies a Harbormaster payload built from DB state"
      (mt/with-temporary-setting-values [store-api-url store-url]
        (with-owned-message!
          (mt/user->id :rasta)
          (fn [external-id]
            (let [captured     (atom nil)
                  body         {:metabot_id        1
                                :message_id        external-id
                                :positive          true
                                :freeform_feedback "ok"}
                  expected-url (str store-url "/api/v2/metabot/feedback/" fake-token)]
              (mt/with-dynamic-fn-redefs
                [premium-features/premium-embedding-token (constantly fake-token)
                 http/post (fn [url opts]
                             (reset! captured {:url  url
                                               :body (json/decode+kw (:body opts))}))]
                (mt/user-http-request :rasta :post 204 "metabot/feedback" body)
                (is (= expected-url (:url @captured)))
                (let [sent (:body @captured)]
                  (is (= 1 (:metabot_id sent)))
                  (is (= {:message_id        external-id
                          :positive          true
                          :issue_type        nil
                          :freeform_feedback "ok"}
                         (:feedback sent)))
                  (is (map? (:conversation_data sent)))
                  (is (contains? sent :version))
                  (is (contains? sent :submission_time))
                  (is (false? (:is_admin sent))))))))))

    (testing "404s when the message_id does not resolve to a message the caller owns"
      (mt/user-http-request :rasta :post 404 "metabot/feedback"
                            {:metabot_id 1
                             :message_id (str (random-uuid))
                             :positive   true}))

    (testing "Persists locally and returns 204 when the premium token is missing (Harbormaster errors are swallowed)"
      (mt/with-temporary-setting-values [store-api-url store-url]
        (with-owned-message!
          (mt/user->id :rasta)
          (fn [external-id]
            (let [posted? (atom false)
                  message-row-id (t2/select-one-fn :id :model/MetabotMessage :external_id external-id)]
              (mt/with-dynamic-fn-redefs
                [premium-features/premium-embedding-token (constantly nil)
                 http/post (fn [& _] (reset! posted? true))]
                (mt/user-http-request :rasta :post 204 "metabot/feedback"
                                      {:metabot_id        1
                                       :message_id        external-id
                                       :positive          true
                                       :freeform_feedback "ok"})
                (is (false? @posted?)
                    "Harbormaster must not be contacted when the premium token is missing")
                (is (= {:positive true :freeform_feedback "ok"}
                       (t2/select-one [:model/MetabotFeedback :positive :freeform_feedback]
                                      :message_id message-row-id))
                    "Local feedback row should still be persisted")))))))))

(deftest usage-get-returns-token-status-usage-test
  (mt/with-premium-features #{:metabot-v3}
    (with-redefs [premium-features/token-status (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value      12345
                                                                                                           :meter-free-units 1337
                                                                                                           :meter-updated-at "2026-04-02T19:29:12Z"}}})]
      (is (= {:tokens       12345
              :free_tokens  1337
              :updated_at   "2026-04-02T19:29:12Z"
              :is_locked    nil}
             (-> (mt/user-http-request :crowberto :get 200 "ee/metabot/usage")
                 (update :updated_at str)))))))

(deftest usage-permissions-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/user-http-request :rasta :get 403 "ee/metabot/usage")))
