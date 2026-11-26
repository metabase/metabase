(ns metabase-enterprise.dependencies.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
                 (mt/with-partition-size 2 (dependencies.db/card-types-by-id card-ids)))))
        (testing "rows from partitions"
          (is (= (set (map :id (dependencies.db/dependencies-from-entities :card card-ids)))
                 (set (map :id (mt/with-partition-size 2 (dependencies.db/dependencies-from-entities :card card-ids))))))
          (is (= 3 (count (mt/with-partition-size 2 (dependencies.db/dependencies-from-entities :card card-ids))))))
        (testing "a set from partitions"
          (is (= (dependencies.db/internal-remap-field-ids [(mt/id :venues :id) (mt/id :venues :name) (mt/id :venues :price)])
                 (mt/with-partition-size 2 (dependencies.db/internal-remap-field-ids [(mt/id :venues :id)
                                                                                      (mt/id :venues :name)
                                                                                      (mt/id :venues :price)])))))
        (testing "a delete count summed over partitions"
          (is (= 3 (mt/with-partition-size 2 (dependencies.db/delete-dependencies-for-entities! :card card-ids))))
          (is (= [] (dependencies.db/dependencies-from-entities :card card-ids))))))))

(deftest ^:synchronized card-states-lock-in-id-order-test
  (mt/with-temp [:model/Card {card1 :id} {}
                 :model/Card {card2 :id} {}
                 :model/Card {card3 :id} {}]
    (let [ids         [card3 card1 card2]
          locked-ids  (fn [] (t2/with-transaction [_conn nil {:rollback-only true}]
                               (vec (keys (dependencies.db/card-states ids true)))))]
      (testing "rows read and locked in ascending id order"
        (is (= (sort ids) (locked-ids))))
      (testing "partitions taken from ascending ids, each read in id order"
        (is (= (sort ids) (mt/with-partition-size 2 (locked-ids))))))))
