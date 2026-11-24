(ns metabase.cache.db-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.cache.db :as cache.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest invalidations-and-lookups-over-partitions-test
  (mt/with-temp [:model/Dashboard {d1 :id} {}
                 :model/Dashboard {d2 :id} {}
                 :model/Dashboard {d3 :id} {}]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [model+ids [["dashboard" d1] ["dashboard" d2] ["dashboard" d3]]]
        (doseq [[model model-id] model+ids]
          (t2/insert! :model/CacheConfig {:model model, :model_id model-id, :strategy :ttl, :config {:multiplier 1, :min_duration_ms 1}}))
        (is (= 3 (mt/with-partition-size 2 (cache.db/invalidate-cache-configs! model+ids (t/offset-date-time)))))
        (is (= 3 (t2/count :model/CacheConfig :model "dashboard" :model_id [:in [d1 d2 d3]] :invalidated_at [:not= nil])))
        (is (= (cache.db/dashboard-collection-ids [d1 d2 d3])
               (mt/with-partition-size 2 (cache.db/dashboard-collection-ids [d1 d2 d3]))))
        (is (contains? #{d1 d2 d3} (:id (mt/with-partition-size 2 (cache.db/dashboard-with-ids [d1 d2 d3])))))))))
