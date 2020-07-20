(ns metabase.query-processor-test.breakout-test
  "Tests for the `:breakout` clause."
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models
             [card :refer [Card]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]]
            [metabase.query-processor.middleware
             [add-dimension-projections :as add-dim-projections]
             [add-source-metadata :as add-source-metadata]]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test.data :as data]
            [toucan.db :as db]))

(deftest basic-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "single column"
      (testing "with breakout"
        (is (= {:rows [[1 31] [2 70] [3 75] [4 77] [5 69] [6 70] [7 76] [8 81] [9 68] [10 78] [11 74] [12 59] [13 76] [14 62] [15 34]]
                :cols [(qp.test/breakout-col :checkins :user_id)
                       (qp.test/aggregate-col :count)]}
               (qp.test/rows-and-cols
                 (mt/format-rows-by [int int]
                   (mt/run-mbql-query checkins
                     {:aggregation [[:count]]
                      :breakout    [$user_id]
                      :order-by    [[:asc $user_id]]}))))))

      (testing "without breakout"
        (testing "This should act as a \"distinct values\" query and return ordered results"
          (is (= {:cols [(qp.test/breakout-col :checkins :user_id)]
                  :rows [[1] [2] [3] [4] [5] [6] [7] [8] [9] [10]]}
                 (qp.test/rows-and-cols
                   (mt/format-rows-by [int]
                     (mt/run-mbql-query checkins
                       {:breakout [$user_id]
                        :limit    10}))))))))

    (testing "multiple columns"
      (testing "without explicit order by"
        (testing "Fields should be implicitly ordered :ASC for all the fields in `breakout` that are not specified in `order-by`"
          (is (= {:rows [[1 1 1] [1 5 1] [1 7 1] [1 10 1] [1 13 1] [1 16 1] [1 26 1] [1 31 1] [1 35 1] [1 36 1]]
                  :cols [(qp.test/breakout-col :checkins :user_id)
                         (qp.test/breakout-col :checkins :venue_id)
                         (qp.test/aggregate-col :count)]}
                 (qp.test/rows-and-cols
                   (mt/format-rows-by [int int int]
                     (mt/run-mbql-query checkins
                       {:aggregation [[:count]]
                        :breakout    [$user_id $venue_id]
                        :limit       10})))))))

      (testing "with explicit order by"
        (testing "`breakout` should not implicitly order by any fields specified in `order-by`"
          (is (= {:rows [[15 2 1] [15 3 1] [15 7 1] [15 14 1] [15 16 1] [15 18 1] [15 22 1] [15 23 2] [15 24 1] [15 27 1]]
                  :cols [(qp.test/breakout-col :checkins :user_id)
                         (qp.test/breakout-col :checkins :venue_id)
                         (qp.test/aggregate-col :count)]}
                 (qp.test/rows-and-cols
                   (mt/format-rows-by [int int int]
                     (mt/run-mbql-query checkins
                       {:aggregation [[:count]]
                        :breakout    [$user_id $venue_id]
                        :order-by    [[:desc $user_id]]
                        :limit       10}))))))))))

(deftest internal-remapping-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/with-temp-objects
      (data/create-venue-category-remapping! "Foo")
      (let [{:keys [rows cols]} (qp.test/rows-and-cols
                                  (mt/format-rows-by [int int str]
                                    (mt/run-mbql-query venues
                                      {:aggregation [[:count]]
                                       :breakout    [$category_id]
                                       :limit       5})))]
        (is (= [(assoc (qp.test/breakout-col :venues :category_id) :remapped_to "Foo")
                (qp.test/aggregate-col :count)
                (#'add-dim-projections/create-remapped-col "Foo" (mt/format-name "category_id") :type/Text)]
               cols))
        (is (= [[2 8 "American"]
                [3 2 "Artisan"]
                [4 2 "Asian"]
                [5 7 "BBQ"]
                [6 2 "Bakery"]]
               rows))))))

(deftest order-by-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (mt/with-temp-objects
      (fn []
        [(db/insert! Dimension {:field_id                (data/id :venues :category_id)
                                :name                    "Foo"
                                :type                    :external
                                :human_readable_field_id (data/id :categories :name)})])
      (doseq [[sort-order expected] {:desc ["Wine Bar" "Thai" "Thai" "Thai" "Thai" "Steakhouse" "Steakhouse"
                                            "Steakhouse" "Steakhouse" "Southern"]
                                     :asc  ["American" "American" "American" "American" "American" "American" "American"
                                            "American" "Artisan" "Artisan"]}]
        (testing (format "sort order = %s" sort-order)
          (is (= expected
                 (->> (mt/run-mbql-query venues
                        {:order-by [[sort-order $category_id]]
                         :limit    10})
                      qp.test/rows
                      (mapv last)))))))))

