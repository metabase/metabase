(ns metabase-enterprise.support-access-grants.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.support-access-grants.db :as support-access-grants.db]
   [metabase.test :as mt]))

(deftest user-names-and-emails-partitions-test
  (let [user-ids (map mt/user->id [:rasta :lucky :crowberto :trashbird])
        single   (support-access-grants.db/user-names-and-emails user-ids)]
    (is (= (set user-ids) (set (keys single))))
    (is (= single (mt/with-partition-size 2
                    (support-access-grants.db/user-names-and-emails user-ids))))))
