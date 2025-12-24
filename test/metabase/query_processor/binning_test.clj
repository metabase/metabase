(ns metabase.query-processor.binning-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest ^:parallel binning-in-result-cols-display-name-test
  (doseq [[table-key field-key binning-name expected-display-name]
          [[:orders :tax "50 bins" "Tax: 50 bins"]
           [:venues :longitude "Bin every 1 degree" "Longitude: 1°"]]]
    (let [mp (mt/metadata-provider)
          query (as-> (lib/query mp (lib.metadata/table mp (mt/id table-key))) $
                  (lib/aggregate $ (lib/count))
                  (lib/breakout $ (lib/with-binning (lib.metadata/field mp (mt/id table-key field-key))
                                                    (m/find-first (comp #{binning-name} :display-name)
                                                                  (lib/available-binning-strategies
                                                                   $
                                                                   (lib.metadata/field mp (mt/id table-key field-key)))))))]
      (testing "Binning is suffixed to columns display name"
        (is (= expected-display-name
               (-> (qp/process-query query) mt/cols first :display_name))))
      (testing "Binning is visible on cards"
        (let [mp (lib.tu/mock-metadata-provider
                  mp
                  {:cards [{:id            1
                            :dataset-query query}]})]
          (is (= expected-display-name
                 (-> (lib/query mp (lib.metadata/card mp 1))
                     qp/process-query
                     mt/cols
                     first
                     :display_name))))))))

(deftest ^:parallel binning-on-nested-question-with-aggregation-test
  (testing "binning should work on nested question based on question that has aggregation (#16379)"
    (let [card-query      (mt/mbql-query orders
                            {:aggregation [[:avg $subtotal]]
                             :breakout    [$user_id]})
          card-cols       (-> (qp/process-query card-query)
                              :data
                              :results_metadata
                              :columns)
          _               (is (= 2
                                 (count card-cols)))
          mp              (lib.tu/mock-metadata-provider
                           (mt/metadata-provider)
                           {:cards [{:id              1
                                     :dataset-query   card-query
                                     :result-metadata card-cols}]})
          card            (lib.metadata/card mp 1)
          query           (lib/query mp card)
          avg             (m/find-first #(= (:name %) "avg")
                                        (lib/visible-columns query))
          _               (assert avg)
          _               (is (=? {:fingerprint {:type {:type/Number {:min number? :max number?}}}}
                                  avg))
          binning-options (lib/available-binning-strategies query avg)
          _               (assert (seq binning-options))
          ten-bins        (m/find-first #(= (:display-name %) "10 bins")
                                        binning-options)
          _               (assert ten-bins)
          avg-binned      (lib/with-binning avg ten-bins)
          query'          (-> query
                              (lib/aggregate (lib/count))
                              (lib/breakout avg-binned))]
      (is (= [[25.0  10]
              [37.5  30]
              [50.0  179]
              [62.5  530]
              [75.0  693]
              [87.5  221]
              [100.0 46]
              [112.5 18]
              [125.0 13]
              [137.5 6]]
             (mt/formatted-rows [2.0 int] (qp/process-query query')))))))

(deftest ^:parallel multiple-bins-on-same-column-test
  (let [query (lib/query
               (mt/metadata-provider)
               {:database (mt/id)
                :type     :query
                :query    {:source-query {:source-table (mt/id :orders)
                                          :aggregation  [[:count]]
                                          :breakout     [[:field
                                                          (mt/id :orders :total)
                                                          {:base-type :type/Float, :binning {:strategy :num-bins, :num-bins 10}}]
                                                         [:field
                                                          (mt/id :orders :total)
                                                          {:base-type :type/Float, :binning {:strategy :num-bins, :num-bins 50}}]]}
                           :expressions  {"Expression1" [:+ [:field "TOTAL" {:base-type :type/Float}] 100]
                                          "Expression2" [:+ [:field "TOTAL" {:base-type :type/Float}] 200]}
                           :order-by     [[:asc [:field "TOTAL" {:base-type :type/Float}]]
                                          [:asc [:field "TOTAL_2" {:base-type :type/Float}]]
                                          [:asc [:field "count" {:base-type :type/Integer}]]]
                           :limit        3}})]
    (is (= [[-60.0 -50.0 1  40 140]
            [0.0   5.0   1 100 200]
            [0.0   10.0  5 100 200]]
           (mt/formatted-rows [1.0 1.0 int int int] (qp/process-query query))))))
