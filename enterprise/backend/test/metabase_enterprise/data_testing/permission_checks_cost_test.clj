(ns metabase-enterprise.data-testing.permission-checks-cost-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-cost
  "The answers of `check` as `user` for the first `n` rows of `model` with `ids` selected in one request with a
  metadata provider cache, as in a REST request, and the number of queries the checks ran."
  [user model ids check n]
  (request/with-current-user (mt/user->id user)
    (lib-be/with-metadata-provider-cache
      (let [rows (t2/select model :id [:in (take n ids)] {:order-by [[:id :asc]]})]
        (t2/with-call-count [call-count]
          [(mapv check rows) (call-count)])))))

(defn- cost-is-flat
  [user model ids check]
  (check-cost user model ids check 2)
  (let [[two two-count] (check-cost user model ids check 2)
        [all all-count] (check-cost user model ids check (count ids))]
    (testing (str model " " check)
      (is (= two (take 2 all)))
      (is (= (count ids) (count all)))
      (is (= two-count all-count)))))

(defn- table-query
  [table-key]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table-key)))))

(deftest data-test-checks-cost-test
  (testing "checks of TransformTests and CardTests cost the same for two tests as for three"
    (mt/with-premium-features #{:advanced-permissions :transforms-basic :transforms-testing}
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (mt/with-temp [:model/Transform     t1 {:source {:type :query :query (table-query :venues)}
                                                :target {:type "table" :name "test_cost_1" :database (mt/id)}}
                       :model/Transform     t2 {:source {:type :query :query (table-query :users)}
                                                :target {:type "table" :name "test_cost_2" :database (mt/id)}}
                       :model/Transform     t3 {:source {:type :query :query (table-query :checkins)}
                                                :target {:type "table" :name "test_cost_3" :database (mt/id)}}
                       :model/TransformTest x1 {:transform_id (:id t1)}
                       :model/TransformTest x2 {:transform_id (:id t2)}
                       :model/TransformTest x3 {:transform_id (:id t3)}
                       :model/Collection    c1 {}
                       :model/Collection    c2 {}
                       :model/Collection    c3 {}
                       :model/Card          k1 {:collection_id (:id c1) :dataset_query (table-query :venues)}
                       :model/Card          k2 {:collection_id (:id c2) :dataset_query (table-query :users)}
                       :model/Card          k3 {:collection_id (:id c3) :dataset_query (table-query :checkins)}
                       :model/CardTest      y1 {:card_id (:id k1)}
                       :model/CardTest      y2 {:card_id (:id k2)}
                       :model/CardTest      y3 {:card_id (:id k3)}]
          (doseq [check [mi/can-read? mi/can-write?]]
            (cost-is-flat :lucky :model/TransformTest (map :id [x1 x2 x3]) check)
            (cost-is-flat :rasta :model/CardTest (map :id [y1 y2 y3]) check)))))))
