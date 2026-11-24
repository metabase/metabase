(ns metabase.transforms-rest.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms-rest.db :as transforms-rest.db]))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/TransformTag {tag1 :id} {}
                 :model/TransformTag {tag2 :id} {}
                 :model/TransformTag {tag3 :id} {}]
    (testing "a set from partitions"
      (is (= #{tag1 tag2 tag3}
             (transforms-rest.db/existing-tag-ids [tag1 tag2 tag3])
             (mt/with-partition-size 2 (transforms-rest.db/existing-tag-ids [tag1 tag2 tag3])))))))
