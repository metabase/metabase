(ns metabase-enterprise.dependencies.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- partitioned!
  "Call `f` with every partition size of the app DB set to 2."
  [f]
  (with-redefs [mdb.query/select-partition-size 2
                mdb/select-partition-size       2
                mdb/delete-partition-size       2
                mdb/update-partition-size       2]
    (f)))

(deftest ^:synchronized reads-and-deletes-over-partitions-test
  (mt/with-temp [:model/Card {card1 :id} {:type :question}
                 :model/Card {card2 :id} {:type :model}
                 :model/Card {card3 :id} {:type :metric}]
    (let [card-ids [card1 card2 card3]]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (t2/delete! :model/Dependency :from_entity_type :card :from_entity_id [:in card-ids])
        (t2/insert! :model/Dependency (for [card-id card-ids]
                                        {:from_entity_type :card :from_entity_id card-id
                                         :to_entity_type   :table :to_entity_id (mt/id :venues)}))
        (testing "a map from partitions"
          (is (= {card1 :question card2 :model card3 :metric}
                 (dependencies.db/card-types-by-id card-ids)
                 (partitioned! #(dependencies.db/card-types-by-id card-ids)))))
        (testing "rows from partitions"
          (is (= (set (map :id (dependencies.db/dependencies-from-entities :card card-ids)))
                 (set (map :id (partitioned! #(dependencies.db/dependencies-from-entities :card card-ids))))))
          (is (= 3 (count (partitioned! #(dependencies.db/dependencies-from-entities :card card-ids))))))
        (testing "a set from partitions"
          (is (= (dependencies.db/internal-remap-field-ids [(mt/id :venues :id) (mt/id :venues :name) (mt/id :venues :price)])
                 (partitioned! #(dependencies.db/internal-remap-field-ids [(mt/id :venues :id)
                                                                           (mt/id :venues :name)
                                                                           (mt/id :venues :price)])))))
        (testing "a delete count summed over partitions"
          (is (= 3 (partitioned! #(dependencies.db/delete-dependencies-for-entities! :card card-ids))))
          (is (= [] (dependencies.db/dependencies-from-entities :card card-ids))))))))
