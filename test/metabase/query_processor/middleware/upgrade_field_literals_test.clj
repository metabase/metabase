(ns metabase.query-processor.middleware.upgrade-field-literals-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.upgrade-field-literals :as upgrade-field-literals]
            [metabase.test :as mt]))

(defn- upgrade-field-literals [query]
  (-> (mt/test-qp-middleware upgrade-field-literals/upgrade-field-literals query)
      :pre))

(deftest dont-replace-aggregations-test
  (testing "Don't replace field-literals forms with aggregation references"
    (let [source-query    (mt/mbql-query checkins
                            {:aggregation [[:count]]
                             :breakout    [$checkins.venue_id]})
          source-metadata (qp/query->expected-cols source-query)
          query           (mt/mbql-query venues
                            {:source-query    (:query source-query)
                             :source-metadata source-metadata
                             :joins           [(let [source-query    (mt/mbql-query venues
                                                                       {:breakout [$category_id]})
                                                     source-metadata (qp/query->expected-cols source-query)]
                                                 {:fields          :all
                                                  :alias           "venues"
                                                  :strategy        :inner-join
                                                  :condition       [:= *count/Number &venues.*count/Number]
                                                  :source-query    (:query source-query)
                                                  :source-metadata source-metadata})]
                             :order-by        [[:asc $checkins.venue_id]]
                             :limit           3})]
      (is (= query
             (upgrade-field-literals query))))))

(deftest upgrade-to-valid-clauses-test
  (testing "Make sure upgrades don't result in weird clauses like nested `datetime-field` clauses")
  (let [source-query    (mt/mbql-query checkins)
        source-metadata (qp/query->expected-cols source-query)]
    (is (= (mt/mbql-query checkins
             {:aggregation     [[:count]]
              :breakout        [!week.date]
              :filter          [:between !week.date "2014-02-01T00:00:00-08:00" "2014-05-01T00:00:00-07:00"]
              :source-query    source-query
              :source-metadata source-metadata})
           (upgrade-field-literals
            (mt/mbql-query nil
              {:aggregation     [[:count]]
               :breakout        [!week.*DATE/Date]
               :filter          [:between !week.*DATE/Date "2014-02-01T00:00:00-08:00" "2014-05-01T00:00:00-07:00"]
               :source-query    source-query
               :source-metadata source-metadata}))))))

(deftest support-legacy-filter-clauses-test
  (testing "We should handle legacy usage of `:field` w/ name inside filter clauses"
    (mt/dataset sample-dataset
      (testing "against explicit joins (#14809)"
        (let [source-query    (mt/mbql-query orders
                                {:joins [{:fields       :all
                                          :source-table $$products
                                          :condition    [:= $product_id &Products.products.id]
                                          :alias        "Products"}]})
              source-metadata (qp/query->expected-cols source-query)]
          (is (= (mt/mbql-query orders
                   {:source-query    (:query source-query)
                    :source-metadata source-metadata
                    :filter          [:= &Products.products.category "Widget"]})
                 (upgrade-field-literals
                  (mt/mbql-query orders
                    {:source-query    (:query source-query)
                     :source-metadata source-metadata
                     :filter          [:= *CATEGORY/Text "Widget"]}))))))

      (testing "against implicit joins (#14811)"
        (let [source-query    (mt/mbql-query orders
                                {:aggregation [[:sum $product_id->products.price]]
                                 :breakout    [$product_id->products.category]})
              source-metadata (qp/query->expected-cols source-query)]
          (is (= (mt/mbql-query orders
                   {:source-query    (:query source-query)
                    :source-metadata source-metadata
                    :filter          [:= $product_id->products.category "Widget"]})
                 (upgrade-field-literals
                  (mt/mbql-query orders
                    {:source-query    (:query source-query)
                     :source-metadata source-metadata
                     ;; not sure why FE is using `field-literal` here... but it should work anyway.
                     :filter          [:= *CATEGORY/Text "Widget"]})))))))))
