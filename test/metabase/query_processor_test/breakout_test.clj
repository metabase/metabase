(ns metabase.query-processor-test.breakout-test
  "Tests for the `:breakout` clause."
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models
             [card :refer [Card]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]
             [field-values :refer [FieldValues]]]
            [metabase.query-processor.middleware
             [add-dimension-projections :as add-dim-projections]
             [add-source-metadata :as add-source-metadata]]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.util.log :as tu.log]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; single column
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[1 31] [2 70] [3 75] [4 77] [5 69] [6 70] [7 76] [8 81] [9 68] [10 78] [11 74] [12 59] [13 76] [14 62] [15 34]]
   :cols [(qp.test/breakout-col :checkins :user_id)
          (qp.test/aggregate-col :count)]}
  (qp.test/rows-and-cols
   (qp.test/format-rows-by [int int]
     (data/run-mbql-query checkins
       {:aggregation [[:count]]
        :breakout    [$user_id]
        :order-by    [[:asc $user_id]]}))))

;;; BREAKOUT w/o AGGREGATION
;; This should act as a "distinct values" query and return ordered results
(qp.test/expect-with-non-timeseries-dbs
  {:cols [(qp.test/breakout-col :checkins :user_id)]
   :rows [[1] [2] [3] [4] [5] [6] [7] [8] [9] [10]]}
  (qp.test/rows-and-cols
   (qp.test/format-rows-by [int]
     (data/run-mbql-query checkins
       {:breakout [$user_id]
        :limit    10}))))


;;; "BREAKOUT" - MULTIPLE COLUMNS W/ IMPLICT "ORDER_BY"
;; Fields should be implicitly ordered :ASC for all the fields in `breakout` that are not specified in `order-by`
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[1 1 1] [1 5 1] [1 7 1] [1 10 1] [1 13 1] [1 16 1] [1 26 1] [1 31 1] [1 35 1] [1 36 1]]
   :cols [(qp.test/breakout-col :checkins :user_id)
          (qp.test/breakout-col :checkins :venue_id)
          (qp.test/aggregate-col :count)]}
  (qp.test/rows-and-cols
   (qp.test/format-rows-by [int int int]
     (data/run-mbql-query checkins
       {:aggregation [[:count]]
        :breakout    [$user_id $venue_id]
        :limit       10}))))

;;; "BREAKOUT" - MULTIPLE COLUMNS W/ EXPLICIT "ORDER_BY"
;; `breakout` should not implicitly order by any fields specified in `order-by`
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[15 2 1] [15 3 1] [15 7 1] [15 14 1] [15 16 1] [15 18 1] [15 22 1] [15 23 2] [15 24 1] [15 27 1]]
   :cols [(qp.test/breakout-col :checkins :user_id)
          (qp.test/breakout-col :checkins :venue_id)
          (qp.test/aggregate-col :count)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int int int]
      (data/run-mbql-query checkins
        {:aggregation [[:count]]
         :breakout    [$user_id $venue_id]
         :order-by    [[:desc $user_id]]
         :limit       10}))))

;; TODO - I have no idea what exactly this test is testing??? Someone please determine and then write a description.
(deftest mystery-test
  (mt/test-drivers (mt/normal-drivers)
    (data/with-temp-objects
      (fn []
        (let [venue-names (data/dataset-field-values "categories" "name")]
          [(db/insert! Dimension {:field_id (data/id :venues :category_id)
                                  :name     "Foo"
                                  :type     :internal})
           (db/insert! FieldValues {:field_id              (data/id :venues :category_id)
                                    :values                (json/generate-string (range 0 (count venue-names)))
                                    :human_readable_values (json/generate-string venue-names)})]))
      (let [{:keys [rows cols]} (qp.test/rows-and-cols
                                  (qp.test/format-rows-by [int int str]
                                    (data/run-mbql-query venues
                                      {:aggregation [[:count]]
                                       :breakout    [$category_id]
                                       :limit       5})))]
        (is (= [(assoc (qp.test/breakout-col :venues :category_id)
                       :remapped_to "Foo")
                (qp.test/aggregate-col :count)
                (#'add-dim-projections/create-remapped-col "Foo" (data/format-name "category_id"))]
               cols))
        (is (= [[2 8 "Artisan"]
                [3 2 "Asian"]
                [4 2 "BBQ"]
                [5 7 "Bakery"]
                [6 2 "Bar"]]
               rows))))))

(deftest order-by-test
  (datasets/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (data/with-temp-objects
      (fn []
        [(db/insert! Dimension {:field_id                (data/id :venues :category_id)
                                :name                    "Foo"
                                :type                    :external
                                :human_readable_field_id (data/id :categories :name)})])
      (are [expected sort-order] (testing (format "sort order = %s" sort-order)
                                   (is (= expected
                                          (->> (data/run-mbql-query venues
                                                 {:order-by [[sort-order $category_id]]
                                                  :limit    10})
                                               qp.test/rows
                                               (mapv last)))))
        ["Wine Bar" "Thai" "Thai" "Thai" "Thai" "Steakhouse" "Steakhouse" "Steakhouse" "Steakhouse" "Southern"]
        :desc

        ["American" "American" "American" "American" "American" "American" "American" "American" "Artisan" "Artisan"]
        :asc))))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning)
  [[10.0 1] [32.0 4] [34.0 57] [36.0 29] [40.0 9]]
  (qp.test/formatted-rows [1.0 int]
    (data/run-mbql-query venues
      {:aggregation [[:count]]
       :breakout    [[:binning-strategy $latitude :num-bins 20]]})))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning)
  [[0.0 1] [20.0 90] [40.0 9]]
  (qp.test/formatted-rows [1.0 int]
    (data/run-mbql-query venues
      {:aggregation [[:count]]
       :breakout    [[:binning-strategy $latitude :num-bins 3]]})))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning)
  [[10.0 -170.0 1] [32.0 -120.0 4] [34.0 -120.0 57] [36.0 -125.0 29] [40.0 -75.0 9]]
  (qp.test/formatted-rows [1.0 1.0 int]
    (data/run-mbql-query venues
      {:aggregation [[:count]]
       :breakout    [[:binning-strategy $latitude :num-bins 20]
                     [:binning-strategy $longitude :num-bins 20]]})))

