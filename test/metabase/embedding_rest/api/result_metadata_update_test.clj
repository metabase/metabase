(ns metabase.embedding-rest.api.result-metadata-update-test
  "Tests to verify that result_metadata UPDATEs on report_card are not fired spuriously
   during dashcard query execution via the embed endpoint."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.results-metadata :as qp.results-metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest aggregation-fingerprints-change-with-different-filters-test
  (testing "Aggregation columns (count, sum, etc.) have no backing Field, so their fingerprints are
            computed from result rows. When the query itself changes (different filter baked in),
            different rows produce different fingerprints and result_metadata is updated.
            This demonstrates the mechanism that causes thrashing when combined with parameterized queries."
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query orders
                                                      {:aggregation [[:count] [:sum $total]]
                                                       :breakout    [$product_id]})
                                     :result_metadata nil}]
      (let [card-id (:id card)
            update-count (atom 0)
            run-with-param!
            (fn [product-id]
              (binding [api/*current-user-id* (mt/user->id :rasta)
                        api/*current-user-permissions-set* (delay #{"/"})]
                (let [card (t2/select-one :model/Card :id card-id)]
                  (qp.store/with-metadata-provider (:database_id card)
                    (qp.results-metadata/store-previous-result-metadata! card)
                    (let [query (assoc (mt/mbql-query orders
                                         {:aggregation [[:count] [:sum $total]]
                                          :breakout    [$product_id]
                                          :filter      [:= $product_id product-id]})
                                       :info {:executed-by (mt/user->id :rasta)
                                              :context     :question
                                              :card-id     card-id})]
                      (qp/process-query (qp/userland-query query))))))
              (t2/select-one-fn :result_metadata :model/Card :id card-id))]
        ;; First run establishes baseline metadata
        (run-with-param! 1)
        (reset! update-count 0)
        ;; Second run with different filter — metadata should update because the query changed
        (let [meta-before (t2/select-one-fn :result_metadata :model/Card :id card-id)]
          (run-with-param! 50)
          (let [meta-after (t2/select-one-fn :result_metadata :model/Card :id card-id)]
            (testing "result_metadata updates because the query itself changed (different filter)"
              (is (not= meta-before meta-after)
                  "result_metadata should update when the query changes"))
            (testing "Specifically, the aggregation columns have different fingerprints"
              (let [agg-fp (fn [meta] (->> meta
                                           (filter #(nil? (:id %)))
                                           (mapv (juxt :name :fingerprint))))]
                (is (not= (agg-fp meta-before) (agg-fp meta-after))
                    "Aggregation column fingerprints should differ for different queries")))))
        ;; Third run with original filter — metadata updates again
        (let [meta-before (t2/select-one-fn :result_metadata :model/Card :id card-id)]
          (run-with-param! 1)
          (let [meta-after (t2/select-one-fn :result_metadata :model/Card :id card-id)]
            (testing "result_metadata updates again when query reverts to original filter"
              (is (not= meta-before meta-after)
                  "result_metadata should update when the query changes back"))))))))

(deftest parameterized-aggregation-queries-do-not-thrash-result-metadata-test
  (testing "When parameters are applied via :parameters (as in embed dashcard queries), the fix prevents
            result_metadata thrashing on aggregation columns by stripping computed fingerprints from the comparison."
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query orders
                                                      {:aggregation [[:count] [:sum $total]]
                                                       :breakout    [$product_id]})
                                     :result_metadata nil}]
      (let [card-id (:id card)
            run-with-parameters!
            (fn [product-id]
              (binding [api/*current-user-id* (mt/user->id :rasta)
                        api/*current-user-permissions-set* (delay #{"/"})]
                (let [card (t2/select-one :model/Card :id card-id)]
                  (qp.store/with-metadata-provider (:database_id card)
                    (qp.results-metadata/store-previous-result-metadata! card)
                    (let [query (-> (mt/mbql-query orders
                                      {:aggregation [[:count] [:sum $total]]
                                       :breakout    [$product_id]})
                                   ;; Parameters applied via :parameters, as the embed dashcard path does
                                    (assoc :parameters [{:type   :id
                                                         :target [:dimension (mt/$ids orders $product_id)]
                                                         :value  [product-id]}])
                                    (assoc :info {:executed-by (mt/user->id :rasta)
                                                  :context     :question
                                                  :card-id     card-id}))]
                      (qp/process-query (qp/userland-query query))))))
              (t2/select-one-fn :result_metadata :model/Card :id card-id))]
        ;; First run establishes baseline metadata
        (run-with-parameters! 1)
        ;; Second run with different parameter — should NOT thrash because the fix strips
        ;; computed fingerprints from the comparison
        (let [meta-before (t2/select-one-fn :result_metadata :model/Card :id card-id)]
          (run-with-parameters! 50)
          (let [meta-after (t2/select-one-fn :result_metadata :model/Card :id card-id)]
            (testing "result_metadata should NOT change when only aggregation fingerprints differ"
              (is (= meta-before meta-after)
                  "result_metadata should not thrash for parameterized queries with aggregation columns"))))
        ;; Third run with original parameter — still should not change
        (let [meta-before (t2/select-one-fn :result_metadata :model/Card :id card-id)]
          (run-with-parameters! 1)
          (let [meta-after (t2/select-one-fn :result_metadata :model/Card :id card-id)]
            (testing "result_metadata remains stable across parameter changes"
              (is (= meta-before meta-after)
                  "result_metadata should remain stable"))))))))
