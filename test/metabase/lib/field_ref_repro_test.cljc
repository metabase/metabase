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
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]))

(deftest ^:parallel mark-selected-columns-with-duplicate-names-test
  (testing "Should be able to distinguish columns with the same name and different join alias (#39033)"
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
          vis-columns    (lib.metadata.calculation/visible-columns query stage-number)
          ret-columns    (lib.metadata.calculation/returned-columns query stage-number)
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
      (testing "all columns should be selected, none should be unselected"
        (is (= [{:display-name "ID",                                        :selected? true}
                {:display-name "Total",                                     :selected? true}
                {:display-name "Product ID",                                :selected? true}
                {:display-name "Mock products card - Product → ID",         :selected? true}
                {:display-name "Mock products card - Product → Rating",     :selected? true}
                {:display-name "Mock products card - Product → Category",   :selected? true}
                {:display-name "Mock products card - Product → Price",      :selected? true}
                {:display-name "Mock products card - Product → Title",      :selected? true}
                {:display-name "Mock products card - Product → Created At", :selected? true}
                {:display-name "Mock products card - Product → Vendor",     :selected? true}
                {:display-name "Mock products card - Product → Ean",        :selected? true}]
               (map #(select-keys % [:display-name :selected?]) marked-columns)))))))

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
    (testing "returned columns for first stage"
      (is (=? [{:name "ID"}
               {:id                           (meta/id :categories :name)
                :name                         "NAME"
                :lib/source                   :source/joins
                :metabase.lib.join/join-alias "Cat"
                :lib/source-column-alias      "NAME"
                :lib/desired-column-alias     "Cat__NAME"}]
              (lib/returned-columns query 0))))
    (testing "we expect the returned column should not look like it's coming from a join"
      (is (=? [{:id                           (meta/id :categories :name)
                :name                         "NAME"
                :lib/source                   :source/previous-stage
                :metabase.lib.join/join-alias (symbol "nil #_\"key is not present.\"")
                :lib/source-column-alias      "Cat__NAME"
                :lib/desired-column-alias     "Cat__NAME"}]
              (lib/returned-columns query))))))
