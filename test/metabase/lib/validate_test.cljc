(ns metabase.lib.validate-test
  (:require
   [clojure.test :refer [deftest ^:parallel is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel find-bad-refs-with-source-first-stage-test
  (testing "find-bad-refs-with-source returns source entity for first stage field refs"
    (let [mp meta/metadata-provider
          query (-> (lib/query mp (meta/table-metadata :orders))
                    (lib/filter (lib/= (meta/field-metadata :orders :user-id) 1)))
          ;; Corrupt a field reference to make it invalid
          bad-query (assoc-in query [:stages 0 :filters 0 2 2] "NONEXISTENT_COLUMN")]
      (testing "valid query has no errors"
        (is (empty? (lib/find-bad-refs-with-source query))))
      (testing "invalid query returns error with source-table as source"
        (let [errors (lib/find-bad-refs-with-source bad-query)]
          (is (= 1 (count errors)))
          (let [error (first errors)]
            (is (= :validate/missing-column (:type error)))
            (is (= :table (:source-entity-type error)))
            (is (= (meta/id :orders) (:source-entity-id error)))))))))

(deftest ^:parallel find-bad-refs-with-source-source-card-test
  (testing "find-bad-refs-with-source returns source-card for queries based on cards"
    (let [mp meta/metadata-provider
          base-query (lib/query mp (meta/table-metadata :products))
          mp (lib.tu/metadata-provider-with-card-from-query mp 101 base-query)
          card (lib/query mp {:lib/type :metadata/card
                              :id 101})
          ;; Query based on a card, with a filter
          query (-> card
                    (lib/filter (lib/= (m/find-first #(= (:name %) "CATEGORY")
                                                     (lib/returned-columns card))
                                       "Widget")))
          ;; Corrupt a field reference to make it invalid
          bad-query (assoc-in query [:stages 0 :filters 0 2 2] "NONEXISTENT")]
      (testing "invalid query referencing card returns error with source-card as source"
        (let [errors (lib/find-bad-refs-with-source bad-query)]
          (is (= 1 (count errors)))
          (let [error (first errors)]
            (is (= :validate/missing-column (:type error)))
            (is (= :card (:source-entity-type error)))
            (is (= 101 (:source-entity-id error)))))))))

(deftest ^:parallel find-bad-refs-with-source-join-test
  (testing "find-bad-refs-with-source returns join source for joined field refs"
    (let [mp meta/metadata-provider
          orders (meta/table-metadata :orders)
          products (meta/table-metadata :products)
          base-query (lib/query mp orders)
          ;; Add a join to products
          join-clause (-> (lib/join-clause products)
                          (lib/with-join-conditions
                           [(lib/= (meta/field-metadata :orders :product-id)
                                   (meta/field-metadata :products :id))])
                          (lib/with-join-fields :all))
          query (lib/join base-query join-clause)
          ;; Get a column from the joined table
          joined-cols (filter #(= (:lib/source %) :source/joins)
                              (lib/returned-columns query))
          joined-col (m/find-first #(= (:name %) "CATEGORY") joined-cols)]
      (when joined-col
        (let [filter-query (lib/filter query (lib/= joined-col "Widget"))
              ;; Corrupt the joined field reference
              bad-query (assoc-in filter-query [:stages 0 :filters 0 2 2] "NONEXISTENT")]
          (testing "invalid query with join returns error with joined table as source"
            (let [errors (lib/find-bad-refs-with-source bad-query)]
              (is (= 1 (count errors)))
              (let [error (first errors)]
                (is (= :validate/missing-column (:type error)))
                (is (= :table (:source-entity-type error)))
                (is (= (meta/id :products) (:source-entity-id error)))))))))))

(deftest ^:parallel find-bad-refs-with-source-multi-stage-test
  (testing "find-bad-refs-with-source returns nil source for columns from previous stage"
    (let [mp meta/metadata-provider
          base-query (-> (lib/query mp (meta/table-metadata :orders))
                         (lib/breakout (meta/field-metadata :orders :quantity))
                         (lib/aggregate (lib/count))
                         lib/append-stage)
          ;; Get a column from the previous stage
          prev-cols (lib/returned-columns base-query)
          count-col (m/find-first #(= (:name %) "count") prev-cols)]
      (when count-col
        (let [filter-query (lib/filter base-query (lib/> count-col 100))
              ;; Corrupt the field reference from previous stage
              bad-query (assoc-in filter-query [:stages 1 :filters 0 2 2] "nonexistent")]
          (testing "invalid query referencing previous stage has no source"
            (let [errors (lib/find-bad-refs-with-source bad-query)]
              (is (= 1 (count errors)))
              (let [error (first errors)]
                (is (= :validate/missing-column (:type error)))
                ;; No source for previous stage references
                (is (nil? (:source-entity-type error)))
                (is (nil? (:source-entity-id error)))))))))))

(deftest ^:parallel find-bad-refs-backward-compatible-test
  (testing "find-bad-refs still works (returns errors without source info)"
    (let [mp meta/metadata-provider
          query (-> (lib/query mp (meta/table-metadata :orders))
                    (lib/filter (lib/= (meta/field-metadata :orders :user-id) 1)))
          bad-query (assoc-in query [:stages 0 :filters 0 2 2] "NONEXISTENT_COLUMN")]
      (testing "valid query has no errors"
        (is (empty? (lib/find-bad-refs query))))
      (testing "invalid query returns error"
        (let [errors (lib/find-bad-refs bad-query)]
          (is (= 1 (count errors)))
          (let [error (first errors)]
            (is (= :validate/missing-column (:type error)))
            ;; Original find-bad-refs doesn't include source info
            (is (nil? (:source-entity-type error)))
            (is (nil? (:source-entity-id error)))))))))
