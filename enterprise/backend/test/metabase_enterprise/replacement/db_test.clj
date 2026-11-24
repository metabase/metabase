(ns metabase-enterprise.replacement.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.db :as replacement.db]
   [metabase.test :as mt]))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/Card {card1 :id} {}
                 :model/Card {card2 :id} {}
                 :model/Card {card3 :id} {:table_id (mt/id :venues)}]
    (testing "whether any partition has a row"
      (is (true? (mt/with-partition-size 2 (replacement.db/card-with-table-exists? #{card1 card2 card3} (mt/id :venues)))))
      (is (false? (mt/with-partition-size 2 (replacement.db/card-with-table-exists? #{card1 card2} (mt/id :venues)))))
      (is (= (replacement.db/active-fk-to-fields-exists? #{(mt/id :users :id) (mt/id :categories :id) (mt/id :venues :id)})
             (mt/with-partition-size 2 (replacement.db/active-fk-to-fields-exists? #{(mt/id :users :id)
                                                                                     (mt/id :categories :id)
                                                                                     (mt/id :venues :id)})))))
    (testing "rows from partitions"
      (is (= #{card1 card2 card3}
             (set (map :id (mt/with-partition-size 2 (replacement.db/rows :model/Card [card1 card2 card3])))))))))
