(ns metabase.explorations.query-plan.variants-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.variants :as variants]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- products-count-card
  "Hand-built `:card` ctx — a count metric on PRODUCTS. The variant only
  reads `:id` (for the discovery cache key) and `:dataset_query`, so no real
  Card row is needed."
  [card-id]
  {:id            card-id
   :dataset_query (lib/->legacy-MBQL
                   (-> (lib/query (mt/metadata-provider)
                                  (lib.metadata/table (mt/metadata-provider) (mt/id :products)))
                       (lib/aggregate (lib/count))))})

(defn- category-target []
  [:field (mt/id :products :category) nil])

(def ^:private category-dim
  {:dimension_id   "d-category"
   :display_name   "Category"
   :effective_type :type/Text
   :semantic_type  :type/Category})

(defn- run-top-n-other [{:keys [card-id k]}]
  (let [ctx {:mp      (mt/metadata-provider)
             :card    (products-count-card card-id)
             :target  (category-target)
             :dim     category-dim
             :segment nil
             :params  {:k k}}
        q   (variants/dataset-query "top-n-other" ctx)]
    (-> (qp/process-query q) :data :rows vec)))

(deftest top-n-other-row-order-test
  (testing "top-n-other sorts non-Other rows by metric desc and pins (Other) last,
            even when (Other) has the largest metric value."
    ;; Sample PRODUCTS counts: Widget 54, Gadget 53, Gizmo 51, Doohickey 42.
    ;; With k=2 the top buckets are Widget/Gadget; (Other) rollup = Gizmo+Doohickey = 93.
    (is (= [["Widget" 54] ["Gadget" 53] ["(Other)" 93]]
           (run-top-n-other {:card-id 9000001 :k 2}))))
  (testing "when k >= distinct dim values, no (Other) row appears — just the dim values
            sorted by metric desc."
    (is (= [["Widget" 54] ["Gadget" 53] ["Gizmo" 51] ["Doohickey" 42]]
           (run-top-n-other {:card-id 9000002 :k 4})))))
