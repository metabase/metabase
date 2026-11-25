(ns metabase-enterprise.serialization.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.db :as serialization.db]
   [metabase.test :as mt]))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/Collection {coll1 :id} {}
                 :model/Collection {coll2 :id} {:location (str "/" coll1 "/")}
                 :model/Collection {coll3 :id} {:location (str "/" coll1 "/" coll2 "/")}
                 :model/Collection {coll4 :id} {}
                 :model/Card       {card1 :id :as card} {:collection_id coll1}
                 :model/Card       {card2 :id} {:collection_id coll2}
                 :model/Card       {card3 :id} {:collection_id coll4}
                 :model/Card       {card4 :id} {}]
    (testing "a set over partitions of both lists"
      (is (= #{card1 card2}
             (serialization.db/card-ids-in-collections [card1 card2 card3 card4] [coll1 coll2 coll3])
             (mt/with-partition-size 2 (serialization.db/card-ids-in-collections [card1 card2 card3 card4] [coll1 coll2 coll3])))))
    (testing "a subtree as a union over partitions"
      (is (= #{coll1 coll2 coll3 coll4}
             (serialization.db/collection-subtree-ids [coll1 coll4 coll2] false)
             (mt/with-partition-size 2 (serialization.db/collection-subtree-ids [coll1 coll4 coll2] false)))))
    (testing "a map from partitions"
      (is (= {(:entity_id card) card1}
             (select-keys (mt/with-partition-size 2 (serialization.db/entity-id->pk :model/Card [(:entity_id card)]))
                          [(:entity_id card)])))
      (is (= #{card1 card2 card3}
             (mt/with-partition-size 2 (serialization.db/existing-ids :model/Card [card1 card2 card3])))))))
