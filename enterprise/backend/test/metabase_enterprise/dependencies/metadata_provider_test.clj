(ns metabase-enterprise.dependencies.metadata-provider-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase-enterprise.dependencies.metadata-provider :as deps.mp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]))

(deftest basic-cards-test
  (testing "overriding a single card, it is returned correctly"
    (let [card    (:orders (lib.tu/mock-cards))
          mp      (deps.mp/override-metadata-provider
                   {:base-provider (lib.tu/metadata-provider-with-mock-card card)})]
      (deps.mp/add-override mp :card (:id card)
                            (-> card
                                (assoc-in [:dataset-query :query :fields]
                                          (lib.tu.macros/$ids orders
                                            [$subtotal $created-at]))
                                (dissoc :result-metadata)))
      (is (=? [(meta/field-metadata :orders :subtotal)
               (meta/field-metadata :orders :created-at)]
              (->> (lib.metadata/card mp (:id card))
                   (lib/query mp)
                   lib/returned-columns))))))

(defn- replace-query [new-query card]
  (-> card
      (assoc :dataset-query (lib/->legacy-MBQL new-query))
      (dissoc :result-metadata)))

(deftest upstream-card-test
  (testing "overriding an upstream card that's consumed by a downstream card"
    (let [upstream   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/breakout (meta/field-metadata :products :category))
                         (lib/aggregate (lib/count)))
          mp1        (lib.tu/metadata-provider-with-card-from-query 1 upstream)
          card1      (lib.metadata/card mp1 1)
          by-name    (m/index-by :name (lib/returned-columns (lib/query mp1 card1)))
          downstream (-> (lib/query mp1 card1)
                         (lib/filter (lib/= (get by-name "count") 1)))
          mp         (deps.mp/override-metadata-provider
                      {:base-provider (lib.tu/metadata-provider-with-card-from-query mp1 2 downstream)})]
      (deps.mp/add-override mp :card 1
                            (-> upstream
                                (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :day))
                                (replace-query card1)))
      ;; NOTE: This line is important: this is what would happen to all the dependents returned by the graph.
      ;; There's no update (`nil`) but it still includes the downstream stuff in the scope of the
      ;; OverrideMetadataProvider.
      (deps.mp/add-override mp :card 2 nil)
      (testing "upstream card's columns are correct"
        (is (=? [{:name "CATEGORY"}
                 {:name "CREATED_AT"}
                 {:name "count"}]
                (->> (lib.metadata/card mp 1)
                     (lib/query mp)
                     lib/returned-columns))))
      (testing "downstream card (which selects all) is also correct"
        (is (=? [{:name "CATEGORY"}
                 {:name "CREATED_AT"}
                 {:name "count"}]
                (->> (lib.metadata/card mp 2)
                     (lib/query mp)
                     lib/returned-columns)))))))

(deftest card->transform->card-test
  (testing "changing the columns of an upstream card that is transformed and then used by a card"
    (let [upstream   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/breakout (meta/field-metadata :products :category))
                         (lib/aggregate (lib/count)))
          mp1        (lib.tu/metadata-provider-with-card-from-query 1 upstream)
          card1      (lib.metadata/card mp1 1)
          card1-cols (-> (lib/query mp1 card1)
                         lib/returned-columns)

          transform  {:lib/type :metadata/transform
                      :id     123
                      :name   "The Transform"
                      :source {:type  :query
                               :query (-> (lib/query mp1 (lib.metadata/card mp1 1))
                                          lib/->legacy-MBQL)}
                      :target {:type   "table"
                               :schema "transform_schema_123"
                               :name   "autobots"}}
          mp2        (lib.tu/mock-metadata-provider
                      mp1 {:tables [{:id              123000000
                                     :lib/type        :metadata/table
                                     :name            "autobots"
                                     :schema          "transform_schema_123"
                                     :db-id           (meta/id)
                                     :visibility-type nil
                                     :active          true}]
                           :fields (map-indexed (fn [i col]
                                                  (assoc col
                                                         :id       (+ 123000001 i)
                                                         :table-id 123000000))
                                                card1-cols)})

          xform-cols (m/index-by :name (lib.metadata/fields mp2 123000000))
          downstream (-> (lib/query mp2 (lib.metadata/table mp2 123000000))
                         (lib/filter (lib/= (get xform-cols "count") 1)))
          mp         (deps.mp/override-metadata-provider
                      {:base-provider (lib.tu/metadata-provider-with-card-from-query mp2 2 downstream)})]
      (deps.mp/add-override mp :card 1
                            (-> upstream
                                (lib/remove-clause (first (lib/breakouts upstream)))
                                (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :day))
                                (replace-query card1)))
      ;; NOTE: These lines are important: this is what would happen to all the dependents returned by the graph.
      ;; There's no update (`nil`) but it still includes the downstream stuff in the scope of the
      ;; OverrideMetadataProvider.
      (deps.mp/add-override mp :card 2 nil)
      (deps.mp/add-override mp :transform 123 transform)

      (testing "upstream card's columns are correct"
        (is (=? [{:name "CREATED_AT"}
                 {:name "count"}]
                (->> (lib.metadata/card mp 1)
                     (lib/query mp)
                     lib/returned-columns))))
      (testing "downstream card (which selects all) is also correct"
        (is (=? [{:name "CREATED_AT"}
                 {:name "count"}]
                (->> (lib.metadata/card mp 2)
                     (lib/query mp)
                     lib/returned-columns
                     (sort-by :name))))))))
