(ns metabase.models.field-usage-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.models.field-usage :as field-usage]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(defn- query->preprocessed-pmbql
  [query]
  (->> query
       qp.preprocess/preprocess
       (lib/query (qp.store/metadata-provider))))

(deftest pmbql->field-usages-test
  (testing "pmbql->field-usages should find filter, breakout, aggregation, expression in all stages and joins of a query"
    (mt/with-temp [:model/Card join-card {:dataset_query (mt/mbql-query products
                                                                        {:filter [:= $products.category "Gizmo"]})}
                   :model/Card base-card {:dataset_query (mt/mbql-query orders
                                                                        {:filter      [:> $orders.product_id 1]
                                                                         :breakout    [!month.orders.created_at
                                                                                       [:field (mt/id :orders :quantity) {:binning {:num-bins  50
                                                                                                                                    :strategy :num-bins
                                                                                                                                    :bin-width 2.0}}]]
                                                                         :aggregation [:sum $orders.tax]
                                                                         :expressions {"exp" [:+ $orders.total 1]}
                                                                         :joins       [{:fields       "all",
                                                                                        :source-table (format "card__%d" (:id join-card))
                                                                                        :condition    [:= $orders.product_id &product.products.id]
                                                                                        :alias        "product"}]})}]
      (mt/with-metadata-provider (mt/id)
        (let [query (mt/mbql-query
                     nil
                     {:source-table (format "card__%d" (:id base-card))
                      ;; these clause against "sum" columns shouldn't be returned
                      :aggregation  [:avg [:field "sum" {:base-type :type/Integer}]]
                      :breakout     [:field "sum" {:base-type :type/Integer}]
                      :expression   {"avg" [:avg [:field "sum" {:base-type :type/Integer}]]}
                      :filter       [:and
                                     [:> [:field "sum" {:base-type :type/Integer}] 1]
                                     [:>= $orders.created_at "2019-01-01"]]})]
          (is (= #{;; from join-card
                   {:used_in                    :filter
                    :field_id                   (mt/id :products :category)
                    :filter_op                  :=}
                   ;; from base-card
                   {:used_in                    :filter
                    :field_id                   (mt/id :orders :product_id)
                    :filter_op                  :>}
                   {:used_in                    :breakout
                    :field_id                   (mt/id :orders :created_at)
                    :breakout_temporal_unit     :month
                    :breakout_binning_strategy  nil
                    :breakout_binning_bin_width nil
                    :breakout_binning_num_bins  nil}
                   {:used_in                    :breakout
                    :field_id                   (mt/id :orders :quantity)
                    :breakout_temporal_unit     nil
                    :breakout_binning_strategy  :num-bins
                    :breakout_binning_bin_width 2.0
                    :breakout_binning_num_bins  50}
                   {:used_in                    :aggregation
                    :field_id                   (mt/id :orders :tax)
                    :aggregation_function       :sum}
                   {:used_in                    :expression
                    :field_id                   (mt/id :orders :total)}
                   ;; from top level card
                   {:used_in                    :filter
                    :field_id                   (mt/id :orders :created_at)
                    :filter_op                  :>=}}
                 (set (field-usage/pmbql->field-usages (query->preprocessed-pmbql query))))))))))
