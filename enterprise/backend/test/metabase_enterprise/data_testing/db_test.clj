(ns metabase-enterprise.data-testing.db-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase.app-db.core :as app-db]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]))

(defn- partitioned!
  "Call `f` with every partition size of the app DB set to 2."
  [f]
  (with-redefs [mdb.query/select-partition-size 2
                app-db/select-partition-size    2
                app-db/delete-partition-size    2
                app-db/update-partition-size    2]
    (f)))

(deftest ^:synchronized reads-over-partitions-test
  (let [later #(t/plus (t/instant) (t/minutes %))]
    (mt/with-temp [:model/Transform     {tf :id}     {}
                   :model/TransformTest {test1 :id}  {:transform_id tf}
                   :model/TransformTest {test2 :id}  {:transform_id tf}
                   :model/TransformTest {test3 :id}  {:transform_id tf}
                   :model/DataTestRun   _            {:test_id test1 :start_time (later 1)}
                   :model/DataTestRun   _            {:test_id test2 :start_time (later 2)}
                   :model/DataTestRun   _            {:test_id test3 :start_time (later 3)}
                   :model/DataTestRun   _            {:test_id test1 :start_time (later 4)}
                   :model/DataTestRun   _            {:test_id test3 :start_time (later 5)}
                   :model/TestSuite     {suite1 :id} {}
                   :model/TestSuite     {suite2 :id} {}
                   :model/TestSuite     {suite3 :id} {}]
      (let [filters {:test-type :transform :test-ids #{test1 test2 test3}}]
        (testing "a page sorted and limited over partitions"
          (is (= (mapv :id (data-testing.db/test-runs filters 2 1))
                 (mapv :id (partitioned! #(data-testing.db/test-runs filters 2 1)))))
          (is (= 2 (count (partitioned! #(data-testing.db/test-runs filters 2 1))))))
        (testing "a count summed over partitions"
          (is (= 5
                 (data-testing.db/test-run-count filters)
                 (partitioned! #(data-testing.db/test-run-count filters)))))
        (testing "the newest run of each test over partitions"
          (is (= (set (map :id (data-testing.db/latest-test-runs :transform #{test1 test2 test3})))
                 (set (map :id (partitioned! #(data-testing.db/latest-test-runs :transform #{test1 test2 test3})))))))
        (testing "rows locked in id order over partitions"
          (is (= (sort [suite1 suite2 suite3])
                 (mapv :id (data-testing.db/test-suites-for-update [suite3 suite1 suite2]))
                 (mapv :id (partitioned! #(data-testing.db/test-suites-for-update [suite3 suite1 suite2]))))))))))
