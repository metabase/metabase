(ns metabase.transforms.db-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.transforms.db :as transforms.db]))

(deftest ^:synchronized reads-over-partitions-test
  (let [now (t/instant)]
    (mt/with-temp [:model/Transform             {tf1 :id}  {}
                   :model/Transform             {tf2 :id}  {}
                   :model/Transform             {tf3 :id}  {}
                   :model/TransformTag          {tag1 :id} {}
                   :model/TransformTag          {tag2 :id} {}
                   :model/TransformTag          {tag3 :id} {}
                   :model/TransformTransformTag _          {:transform_id tf1 :tag_id tag1 :position 2}
                   :model/TransformTransformTag _          {:transform_id tf2 :tag_id tag2 :position 1}
                   :model/TransformTransformTag _          {:transform_id tf3 :tag_id tag3 :position 0}
                   :model/TransformRun          _          {:transform_id tf1 :start_time (t/minus now (t/hours 2))}
                   :model/TransformRun          {run1 :id} {:transform_id tf1 :start_time (t/minus now (t/hours 1))}
                   :model/TransformRun          {run2 :id} {:transform_id tf2 :start_time now}
                   :model/TransformRun          {run3 :id} {:transform_id tf3 :start_time now}]
      (let [ids [tf1 tf2 tf3]]
        (testing "a map from partitions"
          (is (= (transforms.db/transform-names-by-id ids)
                 (mt/with-partition-size 2 (transforms.db/transform-names-by-id ids)))))
        (testing "a set from partitions"
          (is (= #{tag1 tag2 tag3}
                 (mt/with-partition-size 2 (transforms.db/existing-tag-ids [tag1 tag2 tag3])))))
        (testing "rows ordered across partitions"
          (is (= [0 1 2]
                 (mapv :position (transforms.db/transform-tag-links ids))
                 (mapv :position (mt/with-partition-size 2 (transforms.db/transform-tag-links ids))))))
        (testing "a reducible over partitions"
          (is (= #{run1 run2 run3}
                 (into #{} (map :id) (transforms.db/latest-runs-reducible (set ids)))
                 (mt/with-partition-size 2 (into #{} (map :id) (transforms.db/latest-runs-reducible (set ids)))))))
        (testing "grouped rows from partitions"
          (is (= (into #{} (map (juxt :transform_id :last_start)) (transforms.db/last-start-times ids))
                 (into #{} (map (juxt :transform_id :last_start)) (mt/with-partition-size 2 (transforms.db/last-start-times ids))))))))))
