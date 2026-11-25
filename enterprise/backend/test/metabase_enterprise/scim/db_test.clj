(ns metabase-enterprise.scim.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.scim.db :as scim.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest user-ids-by-entity-ids-partitions-test
  (mt/with-temp [:model/User {user-a :id} {}
                 :model/User {user-b :id} {}
                 :model/User {user-c :id} {}]
    (let [entity-ids (into (vec (t2/select-fn-vec :entity_id :model/User :id [:in [user-a user-b user-c]]))
                           ["no-such-entity" "nor-this"])
          single     (scim.db/user-ids-by-entity-ids entity-ids)]
      (is (= #{user-a user-b user-c} single))
      (is (= single (mt/with-partition-size 2 (scim.db/user-ids-by-entity-ids entity-ids))))
      (is (nil? (mt/with-partition-size 2 (scim.db/user-ids-by-entity-ids ["a" "b" "c"])))))))
