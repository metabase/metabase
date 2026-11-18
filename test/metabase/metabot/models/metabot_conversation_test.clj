(ns metabase.metabot.models.metabot-conversation-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest originator-is-frozen-test
  (mt/with-temp [:model/MetabotConversation {id :id} {:user_id (mt/user->id :rasta)}]
    (is (=? {:status-code 400}
            (try (t2/update! :model/MetabotConversation :id id {:user_id (mt/user->id :lucky)})
                 (catch clojure.lang.ExceptionInfo e (ex-data e)))))
    (is (= (mt/user->id :rasta) (t2/select-one-fn :user_id :model/MetabotConversation :id id)))
    (is (pos? (t2/update! :model/MetabotConversation :id id {:title "Renamed"})))))

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
        (testing "a list is read in one query"
          (mt/with-current-user rasta-id
            (let [rows (conversations)]
              (t2/with-call-count [call-count]
                (t2/hydrate rows :can_read)
                (is (= 1 (call-count)))))))))))
