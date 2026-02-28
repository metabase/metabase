(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel swap-source-in-query-table->table-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/with-fields [(meta/field-metadata :orders :id)
                                    (meta/field-metadata :orders :created-at)]))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query (lib-be/swap-source-in-query upgraded-query
                                                   {:type :table, :id (meta/id :orders)}
                                                   {:type :table, :id (meta/id :products)})]
    (testing "should preserve id-based field refs when upgrading"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields       [[:field {} (meta/id :orders :id)]
                                        [:field {} (meta/id :orders :created-at)]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should preserve id-based field refs when swapping"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :fields       [[:field {} (meta/id :products :id)]
                                        [:field {} (meta/id :products :created-at)]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-card->card-test
  (let [orders-query  (lib/query meta/metadata-provider (meta/table-metadata :orders))
        reviews-query (lib/query meta/metadata-provider (meta/table-metadata :reviews))
        mp            (-> meta/metadata-provider
                          (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
                          (lib.tu/metadata-provider-with-card-from-query 2 reviews-query))
        query          (-> (lib/query mp (lib.metadata/card mp 1))
                           (lib/with-fields [(meta/field-metadata :orders :id)
                                             (meta/field-metadata :orders :created-at)]))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :card, :id 1}
                                                    {:type :card, :id 2})]
    (testing "should convert id-based field refs to name-based field refs when upgrading"
      (is (=? {:stages [{:source-card 1
                         :fields      [[:field {} "ID"]
                                       [:field {} "CREATED_AT"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should change source-card and preserve name-based refs when swapping"
      (is (=? {:stages [{:source-card 2
                         :fields      [[:field {} "ID"]
                                       [:field {} "CREATED_AT"]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-card->table-test
  (let [orders-query   (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp             (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
        query          (-> (lib/query mp (lib.metadata/card mp 1))
                           (lib/with-fields [(meta/field-metadata :orders :id)
                                             (meta/field-metadata :orders :created-at)]))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :card, :id 1}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should convert id-based field refs to name-based field refs when upgrading"
      (is (=? {:stages [{:source-card 1
                         :fields      [[:field {} "ID"]
                                       [:field {} "CREATED_AT"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should swap source-card with source-table and convert name-based refs to id-based refs"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :fields       [[:field {} (meta/id :reviews :id)]
                                        [:field {} (meta/id :reviews :created-at)]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-table->card-test
  (let [reviews-query  (lib/query meta/metadata-provider (meta/table-metadata :reviews))
        mp             (lib.tu/metadata-provider-with-card-from-query 1 reviews-query)
        query          (-> (lib/query mp (meta/table-metadata :orders))
                           (lib/with-fields [(meta/field-metadata :orders :id)
                                             (meta/field-metadata :orders :created-at)]))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :card, :id 1})]
    (testing "should preserve id-based field refs when upgrading"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields       [[:field {} (meta/id :orders :id)]
                                        [:field {} (meta/id :orders :created-at)]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should swap source-table with source-card and convert to name-based refs"
      (is (=? {:stages [{:source-card 1
                         :fields      [[:field {} "ID"]
                                       [:field {} "CREATED_AT"]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-all-clauses-test
  (let [query          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/with-fields [(meta/field-metadata :orders :id)
                                             (meta/field-metadata :orders :created-at)])
                           (lib/join (meta/table-metadata :products))
                           (lib/expression "double-id" (lib/+ (meta/field-metadata :orders :id)
                                                              (meta/field-metadata :orders :id)))
                           (lib/aggregate (lib/sum (meta/field-metadata :orders :id)))
                           (lib/breakout (meta/field-metadata :orders :created-at))
                           (lib/order-by (meta/field-metadata :orders :created-at)))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should preserve id-based field refs when upgrading"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields       [[:field {} (meta/id :orders :id)]
                                        [:field {} (meta/id :orders :created-at)]
                                        [:expression {} "double-id"]]
                         :joins        [{:stages [{:source-table (meta/id :products)}]
                                         :conditions [[:= {}
                                                       [:field {} (meta/id :orders :product-id)]
                                                       [:field {:join-alias "Products"} (meta/id :products :id)]]]}]
                         :expressions  [[:+ {:lib/expression-name "double-id"}
                                         [:field {} (meta/id :orders :id)]
                                         [:field {} (meta/id :orders :id)]]]
                         :aggregation  [[:sum {} [:field {} (meta/id :orders :id)]]]
                         :breakout     [[:field {} (meta/id :orders :created-at)]]
                         :order-by     [[:asc {} [:field {} (meta/id :orders :created-at)]]]}]}
              upgraded-query)))
    (testing "should swap orders refs to reviews refs and preserve products refs"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :fields       [[:field {} (meta/id :reviews :id)]
                                        [:field {} (meta/id :reviews :created-at)]
                                        [:expression {} "double-id"]]
                         :joins        [{:stages [{:source-table (meta/id :products)}]
                                         :conditions [[:= {}
                                                       [:field {} (meta/id :reviews :product-id)]
                                                       [:field {:join-alias "Products"} (meta/id :products :id)]]]}]
                         :expressions  [[:+ {:lib/expression-name "double-id"}
                                         [:field {} (meta/id :reviews :id)]
                                         [:field {} (meta/id :reviews :id)]]]
                         :aggregation  [[:sum {} [:field {} (meta/id :reviews :id)]]]
                         :breakout     [[:field {} (meta/id :reviews :created-at)]]
                         :order-by     [[:asc {} [:field {} (meta/id :reviews :created-at)]]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-join-filter-table->table-test
  (let [query          (as-> (lib/query meta/metadata-provider (meta/table-metadata :products)) q
                         (lib/join q (meta/table-metadata :orders))
                         (lib/filter q (lib/not-null (m/find-first #(= (:name %) "PRODUCT_ID") (lib/filterable-columns q)))))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should preserve id-based field refs when upgrading"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :joins   [{:stages [{:source-table (meta/id :orders)}]
                                    :conditions [[:= {}
                                                  [:field {} (meta/id :products :id)]
                                                  [:field {:join-alias "Orders"} (meta/id :orders :product-id)]]]}]
                         :filters [[:not-null {} [:field {:join-alias "Orders"} (meta/id :orders :product-id)]]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should swap orders to reviews in join and update joined column refs"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :joins   [{:stages [{:source-table (meta/id :reviews)}]
                                    :conditions [[:= {}
                                                  [:field {} (meta/id :products :id)]
                                                  [:field {:join-alias "Orders"} (meta/id :reviews :product-id)]]]}]
                         :filters [[:not-null {} [:field {:join-alias "Orders"} (meta/id :reviews :product-id)]]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-join-filter-table->card-test
  (let [reviews-query  (lib/query meta/metadata-provider (meta/table-metadata :reviews))
        mp             (lib.tu/metadata-provider-with-card-from-query 1 reviews-query)
        query          (as-> (lib/query mp (meta/table-metadata :products)) q
                         (lib/join q (meta/table-metadata :orders))
                         (lib/filter q (lib/not-null (m/find-first #(= (:name %) "PRODUCT_ID") (lib/filterable-columns q)))))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :card, :id 1})]
    (testing "should preserve id-based field refs when upgrading"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :joins   [{:stages [{:source-table (meta/id :orders)}]
                                    :conditions [[:= {}
                                                  [:field {} (meta/id :products :id)]
                                                  [:field {:join-alias "Orders"} (meta/id :orders :product-id)]]]}]
                         :filters [[:not-null {} [:field {:join-alias "Orders"} (meta/id :orders :product-id)]]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should swap orders join to card with name-based refs and preserve products refs"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :joins   [{:stages [{:source-card 1}]
                                    :conditions [[:= {}
                                                  [:field {} (meta/id :products :id)]
                                                  [:field {:join-alias "Orders"} "PRODUCT_ID"]]]}]
                         :filters [[:not-null {} [:field {:join-alias "Orders"} "PRODUCT_ID"]]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-identity-expression-test
  (let [query          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/expression "created-at-expr" (meta/field-metadata :orders :created-at)))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should preserve id-based ref and :lib/expression-name when upgrading"
      (is (=? {:stages [{:expressions [[:field {:lib/expression-name "created-at-expr"}
                                        (meta/id :orders :created-at)]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should convert to id-based ref and preserve :lib/expression-name when swapping"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :expressions  [[:field {:lib/expression-name "created-at-expr"}
                                         (meta/id :reviews :created-at)]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-implicit-join-test
  (let [query          (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) q
                         (lib/filter q (lib/= (m/find-first #(= (:name %) "CATEGORY") (lib/filterable-columns q)) "Widget")))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should preserve IDs for implicit join columns when upgrading"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :filters [[:= {}
                                    [:field {:source-field (meta/id :orders :product-id)}
                                     (meta/id :products :category)]
                                    "Widget"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should change source-field when swapping"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :filters [[:= {}
                                    [:field {:source-field (meta/id :reviews :product-id)}
                                     (meta/id :products :category)]
                                    "Widget"]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-implicit-join-table->card-test
  (let [reviews-query  (lib/query meta/metadata-provider (meta/table-metadata :reviews))
        mp             (lib.tu/metadata-provider-with-card-from-query 1 reviews-query)
        query          (as-> (lib/query mp (meta/table-metadata :orders)) q
                         (lib/filter q (lib/= (m/find-first #(= (:name %) "CATEGORY") (lib/filterable-columns q)) "Widget")))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :card, :id 1})]
    (testing "should preserve IDs for implicit join columns when upgrading"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :filters [[:= {}
                                    [:field {:source-field (meta/id :orders :product-id)}
                                     (meta/id :products :category)]
                                    "Widget"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should swap source-table to source-card and change source-field"
      (is (=? {:stages [{:source-card 1
                         :filters [[:= {}
                                    [:field {:source-field (meta/id :reviews :product-id)}
                                     (meta/id :products :category)]
                                    "Widget"]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-implicit-join-card->table-test
  (let [orders-query   (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp             (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
        query          (as-> (lib/query mp (lib.metadata/card mp 1)) q
                         (lib/filter q (lib/= (m/find-first #(= (:name %) "CATEGORY") (lib/filterable-columns q)) "Widget")))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :card, :id 1}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should preserve IDs for implicit join columns when upgrading"
      (is (=? {:stages [{:source-card 1
                         :filters [[:= {}
                                    [:field {:source-field (meta/id :orders :product-id)}
                                     (meta/id :products :category)]
                                    "Widget"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should swap source-card to source-table and change source-field"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :filters [[:= {}
                                    [:field {:source-field (meta/id :reviews :product-id)}
                                     (meta/id :products :category)]
                                    "Widget"]]}]}
              swapped-query)))))

(defn- filter-all-columns
  "Add a not-null filter for every filterable column in the query."
  [query]
  (reduce (fn [q col] (lib/filter q (lib/not-null col)))
          query
          (lib/filterable-columns query)))

(deftest ^:parallel swap-source-in-query-multi-stage-test
  (let [query          (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) q
                         (lib/aggregate q (lib/sum (meta/field-metadata :orders :id)))
                         (lib/breakout q (meta/field-metadata :orders :created-at))
                         (lib/append-stage q)
                         (filter-all-columns q))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :products)})]
    (testing "should preserve id-based refs in first stage and name-based refs in second stage"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :aggregation  [[:sum {} [:field {} (meta/id :orders :id)]]]
                         :breakout     [[:field {} (meta/id :orders :created-at)]]}
                        {:filters [[:not-null {} [:field {} "CREATED_AT"]]
                                   [:not-null {} [:field {} "sum"]]]}]}
              upgraded-query)))
    (testing "should swap first stage to new table id-based refs and preserve name-based refs in second stage"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :aggregation  [[:sum {} [:field {} (meta/id :products :id)]]]
                         :breakout     [[:field {} (meta/id :products :created-at)]]}
                        {:filters [[:not-null {} [:field {} "CREATED_AT"]]
                                   [:not-null {} [:field {} "sum"]]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-multi-stage-temporal-breakouts-test
  (let [query          (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) q
                         (lib/aggregate q (lib/sum (meta/field-metadata :orders :id)))
                         (lib/breakout q (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :year))
                         (lib/breakout q (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month))
                         (lib/append-stage q)
                         (filter-all-columns q))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :products)})]
    (testing "should preserve id-based refs in first stage and name-based refs in second stage"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :aggregation  [[:sum {} [:field {} (meta/id :orders :id)]]]
                         :breakout     [[:field {:temporal-unit :year} (meta/id :orders :created-at)]
                                        [:field {:temporal-unit :month} (meta/id :orders :created-at)]]}
                        {:filters [[:not-null {} [:field {} "CREATED_AT"]]
                                   [:not-null {} [:field {} "CREATED_AT_2"]]
                                   [:not-null {} [:field {} "sum"]]]}]}
              upgraded-query)))
    (testing "should swap first stage to new table id-based refs and preserve name-based refs in second stage"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :aggregation  [[:sum {} [:field {} (meta/id :products :id)]]]
                         :breakout     [[:field {:temporal-unit :year} (meta/id :products :created-at)]
                                        [:field {:temporal-unit :month} (meta/id :products :created-at)]]}
                        {:filters [[:not-null {} [:field {} "CREATED_AT"]]
                                   [:not-null {} [:field {} "CREATED_AT_2"]]
                                   [:not-null {} [:field {} "sum"]]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-deduplicated-name-test
  (let [query          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/join (meta/table-metadata :products))
                           lib/append-stage
                           (lib/filter (lib/not-null (lib/ensure-uuid [:field {:base-type :type/BigInteger} "ID_2"]))))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should upgrade second stage deduplicated ref to canonical name"
      (is (=? {:stages [{:source-table (meta/id :orders)}
                        {:filters [[:not-null {} [:field {} "Products__ID"]]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should swap orders refs to reviews refs and preserve deduplicated names"
      (is (=? {:stages [{:source-table (meta/id :reviews)}
                        {:filters [[:not-null {} [:field {} "Products__ID"]]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-nonexistent-source-field-test
  (let [field-ref      (lib/ensure-uuid [:field {:base-type    :type/Text
                                                 :source-field Integer/MAX_VALUE}
                                         (meta/id :products :category)])
        query          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/filter (lib/ensure-uuid [:= {} field-ref "Widget"])))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should preserve non-existent source-field when upgrading"
      (is (=? {:stages [{:filters [[:= {}
                                    [:field {:source-field Integer/MAX_VALUE}
                                     (meta/id :products :category)]
                                    "Widget"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should preserve non-existent source-field when swapping"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :filters [[:= {}
                                    [:field {:source-field Integer/MAX_VALUE}
                                     (meta/id :products :category)]
                                    "Widget"]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-field-id-wrong-table-test
  (let [field-ref      (lib/ensure-uuid [:field {:base-type :type/DateTimeWithLocalTZ}
                                         (meta/id :people :created-at)])
        query          (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                           (lib/filter (lib/not-null field-ref)))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :products)}
                                                    {:type :table, :id (meta/id :orders)})]
    (testing "should preserve the wrong table field id when upgrading"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :filters [[:not-null {} [:field {} (meta/id :people :created-at)]]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should preserve the wrong table field id when swapping"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :filters [[:not-null {} [:field {} (meta/id :people :created-at)]]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-nonexistent-field-id-test
  (let [query          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/with-fields [(lib/ensure-uuid [:field {:base-type :type/Integer} Integer/MAX_VALUE])]))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should preserve non-existent field id when upgrading"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields [[:field {} Integer/MAX_VALUE]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should preserve non-existent field id when swapping"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :fields [[:field {} Integer/MAX_VALUE]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-query-nonexistent-field-name-test
  (let [query          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/with-fields [(lib/ensure-uuid [:field {:base-type :type/Text} "DOES_NOT_EXIST"])]))
        upgraded-query (lib-be/upgrade-field-refs-in-query query)
        swapped-query  (lib-be/swap-source-in-query upgraded-query
                                                    {:type :table, :id (meta/id :orders)}
                                                    {:type :table, :id (meta/id :reviews)})]
    (testing "should preserve non-existent field name when upgrading"
      (is (=? {:stages [{:source-table (meta/id :orders)
                         :fields [[:field {} "DOES_NOT_EXIST"]]}]}
              upgraded-query)))
    (testing "should return an identical query if upgrade is not needed"
      (is (= upgraded-query (lib-be/upgrade-field-refs-in-query upgraded-query))))
    (testing "should preserve non-existent field name when swapping"
      (is (=? {:stages [{:source-table (meta/id :reviews)
                         :fields [[:field {} "DOES_NOT_EXIST"]]}]}
              swapped-query)))))

(deftest ^:parallel swap-source-in-parameter-target-implicit-join-test
  (let [query           (lib/query meta/metadata-provider (meta/table-metadata :orders))
        category-col    (m/find-first #(= "CATEGORY" (:name %)) (lib/filterable-columns query))
        target          [:dimension (lib/->legacy-MBQL (lib/ref category-col))]
        upgraded-target (lib-be/upgrade-field-ref-in-parameter-target query target)
        swapped-target  (lib-be/swap-source-in-parameter-target query target
                                                                {:type :table, :id (meta/id :orders)}
                                                                {:type :table, :id (meta/id :reviews)})]
    (testing "should not change implicit join target when upgrading"
      (is (=? [:dimension [:field (meta/id :products :category) {:source-field (meta/id :orders :product-id)}]]
              upgraded-target)))
    (testing "should return an identical target if upgrade is not needed"
      (is (= upgraded-target (lib-be/upgrade-field-ref-in-parameter-target query upgraded-target))))
    (testing "should swap :source-field to reviews.product-id"
      (is (=? [:dimension [:field (meta/id :products :category) {:source-field (meta/id :reviews :product-id)}]]
              swapped-target)))))

(deftest ^:parallel swap-source-in-parameter-target-card-implicit-join-test
  (let [orders-query    (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp              (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
        query           (lib/query mp (lib.metadata/card mp 1))
        category-col    (m/find-first #(= "CATEGORY" (:name %)) (lib/filterable-columns query))
        target          [:dimension (lib/->legacy-MBQL (lib/ref category-col))]
        upgraded-target (lib-be/upgrade-field-ref-in-parameter-target query target)
        swapped-target  (lib-be/swap-source-in-parameter-target query target
                                                                {:type :card, :id 1}
                                                                {:type :table, :id (meta/id :reviews)})]
    (testing "should not change implicit join target when upgrading"
      (is (=? [:dimension [:field (meta/id :products :category) {:source-field (meta/id :orders :product-id)}]]
              upgraded-target)))
    (testing "should return an identical target if upgrade is not needed"
      (is (= upgraded-target (lib-be/upgrade-field-ref-in-parameter-target query upgraded-target))))
    (testing "should swap :source-field to reviews.product-id"
      (is (=? [:dimension [:field (meta/id :products :category) {:source-field (meta/id :reviews :product-id)}]]
              swapped-target)))))

(deftest ^:parallel swap-source-in-parameter-target-table->card-implicit-join-test
  (let [reviews-query   (lib/query meta/metadata-provider (meta/table-metadata :reviews))
        mp              (lib.tu/metadata-provider-with-card-from-query 1 reviews-query)
        query           (lib/query mp (meta/table-metadata :orders))
        category-col    (m/find-first #(= "CATEGORY" (:name %)) (lib/filterable-columns query))
        target          [:dimension (lib/->legacy-MBQL (lib/ref category-col))]
        upgraded-target (lib-be/upgrade-field-ref-in-parameter-target query target)
        swapped-target  (lib-be/swap-source-in-parameter-target query target
                                                                {:type :table, :id (meta/id :orders)}
                                                                {:type :card, :id 1})]
    (testing "should not change implicit join target when upgrading"
      (is (=? [:dimension [:field (meta/id :products :category) {:source-field (meta/id :orders :product-id)}]]
              upgraded-target)))
    (testing "should return an identical target if upgrade is not needed"
      (is (= upgraded-target (lib-be/upgrade-field-ref-in-parameter-target query upgraded-target))))
    (testing "should swap :source-field to reviews.product-id"
      (is (=? [:dimension [:field (meta/id :products :category) {:source-field (meta/id :reviews :product-id)}]]
              swapped-target)))))

(deftest ^:parallel swap-source-in-parameter-target-card->table-implicit-join-test
  (let [orders-query    (lib/query meta/metadata-provider (meta/table-metadata :orders))
        mp              (lib.tu/metadata-provider-with-card-from-query 1 orders-query)
        query           (lib/query mp (lib.metadata/card mp 1))
        category-col    (m/find-first #(= "CATEGORY" (:name %)) (lib/filterable-columns query))
        target          [:dimension (lib/->legacy-MBQL (lib/ref category-col))]
        upgraded-target (lib-be/upgrade-field-ref-in-parameter-target query target)
        swapped-target  (lib-be/swap-source-in-parameter-target query target
                                                                {:type :card, :id 1}
                                                                {:type :table, :id (meta/id :reviews)})]
    (testing "should not change implicit join target when upgrading"
      (is (=? [:dimension [:field (meta/id :products :category) {:source-field (meta/id :orders :product-id)}]]
              upgraded-target)))
    (testing "should return an identical target if upgrade is not needed"
      (is (= upgraded-target (lib-be/upgrade-field-ref-in-parameter-target query upgraded-target))))
    (testing "should swap :source-field to reviews.product-id"
      (is (=? [:dimension [:field (meta/id :products :category) {:source-field (meta/id :reviews :product-id)}]]
              swapped-target)))))
