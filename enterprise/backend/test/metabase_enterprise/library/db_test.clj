(ns metabase-enterprise.library.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library.db :as library.db]
   [metabase.test :as mt]))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/Collection {coll1 :id} {}
                 :model/Collection {coll2 :id} {}
                 :model/Collection {coll3 :id} {}
                 :model/Card       _           {:collection_id coll1 :type :model}
                 :model/Card       _           {:collection_id coll3 :type :metric}
                 :model/Dashboard  _           {:collection_id coll3}]
    (testing "a set from partitions"
      (is (= #{:model :metric}
             (library.db/card-types-in-collections [coll1 coll2 coll3])
             (mt/with-partition-size 2 (library.db/card-types-in-collections [coll1 coll2 coll3]))))
      (is (nil? (mt/with-partition-size 2 (library.db/card-types-in-collections [coll2])))))
    (testing "whether any partition has a row"
      (is (true? (mt/with-partition-size 2 (library.db/dashboard-in-collections? [coll1 coll2 coll3]))))
      (is (false? (mt/with-partition-size 2 (library.db/dashboard-in-collections? [coll1 coll2])))))))
