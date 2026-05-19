(ns metabase.metabot.models.metabot-used-table-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest insert-and-round-trip-test
  (testing "inserting a row with a real table_id succeeds and round-trips"
    (mt/with-temp [:model/User                {user-id :id}         {}
                   :model/MetabotConversation {conversation-id :id} {:user_id user-id}
                   :model/MetabotMessage      {msg-id :id}          {:conversation_id conversation-id}]
      (let [table-id (mt/id :orders)]
        (t2/insert! :model/MetabotUsedTable
                    {:message_id msg-id :table_id table-id})
        (is (=? {:message_id msg-id :table_id table-id}
                (t2/select-one :model/MetabotUsedTable :message_id msg-id)))))))

(deftest unique-constraint-test
  (testing "inserting two rows with the same (message_id, table_id) throws"
    (mt/with-temp [:model/User                {user-id :id}         {}
                   :model/MetabotConversation {conversation-id :id} {:user_id user-id}
                   :model/MetabotMessage      {msg-id :id}          {:conversation_id conversation-id}]
      (let [table-id (mt/id :orders)]
        (t2/insert! :model/MetabotUsedTable {:message_id msg-id :table_id table-id})
        ;; Wrap the failing INSERT in its own transaction so the outer
        ;; `mt/with-temp` transaction stays viable for cleanup.
        (is (thrown? Exception
                     (t2/with-transaction [_conn]
                       (t2/insert! :model/MetabotUsedTable
                                   {:message_id msg-id :table_id table-id}))))))))

(deftest unknown-table-rejected-test
  (testing "inserting with a table_id that does not exist violates the FK"
    (mt/with-temp [:model/User                {user-id :id}         {}
                   :model/MetabotConversation {conversation-id :id} {:user_id user-id}
                   :model/MetabotMessage      {msg-id :id}          {:conversation_id conversation-id}]
      (let [absent-table-id (+ 1000000 (rand-int 1000000))]
        (is (thrown? Exception
                     (t2/with-transaction [_conn]
                       (t2/insert! :model/MetabotUsedTable
                                   {:message_id msg-id :table_id absent-table-id}))))
        (is (zero? (t2/count :model/MetabotUsedTable :message_id msg-id)))))))

(deftest cascade-from-message-test
  (testing "deleting a MetabotMessage cascades to its used-table rows"
    (mt/with-temp [:model/User                {user-id :id}         {}
                   :model/MetabotConversation {conversation-id :id} {:user_id user-id}
                   :model/MetabotMessage      {msg-id :id}          {:conversation_id conversation-id}]
      (t2/insert! :model/MetabotUsedTable
                  [{:message_id msg-id :table_id (mt/id :orders)}
                   {:message_id msg-id :table_id (mt/id :people)}])
      (is (= 2 (t2/count :model/MetabotUsedTable :message_id msg-id)))
      (t2/delete! :model/MetabotMessage :id msg-id)
      (is (zero? (t2/count :model/MetabotUsedTable :message_id msg-id))))))

(deftest cascade-from-table-test
  (testing "deleting the referenced Table cascades to its used-table rows"
    (mt/with-temp [:model/User                {user-id :id}         {}
                   :model/Database            {db-id :id}           {}
                   :model/Table               {table-id :id}        {:db_id db-id}
                   :model/MetabotConversation {conversation-id :id} {:user_id user-id}
                   :model/MetabotMessage      {msg-id :id}          {:conversation_id conversation-id}]
      (t2/insert! :model/MetabotUsedTable {:message_id msg-id :table_id table-id})
      (is (= 1 (t2/count :model/MetabotUsedTable :message_id msg-id)))
      (t2/delete! :model/Table :id table-id)
      (is (zero? (t2/count :model/MetabotUsedTable :message_id msg-id))))))
