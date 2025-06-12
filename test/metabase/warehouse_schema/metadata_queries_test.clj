(ns metabase.warehouse-schema.metadata-queries-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.warehouse-schema.metadata-queries :as metadata-queries]))

(defn- ordered-filter [query]
  ;; sort by id [:field id option]
  (update query :filter (fn [filter-clause]
                          (if (#{:and :or} (first filter-clause))
                            (into [(first filter-clause)] (sort-by second (rest filter-clause)))
                            filter-clause))))

(deftest add-required-filter-if-needed-test
  (mt/with-temp
    [:model/Database db               {:engine :h2}
     :model/Table    product          {:name "PRODUCT" :db_id (:id db)}
     :model/Field    _product-id      {:name "ID" :table_id (:id product) :base_type :type/Integer}
     :model/Field    _product-name    {:name "NAME" :table_id (:id product) :base_type :type/Integer}
     :model/Table    buyer            {:name "BUYER" :database_require_filter true :db_id (:id db)}
     :model/Field    buyer-id         {:name "ID" :table_id (:id buyer) :base_type :type/Integer :database_partitioned true}
     :model/Table    order            {:name "ORDER" :database_require_filter true :db_id (:id db)}
     :model/Field    order-id         {:name "ID" :table_id (:id order) :base_type :type/Integer}
     :model/Field    _order-buyer-id  {:name "BUYER_ID" :table_id (:id order) :base_type :type/Integer}
     :model/Field    order-product-id {:name "PRODUCT_ID" :table_id (:id order) :base_type :type/Integer :database_partitioned true}]
    (mt/with-db db
      (testing "no op for tables that do not require filter"
        (let [query (:query (mt/mbql-query product))]
          (is (= query
                 (metadata-queries/add-required-filters-if-needed query)))))

      (testing "if the source table requires a filter, add the partitioned filter"
        (let [query (:query (mt/mbql-query order))]
          (is (= (assoc query
                        :filter [:> [:field (:id order-product-id) {:base-type :type/Integer}] -9223372036854775808])
                 (metadata-queries/add-required-filters-if-needed query)))))

      (testing "if a joined table require a filter, add the partitioned filter"
        (let [query (:query (mt/mbql-query product {:joins [{:source-table (:id order)
                                                             :condition    [:= $order.product_id $product.id]
                                                             :alias        "Product"}]}))]
          (is (= (assoc query
                        :filter [:> [:field (:id order-product-id) {:base-type :type/Integer}] -9223372036854775808])
                 (metadata-queries/add-required-filters-if-needed query)))))

      (testing "if both source tables and joined table require a filter, add both"
        (let [query (:query (mt/mbql-query order {:joins [{:source-table (:id buyer)
                                                           :condition    [:= $order.buyer_id $buyer.id]
                                                           :alias        "BUYER"}]}))]
          (is (= (-> query
                     (assoc :filter [:and
                                     [:> [:field (:id buyer-id) {:base-type :type/Integer}] -9223372036854775808]
                                     [:> [:field (:id order-product-id) {:base-type :type/Integer}] -9223372036854775808]])
                     ordered-filter)
                 (-> query
                     metadata-queries/add-required-filters-if-needed
                     ordered-filter)))))

      (testing "Should add an and clause for existing filter"
        (let [query (:query (mt/mbql-query order {:filter [:> $order.id 1]}))]
          (is (= (-> query
                     (assoc :filter [:and
                                     [:> [:field (:id order-id) nil] 1]
                                     [:> [:field (:id order-product-id) {:base-type :type/Integer}] -9223372036854775808]])
                     ordered-filter)
                 (-> query
                     metadata-queries/add-required-filters-if-needed
                     ordered-filter))))))))
