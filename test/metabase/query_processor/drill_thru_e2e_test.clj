(ns metabase.query-processor.drill-thru-e2e-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(deftest ^:parallel quick-filter-on-bucketed-date-test
  (testing "a quick-filter drill on a bucketed DATE should produce valid results (#18769)"
    (mt/dataset test-data
      (qp.store/with-metadata-provider (mt/id)
        (let [products           (lib.metadata/table (qp.store/metadata-provider) (mt/id :products))
              created-at         (-> (lib.metadata/field (qp.store/metadata-provider) (mt/id :products :created_at))
                                     (lib/with-temporal-bucket :day))
              query              (-> (lib/query (qp.store/metadata-provider) products)
                                     (lib/aggregate (lib/count))
                                     (lib/breakout created-at))
              drill-context      {:column     created-at
                                  :column-ref (lib.ref/ref created-at)
                                  :value      #t "2016-05-30T00:00Z[UTC]"}
              quick-filter-drill (m/find-first #(= (:type %) :drill-thru/quick-filter)
                                               (lib/available-drill-thrus query drill-context))]
          (is (some? quick-filter-drill))
          (let [query' (lib/drill-thru query -1 nil quick-filter-drill "<")]
            (is (=? {:stages [{:filters [[:<
                                          {}
                                          [:field {} (mt/id :products :created_at)]
                                          #t "2016-05-30T00:00Z[UTC]"]]}]}
                    query'))
            (mt/with-native-query-testing-context query'
              (is (= [["2016-04-26T00:00:00Z" 1]
                      ["2016-04-28T00:00:00Z" 1]
                      ["2016-05-02T00:00:00Z" 1]
                      ["2016-05-04T00:00:00Z" 1]
                      ["2016-05-11T00:00:00Z" 1]
                      ["2016-05-12T00:00:00Z" 1]
                      ["2016-05-24T00:00:00Z" 1]]
                     (mt/rows (qp/process-query query')))))))))))

(deftest ^:parallel distribution-drill-on-longitude-from-sql-source-card-test
  (testing "#16672"
    (mt/dataset test-data
      (let [metadata-provider  (mt/metadata-provider)
            card-query         (lib/native-query metadata-provider "SELECT * FROM PEOPLE ORDER BY ID DESC LIMIT 100;")
            results            (qp/process-query card-query)
            results-metadata   (get-in results [:data :results_metadata :columns])
            _                  (is (seq results-metadata))
            metadata-provider  (lib.tu/mock-metadata-provider
                                metadata-provider
                                {:cards [{:id              1
                                          :name            "Card 1"
                                          :database-id     (mt/id)
                                          :dataset-query   card-query
                                          :result-metadata results-metadata}]})
            query              (lib/query metadata-provider (lib.metadata/card metadata-provider 1))
            longitude          (m/find-first #(= (:name %) "LATITUDE")
                                             (lib/returned-columns query))
            _                  (is (=? {:name           "LATITUDE"
                                        :effective-type :type/Float
                                        :fingerprint    {:type {:type/Number {:min number?, :max number?}}}}
                                       longitude))
            drill-context      {:column longitude, :column-ref (lib.ref/ref longitude), :value nil}
            distribution-drill (m/find-first
                                #(= (:type %) :drill-thru/distribution)
                                (lib/available-drill-thrus query drill-context))
            _                  (is (=? {:column {:name "LATITUDE"}}
                                       distribution-drill))
            query'             (lib/drill-thru query -1 nil distribution-drill)]
        (is (=? {:stages [{:source-card 1
                           :aggregation [[:count {}]]
                           :breakout    [[:field {:binning {:strategy :default}} "LATITUDE"]]}]}
                query'))
        (qp.store/with-metadata-provider metadata-provider
          (is (= [[20.0 2]
                  [30.0 54]
                  [40.0 42]
                  [50.0 1]
                  [60.0 1]]
                 (mt/formatted-rows
                  [double long]
                  (qp/process-query query')))))))))

(deftest ^:parallel pivot-drill-on-implicit-join-with-filter-after-aggregation-test
  (testing "Pivot drill on implicitly joined column with filter-after-aggregation should work (#67228)"
    ;; Reproduces a bug where applying a pivot drill-through on a query with:
    ;; 1. Breakout by an implicitly joined column (e.g., Products.Category via Orders.product_id)
    ;; 2. A filter stage after the aggregation (e.g., Count > 1)
    ;; Would produce an invalid query with a filter in stage 0 referencing a column by its
    ;; output alias (e.g., "PRODUCTS__via__PRODUCT_ID__CATEGORY") instead of by field ID.
    (mt/dataset test-data
      (qp.store/with-metadata-provider (mt/id)
        (let [orders        (lib.metadata/table (qp.store/metadata-provider) (mt/id :orders))
              initial-query (-> (lib/query (qp.store/metadata-provider) orders)
                                (lib/aggregate (lib/count)))
              products-cat  (m/find-first #(and (= (:name %) "CATEGORY")
                                                (= (:table-id %) (mt/id :products)))
                                          (lib/breakoutable-columns initial-query))
              base-query    (lib/breakout initial-query products-cat)
              query         (-> base-query
                                lib/append-stage
                                (as-> q
                                      (let [count-col (m/find-first #(= (:name %) "count")
                                                                    (lib/filterable-columns q))]
                                        (lib/filter q (lib/> count-col 1)))))
              returned-cols (lib/returned-columns query)
              count-col     (m/find-first #(= (:name %) "count") returned-cols)
              category-col  (m/find-first #(= (:name %) "CATEGORY") returned-cols)
              drill-context {:column     count-col
                             :column-ref (lib.ref/ref count-col)
                             :value      42
                             :row        [{:column     category-col
                                           :column-ref (lib.ref/ref category-col)
                                           :value      "Doohickey"}
                                          {:column     count-col
                                           :column-ref (lib.ref/ref count-col)
                                           :value      42}]
                             :dimensions [{:column     category-col
                                           :column-ref (lib.ref/ref category-col)
                                           :value      "Doohickey"}]}
              pivot-drill   (m/find-first #(= (:type %) :drill-thru/pivot)
                                          (lib/available-drill-thrus query drill-context))
              _             (is (some? pivot-drill))
              people-source (m/find-first #(= (:name %) "SOURCE")
                                          (lib/pivot-columns-for-type pivot-drill :category))
              query'        (lib/drill-thru query -1 nil pivot-drill people-source)]
          ;; Overspecification?
          (is (=? {:stages [{:source-table (mt/id :orders)
                             :aggregation  [[:count {}]]
                             :breakout     [[:field {} (mt/id :people :source)]]
                             :filters      [[:= {} [:field {} (mt/id :products :category)] "Doohickey"]]}
                            {:filters [[:> {} [:field {} "count"] 1]]}]}
                  query'))
          (mt/with-native-query-testing-context query'
            (is (= [["Affiliate" 783]
                    ["Facebook" 816]
                    ["Google" 844]
                    ["Organic" 738]
                    ["Twitter" 795]]
                   (mt/formatted-rows [str int] (qp/process-query query'))))))))))
