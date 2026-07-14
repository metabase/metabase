(ns metabase.explorations.query-plan.context-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- count-metric-query []
  (lib/->legacy-MBQL
   (let [mp (mt/metadata-provider)]
     (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
         (lib/aggregate (lib/count))))))

(deftest per-block-context-scopes-applicability-test
  (testing "metric-and-dim-context returns one entry per block, with applicability scoped to that block's dims"
    (mt/with-temp [:model/Card metric {:type :metric :name "Revenue"
                                       :dataset_query (count-metric-query)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :price)]}
                      {:dimension_id "d2" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :name)]}]
            ;; Two blocks sharing the same metric. Block A pairs it with d1 only;
            ;; block B with d2 only — even though the metric's dimension_mappings
            ;; resolve BOTH dims. Applicability must stay within each block.
            block-a  {:id 1
                      :metrics    [{:card_id cid :dimension_mappings mappings}]
                      :dimensions [{:dimension_id "d1" :display_name "Price"
                                    :effective_type :type/Number}]}
            block-b  {:id 2
                      :metrics    [{:card_id cid :dimension_mappings mappings}]
                      :dimensions [{:dimension_id "d2" :display_name "Name"
                                    :effective_type :type/Text}]}
            result   (qp.context/metric-and-dim-context [block-a block-b])
            blocks   (:blocks result)
            [ba bb]  blocks]
        (is (= 2 (count blocks)) "one context entry per block")
        (is (= [1 2] (map :block-id blocks)) "block-id carried through")
        (is (= ["Revenue" "Revenue"] (map :name blocks))
            "block name is computed from the metric Card (both blocks share the metric)")
        (testing "the shared metric is hydrated in both blocks"
          (is (= [cid] (map :metric-id (:metrics ba))))
          (is (= [cid] (map :metric-id (:metrics bb))))
          (is (= cid (-> ba :metrics first :card :id))
              "metric Card is hydrated (not just referenced)"))
        (testing "applicability is scoped to each block's own dimensions"
          (is (= #{"d1"} (set (keys (get-in ba [:applicability cid])))))
          (is (= #{"d2"} (set (keys (get-in bb [:applicability cid]))))))
        (testing "each block's :dimensions list is its own"
          (is (= ["d1"] (map :dimension-id (:dimensions ba))))
          (is (= ["d2"] (map :dimension-id (:dimensions bb)))))))))

(deftest build-row-context-resolves-from-block-test
  (testing "build-row-context resolves the dim target + snapshot from the row's page's block (not per-thread tables)"
    (mt/with-temp [:model/Card metric {:type :metric :dataset_query (count-metric-query)}
                   :model/Exploration e {:name "x"}
                   :model/ExplorationThread t {:exploration_id (:id e)}]
      (let [cid      (:id metric)
            mappings [{:dimension_id "d1" :table_id (mt/id :venues)
                       :target ["field" {} (mt/id :venues :price)]}]
            block    (first (t2/insert-returning-instances!
                             :model/ExplorationBlock
                             {:exploration_thread_id (:id t)
                              :metrics               [{:card_id cid :dimension_mappings mappings}]
                              :dimensions            [{:dimension_id "d1" :display_name "Price"
                                                       :effective_type "type/Number"}]
                              :position              0}))
            page-id  (t2/insert-returning-pk! :model/ExplorationPage
                                              {:exploration_block_id (:id block)
                                               :card_id              cid
                                               :dimension_id         "d1"
                                               :query_type           "default"})
            row      {:card_id cid :dimension_id "d1" :page_id page-id :params {}}
            ctx      (qp.context/build-row-context row)]
        (is (some? ctx))
        (is (some? (:target ctx)) "dimension target resolved from the block's metric mappings")
        (is (= "Price" (:dim-label ctx)))
        (is (= "d1" (-> ctx :dim :dimension_id)))
        (is (= :type/Number (-> ctx :dim :effective_type)) "dim type keywordized by the model transform")))))
