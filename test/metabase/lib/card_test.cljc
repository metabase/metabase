(ns metabase.lib.card-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.mocks-31769 :as lib.tu.mocks-31769]
   [metabase.util :as u]))

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

(defn- from [src cols]
  (for [col cols]
    (assoc col :lib/source src)))

(defn- cols-of [table]
  (for [col (meta/fields table)]
    (meta/field-metadata table col)))

(defn- sort-cols [cols]
  (sort-by (juxt :name :id :source-alias :lib/desired-column-alias) cols))

(deftest ^:parallel visible-columns-use-result-metadata-test
  (testing "visible-columns should use the Card's `:result-metadata` (regardless of what's actually in the Card)"
    (let [venues-query (lib/query
                        (lib.tu/mock-metadata-provider
                         meta/metadata-provider
                         {:cards [(assoc (:orders lib.tu/mock-cards) :dataset-query lib.tu/venues-query)]})
                        (:orders lib.tu/mock-cards))]
      (is (=? (->> (cols-of :orders)
                   sort-cols)
              (sort-cols (get-in lib.tu/mock-cards [:orders :result-metadata]))))

      (is (=? (->> (concat (from :source/card (cols-of :orders))
                           (from :source/implicitly-joinable (cols-of :people))
                           (from :source/implicitly-joinable (cols-of :products)))
                   sort-cols)
              (sort-cols (lib/visible-columns venues-query)))))))

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

(deftest ^:parallel card-source-query-visible-columns-test
  (testing "Explicitly joined fields do not also appear as implictly joinable"
    (let [base       (lib/query meta/metadata-provider (meta/table-metadata :orders))
          join       (lib/join-clause (meta/table-metadata :products)
                                      [(lib/= (lib/ref (meta/field-metadata :orders :product-id))
                                              (lib/ref (meta/field-metadata :products :id)))])
          query      (lib/join base join)]
      (is (=? (->> (concat (from :source/table-defaults (cols-of :orders))
                           (from :source/joins          (cols-of :products)))
                   sort-cols)
              (->> query lib.metadata.calculation/returned-columns sort-cols)))

      (is (=? (->> (concat (from :source/table-defaults      (cols-of :orders))
                           (from :source/joins               (cols-of :products))
                           (from :source/implicitly-joinable (cols-of :people)))
                   sort-cols)
              (->> query lib.metadata.calculation/visible-columns sort-cols)))

      ;; TODO: Currently if the source-card has an explicit join for a table, those fields will also be duplicated as
      ;; implicitly joinable columns. That should be fixed and this test re-enabled. #33565
      #_(testing "even on nested queries"
        (let [card     (lib.tu/mock-card query)
              provider (lib.tu/metadata-provider-with-mock-card card)
              nested   (lib/query provider (lib.metadata/card provider 1))]
          (is (=? (->> (concat (from :source/card (cols-of :orders))
                               (from :source/card (cols-of :products)))
                       (map #(dissoc % :id :table-id))
                       sorted)
                  (->> nested lib.metadata.calculation/returned-columns sorted)))

          (is (=? (->> (concat (from :source/card (cols-of :orders))
                               (from :source/card (cols-of :products)))
                       (map #(dissoc % :id :table-id))
                       (concat (from :source/implicitly-joinable (cols-of :people)))
                       sorted)
                  (->> nested lib.metadata.calculation/visible-columns sorted))))))))

(deftest ^:parallel display-name-of-joined-cards-is-clean-test
  (testing "We get proper field names rather than ids (#27323)"
    (let [query (lib/query lib.tu/metadata-provider-with-mock-cards (:products lib.tu/mock-cards))
          people-card (:people lib.tu/mock-cards)
          lhs (m/find-first (comp #{"ID"} :name) (lib/join-condition-lhs-columns query 0 people-card nil nil))
          rhs (m/find-first (comp #{"ID"} :name) (lib/join-condition-rhs-columns query 0 people-card nil nil))
          join-clause (lib/join-clause people-card [(lib/= lhs rhs)])
          query (lib/join query join-clause)
          filter-col (m/find-first (comp #{"Mock people card__ID"} :lib/desired-column-alias)
                                   (lib/filterable-columns query))
          query (-> query
                    (lib/filter (lib/= filter-col 1))
                    (lib/aggregate (lib/distinct filter-col))
                    (as-> $q (lib/breakout $q (m/find-first (comp #{"SOURCE"} :name)
                                                            (lib/breakoutable-columns $q)))))]
      (is (= ["Source" "Distinct values of ID"]
             (map #(lib/display-name query %) (lib/returned-columns query))))
      (is (= ["ID is 1"]
             (map #(lib/display-name query %) (lib/filters query)))))))
