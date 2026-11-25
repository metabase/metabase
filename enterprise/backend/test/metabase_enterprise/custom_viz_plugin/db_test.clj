(ns metabase-enterprise.custom-viz-plugin.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.db :as custom-viz-plugin.db]
   [metabase.test :as mt]))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/CustomVizPlugin {id1 :id} {:identifier "partitioned!-a" :display_name "a" :status :active}
                 :model/CustomVizPlugin {id2 :id} {:identifier "partitioned!-b" :display_name "b" :status :active}
                 :model/CustomVizPlugin {id3 :id} {:identifier "partitioned!-c" :display_name "c" :status :active}]
    (let [ids [id3 id1 id2]]
      (testing "rows over partitions"
        (is (= (sort-by :id (custom-viz-plugin.db/synced-custom-viz-plugin-items ids))
               (sort-by :id (mt/with-partition-size 2 (custom-viz-plugin.db/synced-custom-viz-plugin-items ids)))))
        (is (= #{id1 id2 id3}
               (set (map :id (mt/with-partition-size 2 (custom-viz-plugin.db/synced-custom-viz-plugin-items ids)))))))
      (testing "bundle hashes over partitions"
        (is (= {id1 nil id2 nil id3 nil}
               (custom-viz-plugin.db/plugin-bundle-hashes ids)
               (mt/with-partition-size 2 (custom-viz-plugin.db/plugin-bundle-hashes ids)))))
      (testing "a map from partitions"
        (is (= #{id1 id2 id3}
               (set (keys (mt/with-partition-size 2 (custom-viz-plugin.db/non-blob-plugins-by-ids [id1 id2 id3])))))))
      (testing "a delete count summed over partitions"
        (is (= 3 (mt/with-partition-size 2 (custom-viz-plugin.db/delete-plugins! [id1 id2 id3]))))))))
