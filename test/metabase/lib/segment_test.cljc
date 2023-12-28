(ns metabase.lib.segment-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private segment-id 100)

(def ^:private segment-definition
  {:source-table (meta/id :venues)
   :aggregation  [[:count]]
   :filter       [:and
                  [:> [:field (meta/id :venues :id) nil] [:* [:field (meta/id :venues :price) nil] 11]]
                  [:contains [:field (meta/id :venues :name) nil] "BBQ" {:case-sensitive true}]]})

(def ^:private metadata-provider
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:segments [{:id          segment-id
                :name        "PriceID-BBQ"
                :table-id    (meta/id :venues)
                :definition  segment-definition
                :description "The ID is greater than 11 times the price and the name contains \"BBQ\"."}]}))

(def ^:private segment-clause
  [:segment {:lib/uuid (str (random-uuid))} segment-id])

(def ^:private query-with-segment
  (-> (lib/query metadata-provider (meta/table-metadata :venues))
      (lib/filter (lib/= (meta/field-metadata :venues :id) 5))
      (lib/filter segment-clause)))

(def ^:private segment-metadata
  (lib.metadata/segment query-with-segment segment-id))

(deftest ^:parallel query-suggested-name-test
  (is (= "Venues, Filtered by ID is 5 and PriceID-BBQ"
         (lib.metadata.calculation/suggested-name query-with-segment))))

(deftest ^:parallel display-info-test
  (are [segment] (=? {:name              "priceid_bbq",
                      :display-name      "PriceID-BBQ",
                      :long-display-name "PriceID-BBQ",
                      :effective-type    :type/Boolean,
                      :description       "The ID is greater than 11 times the price and the name contains \"BBQ\"."}
                     (lib.metadata.calculation/display-info query-with-segment segment))
    segment-clause
    segment-metadata))

(deftest ^:parallel unknown-display-info-test
  (is (=? {:effective-type    :type/Boolean
           :display-name      "[Unknown Segment]"
           :long-display-name "[Unknown Segment]"}
          (lib.metadata.calculation/display-info query-with-segment [:segment {} (inc segment-id)]))))

(deftest ^:parallel available-segments-test
  (testing "Should return Segments with the same Table ID as query's `:source-table`"
    (is (=? [{:lib/type    :metadata/segment
              :id          segment-id
              :name        "PriceID-BBQ"
              :table-id    (meta/id :venues)
              :definition  segment-definition
              :description "The ID is greater than 11 times the price and the name contains \"BBQ\"."}]
            (lib/available-segments (lib/query metadata-provider (meta/table-metadata :venues))))))
  (testing "Should return filter-positions"
    (let [query              (-> (lib/query metadata-provider (meta/table-metadata :venues))
                                 (lib/filter segment-clause))
          available-segments (lib/available-segments query)]
      (is (=? [{:lib/type    :metadata/segment
                :id          segment-id
                :name        "PriceID-BBQ"
                :table-id    (meta/id :venues)
                :definition  segment-definition
                :description "The ID is greater than 11 times the price and the name contains \"BBQ\"."
                :filter-positions [0]}]
              available-segments))
      (is (=? [{:name "priceid_bbq",
                :display-name "PriceID-BBQ",
                :long-display-name "PriceID-BBQ",
                :effective-type :type/Boolean,
                :description "The ID is greater than 11 times the price and the name contains \"BBQ\".",
                :filter-positions [0]}]
              (map #(lib/display-info query %) available-segments)))
      (let [multi-stage-query (lib/append-stage query)]
        (testing "not the first stage -- don't return Segments (#36196)"
          (is (nil? (lib/available-segments multi-stage-query)))
          (is (nil? (lib/available-segments multi-stage-query -1)))
          (is (nil? (lib/available-segments multi-stage-query 1))))
        (testing "explicitly choosing the first stage works"
          (is (= available-segments
                 (lib/available-segments multi-stage-query 0)
                 (lib/available-segments multi-stage-query -2)))))))
  (testing "query with different Table -- don't return Segments"
    (is (nil? (lib/available-segments (lib/query metadata-provider (meta/table-metadata :orders)))))))

(deftest ^:parallel filter-with-segment-test
  (testing "Should be able to pass a Segment metadata to `filter`"
    (let [query    (lib/query metadata-provider (meta/table-metadata :venues))
          segments (lib/available-segments query)]
      (is (= 1
             (count segments)))
      ;; test with both `:metadata/segment` and with a `:segment` ref clause
      (doseq [segment [(first segments)
                      [:segment {:lib/uuid (str (random-uuid))} segment-id]]]
        (testing (pr-str (list 'lib/filter 'query segment))
          (let [query' (lib/filter query segment)]
            (is (=? {:lib/type :mbql/query
                     :stages   [{:lib/type     :mbql.stage/mbql
                                 :source-table (meta/id :venues)
                                 :filters  [[:segment {:lib/uuid string?} segment-id]]}]}
                    query'))
            (is (=? [[:segment {:lib/uuid string?} segment-id]]
                    (lib/filters query')))
            (is (=? [{:name              "priceid_bbq",
                      :display-name      "PriceID-BBQ",
                      :long-display-name "PriceID-BBQ",
                      :effective-type    :type/Boolean,
                      :description       "The ID is greater than 11 times the price and the name contains \"BBQ\"."}]
                    (map (partial lib/display-info query')
                         (lib/filters query'))))))))))
