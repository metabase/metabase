(ns metabase-enterprise.library.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library.db :as library.db]
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
  (mt/with-temp [:model/Collection {coll1 :id} {}
                 :model/Collection {coll2 :id} {}
                 :model/Collection {coll3 :id} {}
                 :model/Card       _           {:collection_id coll1 :type :model}
                 :model/Card       _           {:collection_id coll3 :type :metric}
                 :model/Dashboard  _           {:collection_id coll3}]
    (testing "a set from partitions"
      (is (= #{:model :metric}
             (library.db/card-types-in-collections [coll1 coll2 coll3])
             (partitioned! #(library.db/card-types-in-collections [coll1 coll2 coll3]))))
      (is (nil? (partitioned! #(library.db/card-types-in-collections [coll2])))))
    (testing "whether any partition has a row"
      (is (true? (partitioned! #(library.db/dashboard-in-collections? [coll1 coll2 coll3]))))
      (is (false? (partitioned! #(library.db/dashboard-in-collections? [coll1 coll2])))))))
