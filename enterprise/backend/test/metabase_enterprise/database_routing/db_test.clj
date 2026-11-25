(ns metabase-enterprise.database-routing.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.database-routing.db :as database-routing.db]
   [metabase.test :as mt]))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/Database {router :id}      {}
                 :model/Database {destination :id} {:router_database_id router, :name "destination-in-last-partition"}
                 :model/Database {other :id}       {}]
    (testing "a destination is found in whichever partition holds it"
      (let [f #(database-routing.db/destination-database-exists? [router other (mt/id) destination])]
        (is (true? (f)))
        (is (true? (mt/with-partition-size 2 (f)))))
      (let [f #(database-routing.db/destination-name-exists? router ["a" "b" "c" "destination-in-last-partition"])]
        (is (true? (f)))
        (is (true? (mt/with-partition-size 2 (f)))))
      (is (false? (mt/with-partition-size 2 (database-routing.db/destination-name-exists? router ["a" "b" "c"])))))))
