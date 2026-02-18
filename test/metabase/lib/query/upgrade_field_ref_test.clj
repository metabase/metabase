(ns metabase.lib.query.upgrade-field-ref-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.compile :as qp.compile]))

(deftest ^:parallel query-fields-get-upgraded-test
  (let [selector (fn [q] (-> q :stages (get 0) :fields first))
        mp meta/metadata-provider
        mp (lib.tu/mock-metadata-provider mp {:cards [{:id          1
                                                       :dataset-query (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                                                       :database-id (meta/id)
                                                       :name        "ORDERS+"
                                                       :type        :model}]})
        q-table (-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                    (lib/with-fields [(lib.metadata/field mp (meta/id :orders :id))]))
        q-table-upgraded (lib/upgrade-field-refs q-table)
        q-card  (-> (lib/query mp (lib.metadata/card mp 1))
                    (lib/with-fields [(lib.metadata/field mp (meta/id :orders :id))]))
        q-card-upgraded (lib/upgrade-field-refs q-card)]
    ;; Un-upgraded should use ids (pos-int)
    (is (lib/field-ref-id (selector q-table)))
    (is (lib/field-ref-id (selector q-card)))
    ;; Upgraded depends
    (is (lib/field-ref-id   (selector q-table-upgraded))) ;; on table, still id
    (is (lib/field-ref-name (selector q-card-upgraded)))  ;; on card, name
    ;; Compiled query should be the same
    (is (= (qp.compile/compile q-table)
           (qp.compile/compile q-table-upgraded)))
    ;; (eric): I thought the queries below should compile to the same as the queries above, but it appears that table
    ;; vs card are different
    (is (= (qp.compile/compile q-card)
           (qp.compile/compile q-card-upgraded)))))

(deftest ^:parallel query-filters-get-upgraded-test
  (let [selector (fn [q] (-> q :stages (get 0) :filters first last))
        mp meta/metadata-provider
        mp (lib.tu/mock-metadata-provider mp {:cards [{:id          1
                                                       :dataset-query (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                                                       :database-id (meta/id)
                                                       :name        "ORDERS+"
                                                       :type        :model}]})
        q-table (-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                    (lib/filter (lib/= 2  (lib.metadata/field mp (meta/id :orders :id)))))
        q-table-upgraded (lib/upgrade-field-refs q-table)
        q-card  (-> (lib/query mp (lib.metadata/card mp 1))
                    (lib/filter (lib/= 2  (lib.metadata/field mp (meta/id :orders :id)))))
        q-card-upgraded (lib/upgrade-field-refs q-card)]
    ;; Un-upgraded should use ids (pos-int)
    (is (lib/field-ref-id (selector q-table)))
    (is (lib/field-ref-id (selector q-card)))
    ;; Upgraded depends
    (is (lib/field-ref-id   (selector q-table-upgraded))) ;; on table, still id
    (is (lib/field-ref-name (selector q-card-upgraded)))  ;; on card, name
    ;; Compiled query should be the same
    (is (= (qp.compile/compile q-table)
           (qp.compile/compile q-table-upgraded)))
    ;; (eric): I thought the queries below should compile to the same as the queries above, but it appears that table
    ;; vs card are different
    (is (= (qp.compile/compile q-card)
           (qp.compile/compile q-card-upgraded)))))

(deftest ^:parallel query-expressions-get-upgraded-test
  (let [selector (fn [q] (-> q :stages (get 0) :expressions first last))
        mp meta/metadata-provider
        mp (lib.tu/mock-metadata-provider mp {:cards [{:id          1
                                                       :dataset-query (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                                                       :database-id (meta/id)
                                                       :name        "ORDERS+"
                                                       :type        :model}]})
        q-table (-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                    (lib/expression "PLUS" (lib/+ 2  (lib.metadata/field mp (meta/id :orders :id)))))
        q-table-upgraded (lib/upgrade-field-refs q-table)
        q-card  (-> (lib/query mp (lib.metadata/card mp 1))
                    (lib/expression "PLUS" (lib/+ 2  (lib.metadata/field mp (meta/id :orders :id)))))
        q-card-upgraded (lib/upgrade-field-refs q-card)]
    ;; Un-upgraded should use ids (pos-int)
    (is (lib/field-ref-id (selector q-table)))
    (is (lib/field-ref-id (selector q-card)))
    ;; Upgraded depends
    (is (lib/field-ref-id   (selector q-table-upgraded))) ;; on table, still id
    (is (lib/field-ref-name (selector q-card-upgraded)))  ;; on card, name
    ;; Compiled query should be the same
    (is (= (qp.compile/compile q-table)
           (qp.compile/compile q-table-upgraded)))
    ;; (eric): I thought the queries below should compile to the same as the queries above, but it appears that table
    ;; vs card are different
    (is (= (qp.compile/compile q-card)
           (qp.compile/compile q-card-upgraded)))))

(deftest ^:parallel query-aggregations-get-upgraded-test
  (let [selector (fn [q] (-> q :stages (get 0) :aggregation first last))
        mp meta/metadata-provider
        mp (lib.tu/mock-metadata-provider mp {:cards [{:id          1
                                                       :dataset-query (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                                                       :database-id (meta/id)
                                                       :name        "ORDERS+"
                                                       :type        :model}]})
        q-table (-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                    (lib/aggregate (lib/sum (lib.metadata/field mp (meta/id :orders :id)))))
        q-table-upgraded (lib/upgrade-field-refs q-table)
        q-card  (-> (lib/query mp (lib.metadata/card mp 1))
                    (lib/aggregate (lib/sum (lib.metadata/field mp (meta/id :orders :id)))))
        q-card-upgraded (lib/upgrade-field-refs q-card)]
    ;; Un-upgraded should use ids (pos-int)
    (is (lib/field-ref-id (selector q-table)))
    (is (lib/field-ref-id (selector q-card)))
    ;; Upgraded depends
    (is (lib/field-ref-id   (selector q-table-upgraded))) ;; on table, still id
    (is (lib/field-ref-name (selector q-card-upgraded)))  ;; on card, name
    ;; Compiled query should be the same
    (is (= (qp.compile/compile q-table)
           (qp.compile/compile q-table-upgraded)))
    ;; (eric): I thought the queries below should compile to the same as the queries above, but it appears that table
    ;; vs card are different
    (is (= (qp.compile/compile q-card)
           (qp.compile/compile q-card-upgraded)))))

(deftest ^:parallel query-breakouts-get-upgraded-test
  (let [selector (fn [q] (-> q :stages (get 0) :breakout first))
        mp meta/metadata-provider
        mp (lib.tu/mock-metadata-provider mp {:cards [{:id          1
                                                       :dataset-query (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                                                       :database-id (meta/id)
                                                       :name        "ORDERS+"
                                                       :type        :model}]})
        q-table (-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                    (lib/breakout (lib.metadata/field mp (meta/id :orders :id))))
        q-table-upgraded (lib/upgrade-field-refs q-table)
        q-card  (-> (lib/query mp (lib.metadata/card mp 1))
                    (lib/breakout (lib.metadata/field mp (meta/id :orders :id))))
        q-card-upgraded (lib/upgrade-field-refs q-card)]
    ;; Un-upgraded should use ids (pos-int)
    (is (lib/field-ref-id (selector q-table)))
    (is (lib/field-ref-id (selector q-card)))
    ;; Upgraded depends
    (is (lib/field-ref-id   (selector q-table-upgraded))) ;; on table, still id
    (is (lib/field-ref-name (selector q-card-upgraded)))  ;; on card, name
    ;; Compiled query should be the same
    (is (= (qp.compile/compile q-table)
           (qp.compile/compile q-table-upgraded)))
    ;; (eric): I thought the queries below should compile to the same as the queries above, but it appears that table
    ;; vs card are different
    (is (= (qp.compile/compile q-card)
           (qp.compile/compile q-card-upgraded)))))

(deftest ^:parallel query-joins-get-upgraded-test
  (let [selector-right (fn [q] (-> q :stages (get 0) :joins (get 0) :conditions first last))
        selector-left (fn [q] (-> q :stages (get 0) :joins (get 0) :conditions first butlast last))
        mp meta/metadata-provider
        mp (lib.tu/mock-metadata-provider mp {:cards [{:id          1
                                                       :dataset-query (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                                                       :database-id (meta/id)
                                                       :name        "ORDERS+"
                                                       :type        :model}
                                                      {:id          2
                                                       :dataset-query (lib/query mp (lib.metadata/table mp (meta/id :products)))
                                                       :database-id (meta/id)
                                                       :name        "PRODUCTS+"
                                                       :type        :model}]})
        q-table (-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                    (lib/join (lib/join-clause (lib.metadata/table mp (meta/id :products))
                                               [(lib/= (lib.metadata/field mp (meta/id :orders :product-id))
                                                       (lib.metadata/field mp (meta/id :products :id)))])))
        q-table-upgraded (lib/upgrade-field-refs q-table)
        ;; join card x table
        q-card  (-> (lib/query mp (lib.metadata/card mp 1))
                    (lib/join (lib/join-clause (lib.metadata/table mp (meta/id :products))
                                               [(lib/= (lib.metadata/field mp (meta/id :orders :product-id))
                                                       (lib.metadata/field mp (meta/id :products :id)))])))
        q-card-upgraded (lib/upgrade-field-refs q-card)
        ;; join card x card
        q-card-card  (-> (lib/query mp (lib.metadata/card mp 1))
                         (lib/join (lib/join-clause (lib.metadata/card mp 2)
                                                    [(lib/= (lib.metadata/field mp (meta/id :orders :product-id))
                                                            (lib.metadata/field mp (meta/id :products :id)))])))
        q-card-card-upgraded (lib/upgrade-field-refs q-card-card)]
    ;; Un-upgraded should use ids (pos-int)
    (is (lib/field-ref-id (selector-right q-table)))
    (is (lib/field-ref-id (selector-left  q-table)))
    (is (lib/field-ref-id (selector-right q-card)))
    (is (lib/field-ref-id (selector-left  q-card)))
    (is (lib/field-ref-id (selector-right q-card-card)))
    (is (lib/field-ref-id (selector-left  q-card-card)))
    ;; Upgraded depends
    (is (lib/field-ref-id   (selector-left q-table-upgraded)))      ;; on table, still id
    (is (lib/field-ref-name (selector-left q-card-upgraded)))       ;; on card, name
    (is (lib/field-ref-name (selector-left q-card-card-upgraded)))  ;; on card, name
    (is (lib/field-ref-id   (selector-right q-table-upgraded)))      ;; on table, still id
    (is (lib/field-ref-id   (selector-right q-card-upgraded)))       ;; on table, still id
    (is (lib/field-ref-name (selector-right q-card-card-upgraded)))  ;; on card, name
    ;; Compiled query should be the same
    (is (= (qp.compile/compile q-table)
           (qp.compile/compile q-table-upgraded)))
    ;; (eric): I thought the queries below should compile to the same as the queries above, but it appears that table
    ;; vs card are different
    (is (= (qp.compile/compile q-card)
           (qp.compile/compile q-card-upgraded)))
    (is (= (qp.compile/compile q-card-card)
           (qp.compile/compile q-card-card-upgraded)))))
