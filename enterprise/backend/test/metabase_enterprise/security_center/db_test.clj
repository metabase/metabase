(ns metabase-enterprise.security-center.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.db :as security-center.db]
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
  (let [user-ids #{(mt/user->id :rasta) (mt/user->id :crowberto) (mt/user->id :lucky)}]
    (testing "a map from partitions"
      (is (= user-ids
             (set (keys (security-center.db/user-summaries-by-id user-ids)))))
      (is (= (security-center.db/user-summaries-by-id user-ids)
             (partitioned! #(security-center.db/user-summaries-by-id user-ids)))))))
