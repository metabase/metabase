(ns metabase.transforms.models.permission-checks-cost-test
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
  "Lucky's answers of `check` for the first `n` rows of `model` with `ids` selected in one request with a metadata
  provider cache, as in a REST request, and the number of queries the checks ran."
  [model ids check n]
  (request/with-current-user (mt/user->id :lucky)
    (lib-be/with-metadata-provider-cache
      (let [rows (t2/select model :id [:in (take n ids)] {:order-by [[:id :asc]]})]
        (t2/with-call-count [call-count]
          [(mapv check rows) (call-count)])))))

(defn- cost-is-flat
  [model ids check]
  (check-cost model ids check 2)
  (let [[two two-count] (check-cost model ids check 2)
        [all all-count] (check-cost model ids check (count ids))]
    (testing (str model " " check)
      (is (= two (take 2 all)))
      (is (= (count ids) (count all)))
      (is (= two-count all-count)))))

(defn- table-source
  [table-key]
  (let [mp (mt/metadata-provider)]
    {:type :query :query (lib/query mp (lib.metadata/table mp (mt/id table-key)))}))

(deftest transform-checks-cost-test
  (testing "a data analyst's checks of Transforms, their runs and their tags cost the same for two rows as for three"
    (mt/with-premium-features #{:advanced-permissions :transforms-basic}
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (mt/with-temp [:model/Transform             t1 {:source (table-source :venues)
                                                        :target {:type "table" :name "cost_test_1" :database (mt/id)}}
                       :model/Transform             t2 {:source (table-source :users)
                                                        :target {:type "table" :name "cost_test_2" :database (mt/id)}}
                       :model/Transform             t3 {:source (table-source :checkins)
                                                        :target {:type "table" :name "cost_test_3" :database (mt/id)}}
                       :model/TransformRun          r1 {:transform_id (:id t1)}
                       :model/TransformRun          r2 {:transform_id (:id t2)}
                       :model/TransformRun          r3 {:transform_id (:id t3)}
                       :model/TransformTag          g1 {}
                       :model/TransformTag          g2 {}
                       :model/TransformTag          g3 {}
                       :model/TransformTransformTag _ {:transform_id (:id t1) :tag_id (:id g1) :position 0}
                       :model/TransformTransformTag _ {:transform_id (:id t2) :tag_id (:id g2) :position 0}
                       :model/TransformTransformTag _ {:transform_id (:id t3) :tag_id (:id g3) :position 0}]
          (doseq [check [mi/can-read? mi/can-write?]]
            (cost-is-flat :model/Transform (map :id [t1 t2 t3]) check))
          (cost-is-flat :model/TransformRun (map :id [r1 r2 r3]) mi/can-read?)
          (cost-is-flat :model/TransformTag (map :id [g1 g2 g3]) mi/can-write?))))))
