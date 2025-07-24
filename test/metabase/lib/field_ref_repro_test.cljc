(ns metabase.lib.field-ref-repro-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.lib.util :as lib.util]))

(deftest ^:parallel mark-selected-columns-with-duplicate-names-test
  (testing "Should be able to distinguish columns with the same name and differen join alias (#39033)"
    (let [card1 (-> (lib.tu/mock-cards)
                    :orders/native
                    (update :result-metadata #(filterv (comp #{"ID" "PRODUCT_ID" "TOTAL"} :name) %)))
          card2 (:products/native (lib.tu/mock-cards))
          metadata-provider (lib/composed-metadata-provider
                             meta/metadata-provider
                             (providers.mock/mock-metadata-provider
                              {:cards [card1 card2]}))
          query (-> (lib/query metadata-provider card1)
                    (lib/join (lib/join-clause card2
                                               [(lib/= (m/find-first (comp #{"PRODUCT_ID"} :name)
                                                                     (:result-metadata card1))
                                                       (m/find-first (comp #{"ID"} :name)
                                                                     (:result-metadata card2)))])))
          stage-number   -1
          stage          (lib.util/query-stage query stage-number)
          vis-columns    (lib.metadata.calculation/visible-columns query stage-number stage)
          ret-columns    (lib.metadata.calculation/returned-columns query stage-number stage)
          marked-columns (lib.equality/mark-selected-columns query stage-number vis-columns ret-columns)]
      (is (= ["ID"
              "Total"
              "Product ID"
              "Mock products card - Product → ID"
              "Mock products card - Product → Rating"
              "Mock products card - Product → Category"
              "Mock products card - Product → Price"
              "Mock products card - Product → Title"
              "Mock products card - Product → Created At"
              "Mock products card - Product → Vendor"
              "Mock products card - Product → Ean"]
             (map :display-name vis-columns)
             (map :display-name ret-columns)
             (map :display-name marked-columns)))
      ;; all columns should be selected, none should be unselected
      (let [{selected true, unselected false} (group-by :selected? marked-columns)]
        (is (= ["ID"
                "Total"
                "Product ID"
                "Mock products card - Product → Rating"
                "Mock products card - Product → Category"
                "Mock products card - Product → Price"
                "Mock products card - Product → Title"
                "Mock products card - Product → Created At"
                "Mock products card - Product → Vendor"
                "Mock products card - Product → Ean"]
               (map :display-name selected)))
        (is (= ["Mock products card - Product → ID"]
               (map :display-name unselected)))))))

(deftest ^:parallel find-matching-column-expression-with-field-name-test
  ;; query returns both PRODUCTS.CATEGORY and an expression named CATEGORY
  (testing "Should be able to match expression refs for expressions duplicating a column name (QUE-1378)"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query products
                   {:expressions {"CATEGORY" [:concat [:field %category nil] "2"]}
                    :fields      [[:field %category nil]
                                  [:expression "CATEGORY"]]
                    :limit       1}))
          expression-ref (last (lib/fields query))]
      (is (=? [:expression {} "CATEGORY"]
              expression-ref))
      ;; should return a column with properties like:
      ;; {... :lib/source :source/expressions, :name "CATEGORY", :lib/desired-column-alias "CATEGORY_2"}
      (is (nil? (lib.equality/find-matching-column
                 expression-ref
                 (lib/visible-columns query)))))))

(deftest ^:parallel returned-columns-bad-field-refs-test
  (let [query (lib/query
               meta/metadata-provider
               (lib.tu.macros/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :joins        [{:strategy     :left-join
                                                 :source-table $$categories
                                                 :alias        "Cat"
                                                 :condition    [:= $category-id &Cat.categories.id]
                                                 :fields       [&Cat.categories.name]}]
                                 :fields       [$id
                                                &Cat.categories.name]}
                  ;; THIS REF IS WRONG -- it should not be using `Cat` because the join is in the source query rather
                  ;; than in the current stage. However, we should be smart enough to try to figure out what they
                  ;; meant.
                  :breakout     [&Cat.categories.name]}))]
    ;; we expect the returned column should not look like it's coming from a join
    (is (=? [{:id                           (meta/id :categories :name)
              :name                         "NAME"
              ;; `:lib/source` is broken -- see #59596
              :lib/source                   :source/joins ; should be :source/breakout (if something at all)
              :metabase.lib.join/join-alias "Cat"  ; should be missing
              :lib/source-column-alias      "NAME" ; should be "Cat__NAME"
              :lib/desired-column-alias     "Cat__NAME"}]
            (lib/returned-columns query)))))