(deftest binning-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (testing "Bin single column"
      (testing "20 bins"
        (is (= [[10.0 1] [32.0 4] [34.0 57] [36.0 29] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:count]]
                    :breakout    [[:binning-strategy $latitude :num-bins 20]]})))))

      (testing "3 bins"
        (is (= [[0.0 1] [20.0 90] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:count]]
                    :breakout    [[:binning-strategy $latitude :num-bins 3]]}))))))

    (testing "Bin two columns"
      (is (= [[10.0 -170.0 1] [32.0 -120.0 4] [34.0 -120.0 57] [36.0 -125.0 29] [40.0 -75.0 9]]
             (mt/formatted-rows [1.0 1.0 int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]
                  :breakout    [[:binning-strategy $latitude :num-bins 20]
                                [:binning-strategy $longitude :num-bins 20]]})))))

    (testing "should default to 8 bins when number of bins isn't specified"
      (is (= [[10.0 1] [30.0 90] [40.0 9]]
             (mt/formatted-rows [1.0 int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]
                  :breakout    [[:binning-strategy $latitude :default]]}))))

      (mt/with-temporary-setting-values [breakout-bin-width 5.0]
        (is (= [[10.0 1] [30.0 61] [35.0 29] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:count]]
                    :breakout    [[:binning-strategy $latitude :default]]}))))))

    (testing "bin width"
      (is (= [[10.0 1] [33.0 4] [34.0 57] [37.0 29] [40.0 9]]
             (mt/formatted-rows [1.0 int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]
                  :breakout    [[:binning-strategy $latitude :bin-width 1]]}))))

      (testing "using a float"
        (is (= [[10.0 1] [32.5 61] [37.5 29] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:count]]
                    :breakout    [[:binning-strategy $latitude :bin-width 2.5]]}))))

        (mt/with-temporary-setting-values [breakout-bin-width 1.0]
          (is (= [[33.0 4] [34.0 57]]
                 (mt/formatted-rows [1.0 int]
                   (mt/run-mbql-query venues
                     {:aggregation [[:count]]
                      :filter      [:and
                                    [:< $latitude 35]
                                    [:> $latitude 20]]
                      :breakout    [[:binning-strategy $latitude :default]]})))))))))

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
                      :field_ref    [:binning-strategy (data/$ids venues $latitude) :bin-width nil
                                     {:min-value 10.0, :max-value 50.0, :num-bins 4, :bin-width 10.0}])
               (-> (mt/run-mbql-query venues
                     {:aggregation [[:count]]
                      :breakout    [[:binning-strategy $latitude :default]]})
                   qp.test/cols
                   first
                   (dissoc :base_type)))))

      (testing "binning-strategy = num-bins: 5"
        (is (= (assoc (dissoc (qp.test/breakout-col :venues :latitude) :base_type)
                      :binning_info {:min_value 7.5, :max_value 45.0, :num_bins 5, :bin_width 7.5, :binning_strategy :num-bins}
                      :field_ref    [:binning-strategy (data/$ids venues $latitude) :num-bins 5
                                     {:min-value 7.5, :max-value 45.0, :num-bins 5, :bin-width 7.5}])
               (-> (mt/run-mbql-query venues
                     {:aggregation [[:count]]
                      :breakout    [[:binning-strategy $latitude :num-bins 5]]})
                   qp.test/cols
                   first
                   (dissoc :base_type))))))))

(deftest binning-error-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (mt/suppress-output
      (mt/with-temp-vals-in-db Field (data/id :venues :latitude) {:fingerprint {:type {:type/Number {:min nil, :max nil}}}}
        (is (= {:status :failed
                :class  clojure.lang.ExceptionInfo
                :error  "Unable to bin Field without a min/max value"}
               (-> (qp/process-userland-query
                    (mt/mbql-query venues
                      {:aggregation [[:count]]
                       :breakout    [[:binning-strategy $latitude :default]]}))
                   (select-keys [:status :class :error]))))))))

(defn- nested-venues-query [card-or-card-id]
  {:database mbql.s/saved-questions-virtual-database-id
   :type     :query
   :query    {:source-table (str "card__" (u/get-id card-or-card-id))
              :aggregation  [:count]
              :breakout     [[:binning-strategy [:field-literal (mt/format-name :latitude) :type/Float] :num-bins 20]]}})

(deftest bin-nested-queries-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning :nested-queries)
    (testing "Binning should be allowed on nested queries that have result metadata"
      (mt/with-temp Card [card (qp.test-util/card-with-source-metadata-for-query
                                (mt/mbql-query nil
                                  {:source-query {:source-table $$venues}}))]
        (is (= [[10.0 1] [32.0 4] [34.0 57] [36.0 29] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (qp/process-query
                  (nested-venues-query card)))))))

    (testing "should be able to use :default binning in a nested query"
      (mt/with-temporary-setting-values [breakout-bin-width 5.0]
        (is (= [[10.0 1] [30.0 61] [35.0 29] [40.0 9]]
               (mt/formatted-rows [1.0 int]
                 (mt/run-mbql-query venues
                   {:source-query
                    {:source-table $$venues
                     :aggregation  [[:count]]
                     :breakout     [[:binning-strategy $latitude :default]]}}))))))

    (testing "Binning is not supported when there is no fingerprint to determine boundaries"
      ;; Unfortunately our new `add-source-metadata` middleware is just too good at what it does and will pull in
      ;; metadata from the source query, so disable that for now so we can make sure the `update-binning-strategy`
      ;; middleware is doing the right thing
      (with-redefs [add-source-metadata/mbql-source-query->metadata (constantly nil)]
        (mt/with-temp Card [card {:dataset_query (mt/mbql-query venues)}]
          (is (thrown?
               Exception
               (mt/suppress-output
                 (qp.test/rows
                   (qp/process-query
                    (nested-venues-query card)))))))))))

(deftest field-in-breakout-and-fields-test
  (mt/test-drivers (mt/normal-drivers)
    (testing (str "if we include a Field in both breakout and fields, does the query still work? (Normalization should "
                  "be taking care of this) (#8760)")
      (is (= :completed
             (:status
              (mt/run-mbql-query venues
                {:breakout [$price]
                 :fields   [$price]})))))))
