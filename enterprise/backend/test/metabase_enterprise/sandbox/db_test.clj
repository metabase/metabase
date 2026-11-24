(ns metabase-enterprise.sandbox.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.db :as sandbox.db]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]))

(deftest partitioned-reads-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                 :model/Card             {card-a :id}   {}
                 :model/Card             {card-b :id}   {}
                 :model/Sandbox          {sandbox-a :id} {:group_id group-id :table_id (mt/id :venues) :card_id card-a}
                 :model/Sandbox          {sandbox-b :id} {:group_id group-id :table_id (mt/id :users) :card_id card-a}
                 :model/Sandbox          {sandbox-c :id} {:group_id group-id :table_id (mt/id :checkins) :card_id card-b}]
    (let [table-ids (map mt/id [:venues :users :checkins :categories :orders])
          reads     (fn []
                      {:by-card   (update-vals (sandbox.db/sandboxes-using-cards [card-a card-b Integer/MAX_VALUE])
                                               #(set (map :id %)))
                       :by-id     (update-vals (sandbox.db/sandboxes-by-ids [sandbox-a sandbox-b sandbox-c]) :table_id)
                       :databases (sandbox.db/table-database-ids table-ids)})
          single    (reads)]
      (is (= {card-a #{sandbox-a sandbox-b} card-b #{sandbox-c}} (:by-card single)))
      (is (= 3 (count (:by-id single))))
      (is (= 5 (count (:databases single))))
      (is (= single (with-redefs [mdb.query/select-partition-size 2] (reads)))))))
