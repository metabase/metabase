(ns metabase.metabot.models.metabot-conversation-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.models.metabot-conversation :as metabot-conversation]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest originator-is-frozen-test
  (mt/with-temp [:model/MetabotConversation {id :id} {:user_id (mt/user->id :rasta)}]
    (is (=? {:status-code 400}
            (try (t2/update! :model/MetabotConversation :id id {:user_id (mt/user->id :lucky)})
                 (catch clojure.lang.ExceptionInfo e (ex-data e)))))
    (is (= (mt/user->id :rasta) (t2/select-one-fn :user_id :model/MetabotConversation :id id)))
    (is (pos? (t2/update! :model/MetabotConversation :id id {:title "Renamed"})))))

(deftest set-title-if-missing-keeps-a-concurrent-title-test
  (testing "a title set by another writer after the read is kept"
    (mt/with-temp [:model/MetabotConversation {id :id} {:user_id (mt/user->id :rasta)}]
      ;; The stub reads the row as the real function does, then lets another writer set a title before returning.
      (mt/with-dynamic-fn-redefs [metabot.db/titleless-conversation
                                  (fn [conversation-id]
                                    (u/prog1 (t2/select-one :model/MetabotConversation :id conversation-id :title nil)
                                      (t2/update! :model/MetabotConversation :id conversation-id {:title "First"})))]
        (is (= 0 (metabot-conversation/set-metabot-conversation-title-if-missing! id "Second"))))
      (is (= "First" (t2/select-one-fn :title :model/MetabotConversation :id id))))))

(deftest can-read-and-can-write-test
  (let [rasta-id (mt/user->id :rasta)
        lucky-id (mt/user->id :lucky)]
    (mt/with-temp [:model/MetabotConversation {originated :id}   {:user_id rasta-id}
                   :model/MetabotConversation {participated :id} {:user_id lucky-id}
                   :model/MetabotConversation {unrelated :id}    {:user_id lucky-id}
                   :model/MetabotMessage      _                  {:conversation_id participated
                                                                  :user_id         rasta-id
                                                                  :role            "user"}]
      (let [conversations #(t2/select :model/MetabotConversation :id [:in [originated participated unrelated]]
                                      {:order-by [[:created_at :asc]]})
            by-id         (fn [f]
                            (into {} (map (juxt :id f)) (t2/hydrate (conversations) :can_read :can_write)))]
        (testing "a user reads the conversations they originated or sent a message in"
          (mt/with-current-user rasta-id
            (is (= {originated true participated true unrelated false} (by-id mi/can-read?)))))
        (testing "a superuser reads every conversation"
          (mt/with-current-user (mt/user->id :crowberto)
            (is (= {originated true participated true unrelated true} (by-id mi/can-read?)))))
        (testing "only the originator forks a conversation, a superuser included"
          (mt/with-current-user rasta-id
            (is (= {originated true participated false unrelated false} (by-id mi/can-write?))))
          (mt/with-current-user (mt/user->id :crowberto)
            (is (= {originated false participated false unrelated false} (by-id mi/can-write?)))))
        (testing "a list is read in the same number of queries for any number of conversations"
          (mt/with-temp [:model/MetabotConversation {fourth :id} {:user_id lucky-id}
                         :model/MetabotConversation {fifth :id}  {:user_id lucky-id}
                         :model/MetabotConversation {sixth :id}  {:user_id rasta-id}]
            (mt/with-current-user rasta-id
              (let [counted (fn [ids]
                              (let [rows (t2/select :model/MetabotConversation :id [:in ids])]
                                (t2/with-call-count [call-count]
                                  (t2/hydrate rows :can_read)
                                  (call-count))))]
                (counted [originated])
                (is (= (counted [originated participated])
                       (counted [originated participated unrelated fourth fifth sixth])))))))))))

(deftest delete-by-ids-statement-count-does-not-grow-with-rows-test
  (let [make! (fn [n]
                (vec (repeatedly n (fn []
                                     (let [id (str (random-uuid))]
                                       (metabot-conversation/create-metabot-conversations! [{:id id :user_id (mt/user->id :rasta)}])
                                       id)))))
        counted (fn [n]
                  (let [ids (make! n)]
                    (events.tu/statement-count! #(metabot-conversation/delete-metabot-conversations! ids))))]
    (counted 1)
    (is (= (counted 2) (counted 6)))))

(deftest create-metabot-conversations-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/MetabotConversation]
    (let [counted (fn [n]
                    (events.tu/statement-count!
                     #(metabot-conversation/create-metabot-conversations!
                       (vec (repeatedly n (fn [] {:id (str (random-uuid)) :user_id (mt/user->id :rasta)}))))))]
      (counted 1)
      (is (= (counted 2) (counted 6))))))
