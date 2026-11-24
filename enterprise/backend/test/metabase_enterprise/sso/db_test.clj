(ns metabase-enterprise.sso.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sso.db :as sso.db]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]))

(deftest group-ids-by-name-partitions-test
  (mt/with-temp [:model/PermissionsGroup {group-a :id name-a :name} {}
                 :model/PermissionsGroup {group-b :id name-b :name} {}]
    (let [names  #{name-a name-b "no such group" "nor this one" "nor that one"}
          single (sso.db/group-ids-by-name names)]
      (is (= #{group-a group-b} single))
      (is (= single (with-redefs [mdb.query/select-partition-size 2] (sso.db/group-ids-by-name names)))))))
