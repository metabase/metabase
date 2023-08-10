(ns metabase.query-processor.middleware.upgrade-field-literals-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.upgrade-field-literals :as upgrade-field-literals]))

(defn- upgrade-field-literals [query]
  (upgrade-field-literals/upgrade-field-literals query meta/metadata-provider))

(deftest ^:parallel dont-replace-aggregations-test
  (testing "Don't replace field-literals forms with aggregation references"
    (let [query (lib.tu.macros/mbql-query venues
                  {:source-query {:source-table $$checkins
                                  :aggregation  [[:count]]
                                  :breakout     [$checkins.venue-id]}
                   :joins        [{:source-query {:source-table $$venues
                                                  :breakout     [$venues.category-id]}
                                   :fields       :all
                                   :alias        "venues"
                                   :strategy     :inner-join
                                   :condition    [:= *count/Number &venues.*count/Number]}]
                   :order-by     [[:asc $checkins.venue-id]]
                   :limit        3})]
      (is (= (assoc-in query
                       [:query :order-by]
                       [[:asc [:field "VENUE_ID" {:base-type :type/Integer}]]])
             (upgrade-field-literals query))))))

(deftest ^:parallel upgrade-to-valid-clauses-test
  (testing "Make sure upgrades don't result in weird clauses like nested `datetime-field` clauses")
  (let [source-query (lib.tu.macros/mbql-query checkins)]
    (is (= (lib.tu.macros/mbql-query checkins
             {:source-query (:query source-query)
              :aggregation  [[:count]]
              :breakout     [[:field "DATE" {:base-type :type/Date, :temporal-unit :week}]]
              :filter       [:between
                             [:field "DATE" {:base-type :type/Date, :temporal-unit :week}]
                             "2014-02-01T00:00:00-08:00"
                             "2014-05-01T00:00:00-07:00"]})
           (upgrade-field-literals
            (lib.tu.macros/mbql-query nil
              {:source-query (:query source-query)
               :aggregation  [[:count]]
               :breakout     [!week.*DATE/Date]
               :filter       [:between !week.*DATE/Date "2014-02-01T00:00:00-08:00" "2014-05-01T00:00:00-07:00"]}))))))

(deftest ^:parallel support-legacy-filter-clauses-test
  (testing "We should handle legacy usage of `:field` w/ name inside filter clauses against explicit joins (#14809)"
    (let [source-query (lib.tu.macros/mbql-query orders
                         {:joins [{:fields       :all
                                   :source-table $$products
                                   :condition    [:= $product-id &Products.products.id]
                                   :alias        "Products"}]})]
      (is (= (lib.tu.macros/mbql-query orders
               {:source-query (:query source-query)
                :filter       [:=
                               [:field "Products__CATEGORY" {:base-type :type/Text, :join-alias "Products"}]
                               "Widget"]})
             (upgrade-field-literals
              (lib.tu.macros/mbql-query orders
                {:source-query (:query source-query)
                 :filter       [:= *CATEGORY/Text "Widget"]})))))))

(deftest ^:parallel support-legacy-filter-clauses-implicit-joins-test
  (testing "We should handle legacy usage of `:field` w/ name inside filter clauses against implicit joins (#14811)"
    (is (= (lib.tu.macros/mbql-query orders
             {:source-query {:source-table $$orders
                             :aggregation  [[:sum $product-id->products.price]]
                             :breakout     [$product-id->products.category]}
              :filter       [:=
                             [:field "PRODUCTS__via__PRODUCT_ID__CATEGORY" {:base-type :type/Text}]
                             "Widget"]})
           (upgrade-field-literals
            (lib.tu.macros/mbql-query orders
              {:source-query {:source-table $$orders
                              :aggregation  [[:sum $product-id->products.price]]
                              :breakout     [$product-id->products.category]}
               ;; not sure why FE is using `field-literal` here... but it should work anyway.
               :filter       [:= *CATEGORY/Text "Widget"]}))))))

(deftest ^:parallel attempt-case-insensitive-match-test
  (testing "Attempt to fix things even if the name used is the wrong case (#16389)"
    (is (= (lib.tu.macros/mbql-query orders
             {:source-query {:source-table $$orders
                             :aggregation  [[:count]]
                             :breakout     [!month.product-id->products.created-at]}
              :aggregation  [[:sum *count/Integer]]
              :breakout     [[:field "PRODUCTS__via__PRODUCT_ID__CREATED_AT"
                              {:temporal-unit :month
                               :base-type     :type/DateTimeWithLocalTZ}]]
              :limit        1})
           ;; This query is actually broken -- see #19757 -- but since we're nice we'll try to fix it anyway.
           (upgrade-field-literals
            (lib.tu.macros/mbql-query orders
              {:source-query {:source-table $$orders
                              :aggregation  [[:count]]
                              :breakout     [!month.product-id->products.created-at]}
               :aggregation  [[:sum *count/Integer]]
               :breakout     [[:field "created_at" {:base-type :type/DateTimeWithLocalTZ}]]
               :limit        1}))))))

(deftest ^:parallel preserve-namespaced-keys-test
  (let [query {:database             (meta/id)
               :type                 :query
               :query                {:source-table 2}
               :some.namespace/perms {:gtaps #{"/db/3570/schema/PUBLIC/table/41117/query/"}}}]
    (is (= query
           (upgrade-field-literals query)))))

(deftest ^:parallel implicitly-joined-columns-test
  (testing "Don't upgrade field literals that have :source-field"
    (is (= (lib.tu.macros/mbql-query checkins
             {:source-query {:source-table $$checkins
                             :filter       [:> $date "2014-01-01"]}
              :aggregation  [[:count]]
              :order-by     [[:asc $venue-id->venues.price]]
              :breakout     [$venue-id->venues.price]})
           (upgrade-field-literals
            (lib.tu.macros/mbql-query checkins
              {:source-query {:source-table $$checkins
                              :filter       [:> $date "2014-01-01"]}
               :aggregation  [[:count]]
               :order-by     [[:asc $venue-id->venues.price]]
               :breakout     [$venue-id->venues.price]}))))))

#_(deftest ^:parallel upgrade-unmarked-join-fields-test
  (is (= (lib.tu.macros/mbql-query orders
           {:source-query {:source-table $$orders
                           :joins        [{:fields       :all
                                           :source-table $$products
                                           :condition    [:= $product-id &Products.products.id]
                                           :alias        "Products"}]}
            :aggregation  [[:count]]
            :breakout     [[:field "ID" {:base-type :type/BigInteger, :join-alias "Products"}]]})
         (upgrade-field-literals
          (lib.tu.macros/mbql-query orders
            {:source-query {:source-table $$orders
                            :joins        [{:fields       :all
                                            :source-table $$products
                                            :condition    [:= $product-id &Products.products.id]
                                            :alias        "Products"}]}
             :aggregation  [[:count]]
             :breakout     [$products.id]})))))
