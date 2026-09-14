(ns metabase.query-processor.binning-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.test :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]))

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
    (let [mp              (mt/metadata-provider)
          orders-subtotal (lib.metadata/field mp (mt/id :orders :subtotal))
          orders-user-id  (lib.metadata/field mp (mt/id :orders :user_id))
          card-query      (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                              (lib/aggregate (lib/avg orders-subtotal))
                              (lib/breakout orders-user-id))
          card-cols       (-> (qp/process-query card-query)
                              :data
                              :results_metadata
                              :columns)
          _               (is (= 2
                                 (count card-cols)))
          mock-mp         (lib.tu/mock-metadata-provider
                           mp
                           {:cards [{:id              1
                                     :dataset-query   card-query
                                     :result-metadata card-cols}]})
          card            (lib.metadata/card mock-mp 1)
          query           (lib/query mock-mp card)
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

(deftest ^:parallel bucket-implicitly-joined-column-test
  (testing "temporal bucketing an implicitly-joined column executes and gets an fk-prefixed display name (metabase#15648, metabase#16674)"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/aggregate (lib/count)))
          birth (m/find-first #(= (:id %) (mt/id :people :birth_date))
                              (lib/breakoutable-columns query))
          query (lib/breakout query (lib/with-temporal-bucket birth :year))
          res   (qp/process-query query)]
      (is (= "User → Birth Date: Year" (-> res mt/cols first :display_name)))
      (is (seq (mt/rows res))))))

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

(deftest ^:parallel temporal-bucket-on-native-source-card-test
  (testing "default temporal bucket for a native source card's datetime column resolves to Month (not Minute) via result_metadata (metabase#16671)"
    (let [mp   (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                [(lib.convert/->legacy-MBQL (lib/native-query (mt/metadata-provider) "SELECT CREATED_AT FROM ORDERS"))])
          q    (lib/query mp (lib.metadata/card mp 1))
          col  (m/find-first (comp #{"created_at"} u/lower-case-en :name) (lib/breakoutable-columns q))]
      (is (some? col))
      (is (some :default (filter (comp #{:month} :unit) (lib/available-temporal-buckets q col))))
      (is (seq (mt/rows (qp/process-query
                         (-> q
                             (lib/aggregate (lib/count))
                             (lib/breakout (lib/with-temporal-bucket col :year))))))))))

(deftest ^:parallel binning-on-native-source-card-test
  (testing "auto/explicit binning for a native source card's column is driven by result_metadata fingerprint (metabase#16670, metabase#16672)"
    (doseq [[sql col-name strategy-display-name]
            [["SELECT TOTAL FROM ORDERS"     "TOTAL"     "Auto bin"]
             ["SELECT LONGITUDE FROM PEOPLE" "LONGITUDE" "Bin every 10 degrees"]]]
      (testing (format "%s on %s" strategy-display-name col-name)
        (let [mp    (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                     [(lib.convert/->legacy-MBQL (lib/native-query (mt/metadata-provider) sql))])
              q     (lib/query mp (lib.metadata/card mp 1))
              col   (m/find-first (comp #{(u/lower-case-en col-name)} u/lower-case-en :name) (lib/breakoutable-columns q))
              strat (m/find-first (comp #{strategy-display-name} :display-name)
                                  (lib/available-binning-strategies q col))]
          (is (some? col))
          (is (some? strat))
          (is (seq (mt/rows (qp/process-query
                             (-> q
                                 (lib/aggregate (lib/count))
                                 (lib/breakout (lib/with-binning col strat))))))))))))

(deftest ^:parallel post-aggregation-filter-on-same-column-breakouts-test
  (testing "a later stage can filter on each of two disambiguated same-column breakout columns (metabase#46536, metabase#46776)"
    (let [mp         (mt/metadata-provider)
          base       (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          total      (m/find-first #(= (:id %) (mt/id :orders :total))
                                   (lib/breakoutable-columns base))
          unfiltered (-> base
                         (lib/aggregate (lib/count))
                         (lib/breakout (lib/with-binning total {:strategy :num-bins, :num-bins 10}))
                         (lib/breakout (lib/with-binning total {:strategy :num-bins, :num-bins 50}))
                         lib/append-stage)
          ;; the two same-column breakouts surface as distinct filterable columns (same field id, different
          ;; source-column-alias, e.g. TOTAL / TOTAL_2); filter both to prove they resolve independently
          total-cols (filter #(= (:id %) (mt/id :orders :total)) (lib/filterable-columns unfiltered))
          filtered   (reduce (fn [q c] (lib/filter q (lib/between c 10 50))) unfiltered total-cols)
          n-all      (count (mt/rows (qp/process-query unfiltered)))
          n-filtered (count (mt/rows (qp/process-query filtered)))]
      (is (= 2 (count total-cols)))
      ;; filtering on both disambiguated same-column breakout outputs matches some rows and is strictly narrower than
      ;; the unfiltered two-breakout result — proving the two same-column breakouts resolve as distinct columns.
      (is (pos? n-filtered))
      (is (< n-filtered n-all)))))
