(ns metabase-enterprise.replacement.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.db :as replacement.db]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]))

(defn- partitioned!
  "Call `f` with every partition size of the app DB set to 2."
  [f]
  (with-redefs [mdb.query/select-partition-size 2
                mdb/select-partition-size       2
                mdb/delete-partition-size       2
                mdb/update-partition-size       2]
    (f)))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/Card {card1 :id} {}
                 :model/Card {card2 :id} {}
                 :model/Card {card3 :id} {:table_id (mt/id :venues)}]
    (testing "whether any partition has a row"
      (is (true? (partitioned! #(replacement.db/card-with-table-exists? #{card1 card2 card3} (mt/id :venues)))))
      (is (false? (partitioned! #(replacement.db/card-with-table-exists? #{card1 card2} (mt/id :venues)))))
      (is (= (replacement.db/active-fk-to-fields-exists? #{(mt/id :users :id) (mt/id :categories :id) (mt/id :venues :id)})
             (partitioned! #(replacement.db/active-fk-to-fields-exists? #{(mt/id :users :id)
                                                                          (mt/id :categories :id)
                                                                          (mt/id :venues :id)})))))
    (testing "rows from partitions"
      (is (= #{card1 card2 card3}
             (set (map :id (partitioned! #(replacement.db/rows :model/Card [card1 card2 card3])))))))))
