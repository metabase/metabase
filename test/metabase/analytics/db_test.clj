(ns metabase.analytics.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.db :as analytics.db]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.query :as mdb.query]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest metric-counts-sum-over-partitions-test
  (let [mp     (mt/metadata-provider)
        metric (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))]
    (mt/with-temp [:model/Collection {c1 :id} {}
                   :model/Collection {c2 :id} {}
                   :model/Collection {c3 :id} {}
                   :model/Card _ {:type :metric, :collection_id c1, :dataset_query metric}
                   :model/Card _ {:type :metric, :collection_id c2, :dataset_query metric}
                   :model/Card _ {:type :metric, :collection_id c2, :dataset_query metric}
                   :model/Card _ {:type :metric, :collection_id c3, :dataset_query metric}]
      (let [collection-ids #{c1 c2 c3}]
        (is (= 4 (analytics.db/unarchived-metric-count-in-collections collection-ids)))
        (with-redefs [mdb.query/select-partition-size 2
                      mdb/select-partition-size       2]
          (is (= 4 (analytics.db/unarchived-metric-count-in-collections collection-ids))))))))
