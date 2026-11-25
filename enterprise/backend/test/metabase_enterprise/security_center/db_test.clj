(ns metabase-enterprise.security-center.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.db :as security-center.db]
   [metabase.test :as mt]))

(deftest ^:synchronized reads-over-partitions-test
  (let [user-ids #{(mt/user->id :rasta) (mt/user->id :crowberto) (mt/user->id :lucky)}]
    (testing "a map from partitions"
      (is (= user-ids
             (set (keys (security-center.db/user-summaries-by-id user-ids)))))
      (is (= (security-center.db/user-summaries-by-id user-ids)
             (mt/with-partition-size 2 (security-center.db/user-summaries-by-id user-ids)))))))
