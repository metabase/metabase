(ns metabase-enterprise.database-routing.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.database-routing.db :as database-routing.db]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]))

(defn- in-small-partitions!
  "What `f` returns when reads take at most two ids per statement."
  [f]
  (with-redefs [mdb.query/select-partition-size 2]
    (f)))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/Database {router :id}      {}
                 :model/Database {destination :id} {:router_database_id router, :name "destination-in-last-partition"}
                 :model/Database {other :id}       {}]
    (testing "a destination is found in whichever partition holds it"
      (let [f #(database-routing.db/destination-database-exists? [router other (mt/id) destination])]
        (is (true? (f)))
        (is (true? (in-small-partitions! f))))
      (let [f #(database-routing.db/destination-name-exists? router ["a" "b" "c" "destination-in-last-partition"])]
        (is (true? (f)))
        (is (true? (in-small-partitions! f))))
      (is (false? (in-small-partitions! #(database-routing.db/destination-name-exists? router ["a" "b" "c"])))))))
