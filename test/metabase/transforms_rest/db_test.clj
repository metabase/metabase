(ns metabase.transforms-rest.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]
   [metabase.transforms-rest.db :as transforms-rest.db]))

(defn- partitioned!
  "Call `f` with every partition size of the app DB set to 2."
  [f]
  (with-redefs [mdb.query/select-partition-size 2
                mdb/select-partition-size       2
                mdb/delete-partition-size       2
                mdb/update-partition-size       2]
    (f)))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/TransformTag {tag1 :id} {}
                 :model/TransformTag {tag2 :id} {}
                 :model/TransformTag {tag3 :id} {}]
    (testing "a set from partitions"
      (is (= #{tag1 tag2 tag3}
             (transforms-rest.db/existing-tag-ids [tag1 tag2 tag3])
             (partitioned! #(transforms-rest.db/existing-tag-ids [tag1 tag2 tag3])))))))
