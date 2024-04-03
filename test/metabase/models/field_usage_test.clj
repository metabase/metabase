(ns metabase.models.field-usage-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.models.field-usage :as field-usage]
   [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(deftest pmbql->field-usages-test
  (testing "pmbql->field-usages should find filter, breakout, aggregation, expression in all stages and joins of a query"
   (mt/with-temp [:model/Card join-card {:dataset_query (mt/mbql-query products
                                                                       {:filter [:= $products.category "Gizmo"]})}
                  :model/Card base-card {:dataset_query (mt/mbql-query orders
                                                                       {:filter      [:> $orders.product_id 1]
                                                                        :breakout    [!month.orders.created_at
                                                                                      [:field (mt/id :orders :quantity) {:binning {:num-bins 50 :strategy :num-bins}}]]
                                                                        :aggregation [:sum $orders.tax]
                                                                        :expressions {"exp" [:+ $orders.total 1]}
                                                                        :joins       [{:fields       "all",
                                                                                       :source-table (format "card__%d" (:id join-card))
                                                                                       :condition    [:= $orders.product_id &product.products.id]
                                                                                       :alias        "product"}]})}
                  :model/Card card      {:dataset_query (mt/mbql-query
                                                         nil
                                                         {:source-table (format "card__%d" (:id base-card))
                                                          :aggregation  [:sum [:field "sum" {:base-type :type/Integer}]]
                                                          :filter       [:between $orders.created_at "2019-01-01" "2019-12-31"]})}]
     (mt/with-metadata-provider (mt/id)
       (let [query (:dataset_query card)
             pmbql (->> query
                        (lib/query (qp.store/metadata-provider))
                        fetch-source-query/resolve-source-cards)]
         (is (= #{;; from join-card
                  {:used_in                :filter
                   :field_id               (mt/id :products :category)
                   :filter_op              :=
                   :filter_args            ["Gizmo"]}
                  ;; from base-card
                  {:used_in                :filter
                   :field_id               (mt/id :orders :product_id)
                   :filter_op              :>
                   :filter_args            [1]}
                  {:used_in                :breakout
                   :field_id               (mt/id :orders :created_at)
                   :breakout_temporal_unit :month,
                   :breakout_binning       nil}
                  {:used_in                :breakout
                   :field_id               (mt/id :orders :quantity)
                   :breakout_temporal_unit nil
                   :breakout_binning       {:strategy :num-bins
                                            :num-bins 50}}
                  {:used_in                :aggregation
                   :field_id               (mt/id :orders :tax)
                   :aggregation_function   :sum}
                  {:used_in                :expression
                   :field_id               (mt/id :orders :total)}
                  ;; from top level card
                  {:used_in                :filter
                   :field_id               (mt/id :orders :created_at)
                   :filter_op              :between
                   :filter_args            ["2019-01-01" "2019-12-31"]}}
                (set (field-usage/pmbql->field-usages pmbql)))))))))
