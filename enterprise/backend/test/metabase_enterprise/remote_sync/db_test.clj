(ns metabase-enterprise.remote-sync.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
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
  (let [user-ids [(mt/user->id :rasta) (mt/user->id :crowberto) (mt/user->id :lucky)]]
    (testing "a map from partitions"
      (is (= (set user-ids)
             (set (keys (remote-sync.db/users-by-id user-ids)))
             (set (keys (partitioned! #(remote-sync.db/users-by-id user-ids))))))))
  (mt/with-temp [:model/Collection {coll1 :id :as c1} {}
                 :model/Collection {coll2 :id :as c2} {}
                 :model/Collection {coll3 :id :as c3} {}]
    (testing "a set from partitions"
      (let [eids (mapv :entity_id [c1 c2 c3])]
        (is (= (remote-sync.db/built-in-entity-ids :model/Collection eids)
               (partitioned! #(remote-sync.db/built-in-entity-ids :model/Collection eids))))))
    (testing "rows from partitions"
      (is (= #{coll1 coll2 coll3}
             (set (map :id (partitioned! #(remote-sync.db/rows-not-built-in :model/Collection [coll1 coll2 coll3])))))))))
