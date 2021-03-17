(ns metabase.query-processor-test.binning-test
  "Tests for specifying `:binning` options for a `:field` clause."
  (:require [clojure.test :refer :all]
            [metabase.api.card :as api.card]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.card :refer [Card]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor :as qp]
            [metabase.query-processor-test :as qp.test]
            [metabase.query-processor.middleware.add-source-metadata :as add-source-metadata]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest binning-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "Bin single column"
      (testing "20 bins"
        (is (= [[10.0 1] [32.0 4] [34.0 57] [36.0 29] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:count]]
                    :breakout    [[:field %latitude {:binning {:strategy :num-bins, :num-bins 20}}]]})))))

      (testing "3 bins"
        (is (= [[0.0 1] [20.0 90] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:count]]
                    :breakout    [[:field %latitude {:binning {:strategy :num-bins, :num-bins 3}}]]}))))))

    (testing "Bin two columns"
      (is (= [[10.0 -170.0 1] [32.0 -120.0 4] [34.0 -120.0 57] [36.0 -125.0 29] [40.0 -75.0 9]]
             (mt/formatted-rows [1.0 1.0 int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]
                  :breakout    [[:field %latitude {:binning {:strategy :num-bins, :num-bins 20}}]
                                [:field %longitude {:binning {:strategy :num-bins, :num-bins 20}}]]})))))

    (testing "should default to 8 bins when number of bins isn't specified"
      (is (= [[10.0 1] [30.0 90] [40.0 9]]
             (mt/formatted-rows [1.0 int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]
                  :breakout    [[:field %latitude {:binning {:strategy :default}}]]}))))

      (mt/with-temporary-setting-values [breakout-bin-width 5.0]
        (is (= [[10.0 1] [30.0 61] [35.0 29] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:count]]
                    :breakout    [[:field %latitude {:binning {:strategy :default}}]]}))))))

    (testing "bin width"
      (is (= [[10.0 1] [33.0 4] [34.0 57] [37.0 29] [40.0 9]]
             (mt/formatted-rows [1.0 int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]
                  :breakout    [[:field %latitude {:binning {:strategy :bin-width, :bin-width 1}}]]}))))

      (testing "using a float"
        (is (= [[10.0 1] [32.5 61] [37.5 29] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:count]]
                    :breakout    [[:field %latitude {:binning {:strategy :bin-width, :bin-width 2.5}}]]}))))

        (mt/with-temporary-setting-values [breakout-bin-width 1.0]
          (is (= [[33.0 4] [34.0 57]]
                 (mt/formatted-rows [1.0 int]
                   (mt/run-mbql-query venues
                     {:aggregation [[:count]]
                      :filter      [:and
                                    [:< $latitude 35]
                                    [:> $latitude 20]]
                      :breakout    [[:field %latitude {:binning {:strategy :default}}]]})))))))))

(defn- round-binning-decimals [result]
  (let [round-to-decimal #(u/round-to-decimals 4 %)]
    (-> result
        (update :min_value round-to-decimal)
        (update :max_value round-to-decimal)
        (update-in [:binning_info :min_value] round-to-decimal)
        (update-in [:binning_info :max_value] round-to-decimal))))

(deftest binning-info-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "Validate binning info is returned with the binning-strategy"
      (testing "binning-strategy = default"
        ;; base_type can differ slightly between drivers and it's really not important for the purposes of this test
        (is (= (assoc (dissoc (qp.test/breakout-col :venues :latitude) :base_type)
                      :binning_info {:min_value 10.0, :max_value 50.0, :num_bins 4, :bin_width 10.0, :binning_strategy :bin-width}
                      :field_ref    [:field (mt/id :venues :latitude) {:binning {:strategy  :bin-width
                                                                                 :min-value 10.0
                                                                                 :max-value 50.0
                                                                                 :num-bins  4
                                                                                 :bin-width 10.0}}])
               (-> (mt/run-mbql-query venues
                     {:aggregation [[:count]]
                      :breakout    [[:field %latitude {:binning {:strategy :default}}]]})
                   qp.test/cols
                   first
                   (dissoc :base_type)))))

      (testing "binning-strategy = num-bins: 5"
        (is (= (assoc (dissoc (qp.test/breakout-col :venues :latitude) :base_type)
                      :binning_info {:min_value 7.5, :max_value 45.0, :num_bins 5, :bin_width 7.5, :binning_strategy :num-bins}
                      :field_ref    [:field (mt/id :venues :latitude) {:binning {:strategy  :num-bins
                                                                                 :min-value 7.5
                                                                                 :max-value 45.0
                                                                                 :num-bins  5
                                                                                 :bin-width 7.5}}])
               (-> (mt/run-mbql-query venues
                     {:aggregation [[:count]]
                      :breakout    [[:field %latitude {:binning {:strategy :num-bins, :num-bins 5}}]]})
                   qp.test/cols
                   first
                   (dissoc :base_type))))))))

