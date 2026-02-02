(ns metabase.lib.validate-test
  (:require
   [clojure.test :refer [deftest ^:parallel is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel find-bad-refs-with-source-table-test
  (testing "invalidl query of a table returns error with table as source"
    (let [mp meta/metadata-provider
          query (-> (lib/query mp (meta/table-metadata :orders))
                    (lib/filter (lib/= (meta/field-metadata :orders :user-id) 1)))
          bad-query (assoc-in query [:stages 0 :filters 0 2 2] "missingcol")
          errors (lib/find-bad-refs-with-source bad-query)]
      (is (= 1 (count errors)))
      (is (= {:type :missing-column
              :source-entity-type :table
              :source-entity-id (meta/id :orders)
              :name "missingcol"}
             (first errors))))))

(deftest ^:parallel find-bad-refs-with-source-card-test
  (testing "invalid query of a card returns error with card as source"
    (let [mp meta/metadata-provider
          base-query (lib/query mp (meta/table-metadata :products))
          mp (lib.tu/metadata-provider-with-card-from-query mp 101 base-query)
          card (lib/query mp {:lib/type :metadata/card :id 101})
          query (-> card
                    (lib/filter (lib/= (m/find-first #(= (:name %) "CATEGORY")
                                                     (lib/returned-columns card))
                                       "Widget")))
          bad-query (assoc-in query [:stages 0 :filters 0 2 2] "missingcol")
          errors (lib/find-bad-refs-with-source bad-query)]
      (is (= 1 (count errors)))
      (is (= {:type :missing-column
              :source-entity-type :card
              :source-entity-id 101
              :name "missingcol"}
             (first errors))))))

(deftest ^:parallel find-bad-refs-with-source-join-test
  (testing "invalid query with join returns error with joined table as source"
    (let [mp meta/metadata-provider
          orders (meta/table-metadata :orders)
          products (meta/table-metadata :products)
          base-query (lib/query mp orders)
          join-clause (-> (lib/join-clause products)
                          (lib/with-join-conditions
                           [(lib/= (meta/field-metadata :orders :product-id)
                                   (meta/field-metadata :products :id))])
                          (lib/with-join-fields :all))
          query (lib/join base-query join-clause)
          joined-cols (filter #(= (:lib/source %) :source/joins)
                              (lib/returned-columns query))
          joined-col (m/find-first #(= (:name %) "CATEGORY") joined-cols)
          filter-query (lib/filter query (lib/= joined-col "Widget"))
          bad-query (assoc-in filter-query [:stages 0 :filters 0 2 2] "missingcol")
          errors (lib/find-bad-refs-with-source bad-query)]
      (is (= 1 (count errors)))
      (is (= {:type :missing-column
              :source-entity-type :table
              :source-entity-id (meta/id :products)
              :name "missingcol"}
             (first errors))))))

(deftest ^:parallel find-bad-refs-with-source-join-card-test
  (testing "invalid query with join to a card returns error with joined card as source"
    (let [mp meta/metadata-provider
          card-query (lib/query mp (meta/table-metadata :products))
          mp (lib.tu/metadata-provider-with-card-from-query mp 101 card-query)
          orders (meta/table-metadata :orders)
          base-query (lib/query mp orders)
          card-metadata (lib.metadata/card mp 101)
          join-clause (-> (lib/join-clause card-metadata)
                          (lib/with-join-conditions
                           [(lib/= (meta/field-metadata :orders :product-id)
                                   (m/find-first #(= (:name %) "ID")
                                                 (lib/returned-columns (lib/query mp card-metadata))))])
                          (lib/with-join-fields :all))
          query (lib/join base-query join-clause)
          joined-cols (filter #(= (:lib/source %) :source/joins)
                              (lib/returned-columns query))
          joined-col (m/find-first #(= (:name %) "CATEGORY") joined-cols)
          filter-query (lib/filter query (lib/= joined-col "Widget"))
          bad-query (assoc-in filter-query [:stages 0 :filters 0 2 2] "missingcol")
          errors (lib/find-bad-refs-with-source bad-query)]
      (is (= 1 (count errors)))
      (is (= {:type :missing-column
              :source-entity-type :card
              :source-entity-id 101
              :name "missingcol"}
             (first errors))))))

(deftest ^:parallel find-bad-refs-with-source-multiple-joins-test
  (testing "invalid query with joins to both table and card returns errors with both source types"
    (let [mp meta/metadata-provider
          ;; Create a card from people table
          card-query (lib/query mp (meta/table-metadata :people))
          mp (lib.tu/metadata-provider-with-card-from-query mp 101 card-query)
          ;; Base query on orders
          orders (meta/table-metadata :orders)
          base-query (lib/query mp orders)
          ;; Join 1: products table
          products (meta/table-metadata :products)
          products-join (-> (lib/join-clause products)
                            (lib/with-join-conditions
                             [(lib/= (meta/field-metadata :orders :product-id)
                                     (meta/field-metadata :products :id))])
                            (lib/with-join-fields :all))
          ;; Join 2: people card
          card-metadata (lib.metadata/card mp 101)
          card-join (-> (lib/join-clause card-metadata)
                        (lib/with-join-conditions
                         [(lib/= (meta/field-metadata :orders :user-id)
                                 (m/find-first #(= (:name %) "ID")
                                               (lib/returned-columns (lib/query mp card-metadata))))])
                        (lib/with-join-fields :all))
          query (-> base-query
                    (lib/join products-join)
                    (lib/join card-join))
          joined-cols (filter #(= (:lib/source %) :source/joins)
                              (lib/returned-columns query))
          ;; Get a column from each join
          products-col (m/find-first #(= (:name %) "CATEGORY") joined-cols)
          people-col (m/find-first #(= (:name %) "EMAIL") joined-cols)
          ;; Add filters using both joined columns
          filter-query (-> query
                           (lib/filter (lib/= products-col "Widget"))
                           (lib/filter (lib/= people-col "test@example.com")))
          ;; Corrupt both field refs
          bad-query (-> filter-query
                        (assoc-in [:stages 0 :filters 0 2 2] "missingcol1")
                        (assoc-in [:stages 0 :filters 1 2 2] "missingcol2"))
          errors (lib/find-bad-refs-with-source bad-query)]
      (is (= 2 (count errors)))
      (is (= #{{:type :missing-column
                :source-entity-type :table
                :source-entity-id (meta/id :products)
                :name "missingcol1"}
               {:type :missing-column
                :source-entity-type :card
                :source-entity-id 101
                :name "missingcol2"}}
             (set errors))))))

(deftest ^:parallel find-bad-refs-with-source-multi-stage-test
  (testing "invalid query referencing previous stage has no source"
    (let [mp meta/metadata-provider
          base-query (-> (lib/query mp (meta/table-metadata :orders))
                         (lib/breakout (meta/field-metadata :orders :quantity))
                         (lib/aggregate (lib/count))
                         lib/append-stage)
          prev-cols (lib/returned-columns base-query)
          count-col (m/find-first #(= (:name %) "count") prev-cols)
          filter-query (lib/filter base-query (lib/> count-col 100))
          bad-query (assoc-in filter-query [:stages 1 :filters 0 2 2] "missingcol")
          errors (lib/find-bad-refs-with-source bad-query)]
      (is (= 1 (count errors)))
      (is (= {:type :missing-column
              :name "missingcol"}
             (first errors))))))

(deftest ^:parallel find-bad-refs-with-source-implicit-join-test
  (testing "invalid query with implicit join via :source-field returns error with FK field's table as source"
    (let [mp meta/metadata-provider
          query (lib/query mp (meta/table-metadata :orders))
          cols (lib/filterable-columns query)
          ij-col (m/find-first #(= (:lib/source %) :source/implicitly-joinable) cols)
          filter-query (lib/filter query (lib/= ij-col "test"))
          bad-query (assoc-in filter-query [:stages 0 :filters 0 2 2] "missingcol")
          errors (lib/find-bad-refs-with-source bad-query)]
      (is (= 1 (count errors)))
      (is (= {:type :missing-column
              :source-entity-type :table
              :source-entity-id (meta/id :orders)
              :name "missingcol"}
             (first errors))))))