;; Currently defaults to 8 bins when the number of bins isn't
;; specified
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning)
  [[10.0 1] [30.0 90] [40.0 9]]
  (qp.test/formatted-rows [1.0 int]
    (data/run-mbql-query venues
      {:aggregation [[:count]]
       :breakout    [[:binning-strategy $latitude :default]]})))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning)
  [[10.0 1] [30.0 61] [35.0 29] [40.0 9]]
  (tu/with-temporary-setting-values [breakout-bin-width 5.0]
    (qp.test/formatted-rows [1.0 int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :breakout    [[:binning-strategy $latitude :default]]}))))

;; Can I use `:default` binning in a nested query?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning)
  [[10.0 1] [30.0 61] [35.0 29] [40.0 9]]
  (tu/with-temporary-setting-values [breakout-bin-width 5.0]
    (qp.test/formatted-rows [1.0 int]
      (data/run-mbql-query venues
        {:source-query
         {:source-table $$venues
          :aggregation  [[:count]]
          :breakout     [[:binning-strategy $latitude :default]]}}))))

;; Testing bin-width
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning)
  [[10.0 1] [33.0 4] [34.0 57] [37.0 29] [40.0 9]]
  (qp.test/formatted-rows [1.0 int]
    (data/run-mbql-query venues
      {:aggregation [[:count]]
       :breakout    [[:binning-strategy $latitude :bin-width 1]]})))

;; Testing bin-width using a float
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning)
  [[10.0 1] [32.5 61] [37.5 29] [40.0 9]]
  (qp.test/formatted-rows [1.0 int]
    (data/run-mbql-query venues
      {:aggregation [[:count]]
       :breakout    [[:binning-strategy $latitude :bin-width 2.5]]})))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning)
  [[33.0 4] [34.0 57]]
  (tu/with-temporary-setting-values [breakout-bin-width 1.0]
    (qp.test/formatted-rows [1.0 int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :filter      [:and
                       [:< $latitude 35]
                       [:> $latitude 20]]
         :breakout    [[:binning-strategy $latitude :default]]}))))

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
               (-> (data/run-mbql-query venues
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
               (-> (data/run-mbql-query venues
                     {:aggregation [[:count]]
                      :breakout    [[:binning-strategy $latitude :num-bins 5]]})
                   qp.test/cols
                   first
                   (dissoc :base_type))))))))

(deftest binning-error-test
  (mt/test-drivers (mt/normal-drivers-with-feature :binning)
    (tu.log/suppress-output
      (tu/with-temp-vals-in-db Field (data/id :venues :latitude) {:fingerprint {:type {:type/Number {:min nil, :max nil}}}}
        (is (= {:status :failed
                :class  clojure.lang.ExceptionInfo
                :error  "Unable to bin Field without a min/max value"}
               (-> (qp/process-userland-query
                    (data/mbql-query venues
                      {:aggregation [[:count]]
                       :breakout    [[:binning-strategy $latitude :default]]}))
                   (select-keys [:status :class :error]))))))))

(defn- nested-venues-query [card-or-card-id]
  {:database mbql.s/saved-questions-virtual-database-id
   :type     :query
   :query    {:source-table (str "card__" (u/get-id card-or-card-id))
              :aggregation  [:count]
              :breakout     [[:binning-strategy [:field-literal (data/format-name :latitude) :type/Float] :num-bins 20]]}})

;; Binning should be allowed on nested queries that have result metadata
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning :nested-queries)
  [[10.0 1] [32.0 4] [34.0 57] [36.0 29] [40.0 9]]
  (tt/with-temp Card [card (qp.test-util/card-with-source-metadata-for-query
                            (data/mbql-query nil
                              {:source-query {:source-table $$venues}}))]
    (qp.test/formatted-rows [1.0 int]
      (qp/process-query
        (nested-venues-query card)))))

;; Binning is not supported when there is no fingerprint to determine boundaries
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning :nested-queries)
  Exception
  (tu.log/suppress-output
    ;; Unfortunately our new `add-source-metadata` middleware is just too good at what it does and will pull in
    ;; metadata from the source query, so disable that for now so we can make sure the `update-binning-strategy`
    ;; middleware is doing the right thing
    (with-redefs [add-source-metadata/mbql-source-query->metadata (constantly nil)]
      (tt/with-temp Card [card {:dataset_query (data/mbql-query venues)}]
        (qp.test/rows
          (qp/process-query
            (nested-venues-query card)))))))

;; if we include a Field in both breakout and fields, does the query still work? (Normalization should be taking care
;; of this) (#8760)
(qp.test/expect-with-non-timeseries-dbs
  :completed
  (:status
   (data/run-mbql-query venues
     {:breakout [$price]
      :fields   [$price]})))
