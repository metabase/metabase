(ns metabase.lib.card-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.card :as lib.card]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.mocks-31769 :as lib.tu.mocks-31769]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(comment lib/keep-me)

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel source-card-infer-metadata-test
  (testing "We should be able to calculate metadata for a Saved Question missing results_metadata"
    (let [query lib.tu/query-with-source-card]
      (is (=? [{:id                       (meta/id :checkins :user-id)
                :name                     "USER_ID"
                :lib/source               :source/card
                :lib/source-column-alias  "USER_ID"
                :lib/desired-column-alias "USER_ID"}
               {:name                     "count"
                :lib/source               :source/card
                :lib/source-column-alias  "count"
                :lib/desired-column-alias "count"}]
              (lib/returned-columns query)))
      (testing `lib/display-info
        (is (=? [{:name                   "USER_ID"
                  :display-name           "User ID"
                  :table                  {:name         "My Card"
                                           :display-name "My Card"}
                  :effective-type         :type/Integer
                  :semantic-type          :type/FK
                  :is-calculated          false
                  :is-from-previous-stage false
                  :is-implicitly-joinable false
                  :is-from-join           false}
                 {:name                   "count"
                  :display-name           "Count"
                  :table                  {:name         "My Card"
                                           :display-name "My Card"}
                  :effective-type         :type/Integer
                  :is-from-previous-stage false
                  :is-from-join           false
                  :is-calculated          false
                  :is-implicitly-joinable false}]
                (for [col (lib/returned-columns query)]
                  (lib/display-info query col))))))))

(deftest ^:parallel card-source-query-metadata-test
  (doseq [metadata [(:venues lib.tu/mock-cards)
                    ;; in some cases [the FE unit tests are broken] the FE is transforming the metadata like this, not
                    ;; sure why but handle it anyway
                    ;; (#29739)
                    (set/rename-keys (:venues lib.tu/mock-cards) {:result-metadata :fields})]]
    (testing (str "metadata = \n" (u/pprint-to-str metadata))
      (let [query {:lib/type     :mbql/query
                   :lib/metadata (lib.tu/mock-metadata-provider
                                  {:cards [metadata]})
                   :database     (meta/id)
                   :stages       [{:lib/type    :mbql.stage/mbql
                                   :source-card (:id metadata)}]}]
        (is (=? (for [col (get-in lib.tu/mock-cards [:venues :result-metadata])]
                  (-> col
                      (assoc :lib/source :source/card)
                      (dissoc :fk-target-field-id)))
                (lib/returned-columns query)))))))

(deftest ^:parallel card-results-metadata-merge-metadata-provider-metadata-test
  (testing "Merge metadata from the metadata provider into result-metadata (#30046)"
    (let [query lib.tu/query-with-source-card-with-result-metadata]
      (is (=? [{:lib/type                 :metadata/column
                :id                       (meta/id :checkins :user-id)
                :table-id                 (meta/id :checkins)
                :semantic-type            :type/FK
                :lib/desired-column-alias "USER_ID"}
               {:lib/type :metadata/column
                :name     "count"}]
              (lib/returned-columns query))))))

(deftest ^:parallel visible-columns-use-result--metadata-test
  (testing "visible-columns should use the Card's `:result-metadata` (regardless of what's actually in the Card)"
    (let [venues-query (lib/query
                        (lib/composed-metadata-provider
                         (lib.tu/mock-metadata-provider
                          {:cards [(assoc (:orders lib.tu/mock-cards) :dataset-query lib.tu/venues-query)]})
                         meta/metadata-provider)
                        (:orders lib.tu/mock-cards))]
      (is (= ["ID" "SUBTOTAL" "TOTAL" "TAX" "DISCOUNT" "QUANTITY" "CREATED_AT" "PRODUCT_ID" "USER_ID"]
             (mapv :name (get-in lib.tu/mock-cards [:orders :result-metadata]))))
      (is (= ["ID" "SUBTOTAL" "TOTAL" "TAX" "DISCOUNT" "QUANTITY" "CREATED_AT" "PRODUCT_ID" "USER_ID"]
             (mapv :name (lib/visible-columns venues-query)))))))

(deftest ^:parallel returned-columns-31769-test
  (testing "Cards with joins should return correct column metadata/refs (#31769)"
    (let [metadata-provider (lib.tu.mocks-31769/mock-metadata-provider meta/metadata-provider meta/id)
          card              (lib.metadata/card metadata-provider 1)
          q                 (:dataset-query card)
          cols              (lib/returned-columns q)]
      (is (=? [{:name                         "CATEGORY"
                :lib/source                   :source/breakouts
                :lib/source-column-alias      "CATEGORY"
                :metabase.lib.join/join-alias "Products"
                :lib/desired-column-alias     "Products__CATEGORY"}
               {:name                     "count"
                :lib/source               :source/aggregations
                :lib/source-column-alias  "count"
                :lib/desired-column-alias "count"}]
              cols))
      (is (=? [[:field {:join-alias "Products"} (meta/id :products :category)]
               [:aggregation {} string?]]
              (map lib.ref/ref cols))))))

(deftest ^:parallel returned-columns-31769-source-card-test
  (testing "Queries with `:source-card`s with joins should return correct column metadata/refs (#31769)"
    (binding [lib.card/*force-broken-card-refs* false]
      (let [metadata-provider (lib.tu.mocks-31769/mock-metadata-provider)
            card              (lib.metadata/card metadata-provider 1)
            q                 (lib/query metadata-provider card)
            cols              (lib/returned-columns q)]
        (is (=? [{:name                     "CATEGORY"
                  :lib/source               :source/card
                  :lib/source-column-alias  "CATEGORY"
                  :lib/desired-column-alias "Products__CATEGORY"}
                 {:name                     "count"
                  :lib/source               :source/card
                  :lib/source-column-alias  "count"
                  :lib/desired-column-alias "count"}]
                cols))
        (is (=? [[:field {:base-type :type/Text} "Products__CATEGORY"]
                 [:field {:base-type :type/Integer} "count"]]
                (map lib.ref/ref cols)))))))

(deftest ^:parallel returned-columns-31769-source-card-previous-stage-test
  (testing "Queries with `:source-card`s with joins in the previous stage should return correct column metadata/refs (#31769)"
    (binding [lib.card/*force-broken-card-refs* false]
      (let [metadata-provider (lib.tu.mocks-31769/mock-metadata-provider)
            card              (lib.metadata/card metadata-provider 1)
            q                 (-> (lib/query metadata-provider card)
                                  lib/append-stage)
            cols              (lib/returned-columns q)]
        (is (=? [{:name                     "CATEGORY"
                  :lib/source               :source/previous-stage
                  :lib/source-column-alias  "Products__CATEGORY"
                  :lib/desired-column-alias "Products__CATEGORY"}
                 {:name                     "count"
                  :lib/source               :source/previous-stage
                  :lib/source-column-alias  "count"
                  :lib/desired-column-alias "count"}]
                cols))
        (is (=? [[:field {:base-type :type/Text} "Products__CATEGORY"]
                 [:field {:base-type :type/Integer} "count"]]
                (map lib.ref/ref cols)))))))