(deftest binning-error-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (mt/with-temp-vals-in-db Field (mt/id :venues :latitude) {:fingerprint {:type {:type/Number {:min nil, :max nil}}}}
      (is (= {:status :failed
              :class  clojure.lang.ExceptionInfo
              :error  "Unable to bin Field without a min/max value"}
             (-> (qp/process-userland-query
                  (mt/mbql-query venues
                    {:aggregation [[:count]]
                     :breakout    [[:field %latitude {:binning {:strategy :default}}]]}))
                 (select-keys [:status :class :error])))))))

(defn- nested-venues-query [card-or-card-id]
  {:database mbql.s/saved-questions-virtual-database-id
   :type     :query
   :query    {:source-table (str "card__" (u/the-id card-or-card-id))
              :aggregation  [[:count]]
              :breakout     [[:field
                              (mt/format-name :latitude)
                              {:base-type :type/Float, :binning {:strategy :num-bins, :num-bins 20}}]]}})

(deftest bin-nested-queries-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning :nested-queries)
    (testing "Binning should be allowed on nested queries that have result metadata"
      (mt/with-temp Card [card (qp.test-util/card-with-source-metadata-for-query
                                (mt/mbql-query nil
                                  {:source-query {:source-table $$venues}}))]
        (is (= [[10.0 1] [32.0 4] [34.0 57] [36.0 29] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (qp/process-query (nested-venues-query card)))))))

    (testing "should be able to use :default binning in a nested query"
      (mt/with-temporary-setting-values [breakout-bin-width 5.0]
        (is (= [[10.0 1] [30.0 61] [35.0 29] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (mt/run-mbql-query venues
                   {:source-query
                    {:source-table $$venues
                     :aggregation  [[:count]]
                     :breakout     [[:field %latitude {:binning {:strategy :default}}]]}}))))))

    (testing "Binning is not supported when there is no fingerprint to determine boundaries"
      ;; Unfortunately our new `add-source-metadata` middleware is just too good at what it does and will pull in
      ;; metadata from the source query, so disable that for now so we can make sure the `update-binning-strategy`
      ;; middleware is doing the right thing
      (with-redefs [add-source-metadata/mbql-source-query->metadata (constantly nil)]
        (mt/with-temp Card [card {:dataset_query (mt/mbql-query venues)}]
          (mt/with-temp-vals-in-db Card (:id card) {:result_metadata nil}
            (is (thrown-with-msg?
                 Exception
                 #"Cannot update binned field: query is missing source-metadata"
                 (qp.test/rows
                   (qp/process-query
                    (nested-venues-query card)))))))))))

(deftest bin-nested-query-with-temporal-bucketing-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning :nested-queries)
    (testing "Should be able to auto-bin an aggregate column from a source query if it has result metadata (#12568)"
      (let [source-query (mt/mbql-query checkins
                           {:aggregation [[:count]]
                            :breakout    [!week.date]})]
        (mt/with-temp Card [card {:dataset_query   source-query
                                  :result_metadata (#'api.card/validate-or-recalculate-results-metadata
                                                    source-query nil nil)}]
          (testing (format "\nResult metadata =\n%s" (u/pprint-to-str (:result_metadata card)))
            (is (= [[0 12] [2 20] [4 44] [6 33] [8 20] [10 12] [12 7] [14 7] [16 2]]
                   (mt/formatted-rows [int int]
                     (mt/run-mbql-query checkins
                       {:source-table (format "card__%d" (u/the-id card))
                        :aggregation  [[:count]]
                        :breakout     [[:field "count" {:base-type :type/BigInteger
                                                        :binning   {:strategy "default"}}]]}))))))))))
