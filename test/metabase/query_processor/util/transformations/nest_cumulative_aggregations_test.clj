(ns metabase.query-processor.util.transformations.nest-cumulative-aggregations-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.util.transformations.nest-cumulative-aggregations :as qp.util.transformations.nest-cumulative-aggregations]))

(deftest ^:parallel no-op-no-breakouts-test
  (testing "Do not change query if there are no breakouts."
    (let [metadata-provider meta/metadata-provider
          users             (lib.metadata/table metadata-provider (meta/id :users))
          users-id          (lib.metadata/field metadata-provider (meta/id :users :id))
          query             (-> (lib/query metadata-provider users)
                                (lib/aggregate (lib/cum-sum users-id)))]
      (is (= query
             (qp.util.transformations.nest-cumulative-aggregations/nest-cumulative-aggregations query))))))

(deftest ^:parallel nest-cumulative-aggregations-test
  (let [metadata-provider meta/metadata-provider
        orders            (lib.metadata/table metadata-provider (meta/id :orders))
        orders-created-at (lib.metadata/field metadata-provider (meta/id :orders :created-at))
        orders-total      (lib.metadata/field metadata-provider (meta/id :orders :total))
        query             (-> (lib/query metadata-provider orders)
                              ;; 1. created at -- month
                              (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                              ;; 2. cumulative count of orders
                              (lib/aggregate (lib/cum-count))
                              ;; 3. cumulative sum of order total
                              (lib/aggregate (lib/cum-sum orders-total))
                              ;; 4. sum of order total
                              (lib/aggregate (lib/sum orders-total)))]
    (is (=? {:lib/type :mbql/query
             :stages   [ ;; original final stage should be rewritten to return non-cumulative aggregations
                        {:source-table (meta/id :orders)
                         :breakout     [[:field {:temporal-unit :month} (meta/id :orders :created-at)]]
                         :aggregation  [[:count {}]
                                        [:sum {} [:field {} (meta/id :orders :total)]]
                                        [:sum {} [:field {} (meta/id :orders :total)]]]}
                        ;; add a new stage to do cumulative sum of the non-cumulative aggregations.
                        {:breakout [[:field
                                     {:temporal-unit (symbol "nil #_\"key is not present.\"")
                                      :name          "CREATED_AT"}
                                     "CREATED_AT"]
                                    [:field {:name "__cumulative_count"} "count"]
                                    [:field {:name "__cumulative_sum"} "sum"]
                                    [:field {:name "sum_2"} "sum_2"]]
                         :order-by [[:asc {} [:field
                                              {:temporal-unit (symbol "nil #_\"key is not present.\"")}
                                              "CREATED_AT"]]
                                    [:asc {} [:field {} "count"]]
                                    [:asc {} [:field {} "sum"]]
                                    [:asc {} [:field {} "sum_2"]]]
                         :aggregation [[:cum-sum {:name "count"} [:field {} "count"]]
                                       [:cum-sum {:name "sum"} [:field {} "sum"]]]}
                        ;; add a second new stage to restore the original column order
                        {:fields [[:field
                                   {:temporal-unit (symbol "nil #_\"key is not present.\"")}
                                   "CREATED_AT"]
                                  [:field {} "count"]
                                  [:field {} "sum"]
                                  [:field {} "sum_2"]]}]}
            (qp.util.transformations.nest-cumulative-aggregations/nest-cumulative-aggregations query)))))

(deftest ^:parallel nest-cumulative-aggregations-test-2
  (let [metadata-provider meta/metadata-provider
        users             (lib.metadata/table metadata-provider (meta/id :users))
        users-id          (lib.metadata/field metadata-provider (meta/id :users :id))
        query             (-> (lib/query metadata-provider users)
                              (lib/breakout users-id)
                              (lib/aggregate (lib/cum-sum users-id)))]
    (is (=? {:lib/type :mbql/query
             :stages   [ ;; original final stage should be rewritten to return non-cumulative aggregations
                        {:source-table (meta/id :users)
                         :breakout     [[:field {} (meta/id :users :id)]]
                         :aggregation  [[:sum {} [:field {} (meta/id :users :id)]]]}
                        ;; add a new stage to do cumulative sum of the non-cumulative aggregations.
                        {:breakout    [[:field
                                        {:temporal-unit (symbol "nil #_\"key is not present.\"")
                                         :name          "ID"}
                                        "ID"]
                                       [:field {:name "__cumulative_sum"} "sum"]]
                         :order-by    [[:asc {} [:field
                                                 {:temporal-unit (symbol "nil #_\"key is not present.\"")
                                                  :name          "ID"}
                                                 "ID"]]
                                       [:asc {} [:field {:name "__cumulative_sum"} "sum"]]]
                         :aggregation [[:cum-sum {:name "sum"} [:field {} "sum"]]]}
                        ;; add a second new stage to restore the original column order
                        {:fields [[:field {} "ID"]
                                  [:field {} "sum"]]}]}
            (qp.util.transformations.nest-cumulative-aggregations/nest-cumulative-aggregations query)))))

(deftest ^:parallel nest-cumulative-aggregations-in-stage-that-is-not-last-stage-test
  (testing "Should correctly update stages that are not the last stage"
    (let [metadata-provider meta/metadata-provider
          users             (lib.metadata/table metadata-provider (meta/id :users))
          users-id          (lib.metadata/field metadata-provider (meta/id :users :id))
          query             (-> (lib/query metadata-provider users)
                                (lib/breakout users-id)
                                (lib/aggregate (lib/cum-sum users-id))
                                lib/append-stage)]
      (is (=? {:lib/type :mbql/query
               :stages   [;; original final stage should be rewritten to return non-cumulative aggregations
                          {:source-table (meta/id :users)
                           :breakout     [[:field {} (meta/id :users :id)]]
                           :aggregation  [[:sum {} [:field {} (meta/id :users :id)]]]}
                        ;; add a new stage to do cumulative sum of the non-cumulative aggregations.
                          {:breakout    [[:field
                                          {:temporal-unit (symbol "nil #_\"key is not present.\"")
                                           :name          "ID"}
                                          "ID"]
                                         [:field {:name "__cumulative_sum"} "sum"]]
                           :order-by    [[:asc {} [:field
                                                   {:temporal-unit (symbol "nil #_\"key is not present.\"")
                                                    :name          "ID"}
                                                   "ID"]]
                                         [:asc {} [:field {:name "__cumulative_sum"} "sum"]]]
                           :aggregation [[:cum-sum {:name "sum"} [:field {} "sum"]]]}
                        ;; add a second new stage to restore the original column order
                          {:fields [[:field {} "ID"]
                                    [:field {} "sum"]]}
                        ;; the original last stage
                          {}]}
              (qp.util.transformations.nest-cumulative-aggregations/nest-cumulative-aggregations query))))))

(deftest ^:parallel update-multiple-stages-test
  (testing "Should correctly update multiple stages with cumulative aggregations"
    (let [metadata-provider meta/metadata-provider
          users             (lib.metadata/table metadata-provider (meta/id :users))
          users-id          (lib.metadata/field metadata-provider (meta/id :users :id))
          query             (-> (lib/query metadata-provider users)
                                (lib/breakout users-id)
                                (lib/aggregate (lib/cum-sum users-id))
                                lib/append-stage)
          cols              (lib/returned-columns query)
          id-col            (m/find-first #(= (:lib/desired-column-alias %) "ID")
                                          cols)
          _                 (assert (map? id-col))
          sum-col           (m/find-first #(= (:lib/desired-column-alias %) "sum")
                                          cols)
          _                 (assert (map? sum-col))
          query             (-> query
                                lib/append-stage
                                (lib/breakout id-col)
                                (lib/aggregate (lib/cum-sum sum-col)))]
      (is (=? {:lib/type :mbql/query
               :stages   [{:source-table (meta/id :users)
                           :breakout     [[:field {} (meta/id :users :id)]]
                           :aggregation  [[:sum {} [:field {} (meta/id :users :id)]]]}
                          {:breakout    [[:field {} "ID"]
                                         [:field {:name "__cumulative_sum"} "sum"]]
                           :order-by    [[:asc {} [:field {} "ID"]]
                                         [:asc {} [:field {:name "__cumulative_sum"} "sum"]]]
                           :aggregation [[:cum-sum {:name "sum"} [:field {} "sum"]]]}
                          {:fields [[:field {} "ID"]
                                    [:field {} "sum"]]}
                          {}
                          {:breakout     [[:field {} "ID"]]
                           :aggregation  [[:sum {} [:field {} "sum"]]]}
                          {:breakout    [[:field {} "ID"]
                                         [:field {:name "__cumulative_sum"} "sum"]]
                           :order-by    [[:asc {} [:field {} "ID"]]
                                         [:asc {} [:field {:name "__cumulative_sum"} "sum"]]]
                           :aggregation [[:cum-sum {:name "sum"} [:field {} "sum"]]]}
                          {:fields [[:field {} "ID"]
                                    [:field {} "sum"]]}]}
              (qp.util.transformations.nest-cumulative-aggregations/nest-cumulative-aggregations query))))))
