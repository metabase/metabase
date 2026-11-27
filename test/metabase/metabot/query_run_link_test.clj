(ns metabase.metabot.query-run-link-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.query-run-link :as query-run-link]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- link-of
  "The link that [[query-run-link/+query-run-link]] puts on a request with `headers`, or nil."
  [headers]
  (let [seen    (promise)
        handler (query-run-link/+query-run-link (fn [request respond _raise]
                                                  (deliver seen (get request query-run-link/request-key))
                                                  (respond :done)))]
    (handler {:headers headers} identity identity)
    @seen))

(defn- headers
  [conversation-id message-external-id & [rerun]]
  (cond-> {query-run-link/conversation-id-header conversation-id}
    message-external-id (assoc query-run-link/message-id-header message-external-id)
    rerun               (assoc query-run-link/rerun-header rerun)))

(deftest query-run-link-middleware-test
  (mt/with-temp [:model/MetabotConversation {conversation-id :id} {:user_id (mt/user->id :rasta)}
                 :model/MetabotMessage      {message-id :id}      {:conversation_id conversation-id
                                                                   :user_id         (mt/user->id :rasta)
                                                                   :external_id     (str (random-uuid))}
                 :model/MetabotConversation {other-id :id}        {:user_id (mt/user->id :rasta)}
                 :model/MetabotMessage      {foreign-id :id}      {:conversation_id other-id
                                                                   :user_id         (mt/user->id :rasta)
                                                                   :external_id     (str (random-uuid))}]
    (let [external-id (t2/select-one-fn :external_id :model/MetabotMessage :id message-id)
          foreign     (t2/select-one-fn :external_id :model/MetabotMessage :id foreign-id)]
      (mt/with-current-user (mt/user->id :rasta)
        (testing "the headers of a reader of the conversation give the link, with the pk of the message"
          (is (= {:metabot-conversation-id conversation-id
                  :metabot-message-id      message-id
                  :metabot-rerun?          false}
                 (link-of (headers conversation-id external-id)))))
        (testing "the rerun header marks a later run"
          (is (=? {:metabot-rerun? true}
                  (link-of (headers conversation-id external-id "true"))))
          (is (=? {:metabot-rerun? false}
                  (link-of (headers conversation-id external-id "no")))))
        (testing "a message of another conversation is left out"
          (is (= {:metabot-conversation-id conversation-id, :metabot-rerun? false}
                 (link-of (headers conversation-id foreign)))))
        (testing "a message that does not exist is left out"
          (is (= {:metabot-conversation-id conversation-id, :metabot-rerun? false}
                 (link-of (headers conversation-id (str (random-uuid)))))))
        (testing "no headers, no link"
          (is (nil? (link-of {}))))
        (testing "a conversation that does not exist gives no link"
          (is (nil? (link-of (headers (str (random-uuid)) external-id))))))
      (testing "a user who cannot read the conversation gets no link"
        (mt/with-current-user (mt/user->id :lucky)
          (is (nil? (link-of (headers conversation-id external-id)))))))))

(deftest dataset-endpoint-records-the-link-test
  (testing "POST /api/dataset with the Metabot headers saves the link on the QueryExecution (BOT-2381)"
    (mt/with-temp [:model/MetabotConversation {conversation-id :id} {:user_id (mt/user->id :rasta)}
                   :model/MetabotMessage      {message-id :id}      {:conversation_id conversation-id
                                                                     :user_id         (mt/user->id :rasta)
                                                                     :external_id     (str (random-uuid))}]
      (mt/with-model-cleanup [:model/QueryExecution]
        (mt/with-temporary-setting-values [synchronous-batch-updates true]
          (let [external-id (t2/select-one-fn :external_id :model/MetabotMessage :id message-id)
                run!        (fn [user request-headers]
                              (mt/user-http-request user :post 202 "dataset"
                                                    {:request-options {:headers request-headers}}
                                                    (mt/mbql-query venues {:aggregation [[:count]]})))]
            (run! :rasta (headers conversation-id external-id "true"))
            (is (=? [{:context                 :ad-hoc
                      :executor_id             (mt/user->id :rasta)
                      :metabot_conversation_id conversation-id
                      :metabot_message_id      message-id
                      :metabot_tool_call_id    nil
                      :metabot_rerun           true}]
                    (t2/select :model/QueryExecution :metabot_conversation_id conversation-id)))
            (testing "the headers of a user who cannot read the conversation leave the run unlinked, and it still runs"
              (t2/delete! :model/QueryExecution :metabot_conversation_id conversation-id)
              (run! :lucky (headers conversation-id external-id))
              (is (empty? (t2/select :model/QueryExecution :metabot_conversation_id conversation-id))))
            (testing "a query map cannot name its own link"
              (mt/user-http-request :lucky :post 202 "dataset"
                                    (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                                           :info {:metabot-conversation-id conversation-id}))
              (is (empty? (t2/select :model/QueryExecution :metabot_conversation_id conversation-id))))))))))
