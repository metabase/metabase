(ns metabase.query-processor-test.breakout-test
  "Tests for the `:breakout` clause."
  (:require [cheshire.core :as json]
            [metabase
             [query-processor :as qp]
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]
             [field-values :refer [FieldValues]]]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dim-projections]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :as datasets]]
            [metabase.test.util.log :as tu.log]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; single column
(qp-expect-with-all-engines
  {:rows        [[1 31] [2 70] [3 75] [4 77] [5 69] [6 70] [7 76] [8 81] [9 68] [10 78] [11 74] [12 59] [13 76] [14 62] [15 34]]
   :columns     [(data/format-name "user_id")
                 "count"]
   :cols        [(breakout-col (checkins-col :user_id))
                 (aggregate-col :count)]
   :native_form true}
  (->> (data/run-mbql-query checkins
         {:aggregation [[:count]]
          :breakout    [$user_id]
          :order-by    [[:asc $user_id]]})
       booleanize-native-form
       (format-rows-by [int int])
       tu/round-fingerprint-cols))

;;; BREAKOUT w/o AGGREGATION
;; This should act as a "distinct values" query and return ordered results
(qp-expect-with-all-engines
  {:cols        [(breakout-col (checkins-col :user_id))]
   :columns     [(data/format-name "user_id")]
   :rows        [[1] [2] [3] [4] [5] [6] [7] [8] [9] [10]]
   :native_form true}
  (->> (data/run-mbql-query checkins
         {:breakout [$user_id]
          :limit    10})
       booleanize-native-form
       (format-rows-by [int])
       tu/round-fingerprint-cols))


;;; "BREAKOUT" - MULTIPLE COLUMNS W/ IMPLICT "ORDER_BY"
;; Fields should be implicitly ordered :ASC for all the fields in `breakout` that are not specified in `order-by`
(qp-expect-with-all-engines
  {:rows        [[1 1 1] [1 5 1] [1 7 1] [1 10 1] [1 13 1] [1 16 1] [1 26 1] [1 31 1] [1 35 1] [1 36 1]]
   :columns     [(data/format-name "user_id")
                 (data/format-name "venue_id")
                 "count"]
   :cols        [(breakout-col (checkins-col :user_id))
                 (breakout-col (checkins-col :venue_id))
                 (aggregate-col :count)]
   :native_form true}
  (->> (data/run-mbql-query checkins
         {:aggregation [[:count]]
          :breakout    [$user_id $venue_id]
          :limit       10})
       booleanize-native-form
       (format-rows-by [int int int])
       tu/round-fingerprint-cols))

;;; "BREAKOUT" - MULTIPLE COLUMNS W/ EXPLICIT "ORDER_BY"
;; `breakout` should not implicitly order by any fields specified in `order-by`
(qp-expect-with-all-engines
  {:rows        [[15 2 1] [15 3 1] [15 7 1] [15 14 1] [15 16 1] [15 18 1] [15 22 1] [15 23 2] [15 24 1] [15 27 1]]
   :columns     [(data/format-name "user_id")
                 (data/format-name "venue_id")
                 "count"]
   :cols        [(breakout-col (checkins-col :user_id))
                 (breakout-col (checkins-col :venue_id))
                 (aggregate-col :count)]
   :native_form true}
  (->> (data/run-mbql-query checkins
         {:aggregation [[:count]]
          :breakout    [$user_id $venue_id]
          :order-by    [[:desc $user_id]]
          :limit       10})
       booleanize-native-form
       (format-rows-by [int int int])
       tu/round-fingerprint-cols))

(qp-expect-with-all-engines
  {:rows        [[2 8 "Artisan"]
                 [3 2 "Asian"]
                 [4 2 "BBQ"]
                 [5 7 "Bakery"]
                 [6 2 "Bar"]]
   :columns     [(data/format-name "category_id")
                 "count"
                 "Foo"]
   :cols        [(assoc (breakout-col (venues-col :category_id))
                   :remapped_to "Foo")
                 (aggregate-col :count)
                 (#'add-dim-projections/create-remapped-col "Foo" (data/format-name "category_id"))]
   :native_form true}
  (data/with-data
    (fn []
      (let [venue-names (defs/field-values defs/test-data-map "categories" "name")]
        [(db/insert! Dimension {:field_id (data/id :venues :category_id)
                                :name     "Foo"
                                :type     :internal})
         (db/insert! FieldValues {:field_id              (data/id :venues :category_id)
                                  :values                (json/generate-string (range 0 (count venue-names)))
                                  :human_readable_values (json/generate-string venue-names)})]))
    (->> (data/run-mbql-query venues
           {:aggregation [[:count]]
            :breakout    [$category_id]
            :limit       5})
         booleanize-native-form
         (format-rows-by [int int str])
         tu/round-fingerprint-cols)))

(datasets/expect-with-engines (non-timeseries-engines-with-feature :foreign-keys)
  [["Wine Bar" "Thai" "Thai" "Thai" "Thai" "Steakhouse" "Steakhouse" "Steakhouse" "Steakhouse" "Southern"]
   ["American" "American" "American" "American" "American" "American" "American" "American" "Artisan" "Artisan"]]
  (data/with-data
    (fn []
      [(db/insert! Dimension {:field_id                (data/id :venues :category_id)
                              :name                    "Foo"
                              :type                    :external
                              :human_readable_field_id (data/id :categories :name)})])
    [(->> (data/run-mbql-query venues
            {:order-by [[:desc $category_id]]
             :limit    10})
           rows
           (map last))
     (->> (data/run-mbql-query venues
            {:order-by [[:asc $category_id]]
             :limit    10})
           rows
           (map last))]))

(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning)
  [[10.0 1] [32.0 4] [34.0 57] [36.0 29] [40.0 9]]
  (format-rows-by [(partial u/round-to-decimals 1) int]
    (rows (data/run-mbql-query venues
            {:aggregation [[:count]]
             :breakout    [[:binning-strategy $latitude :num-bins 20]]}))))

(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning)
  [[0.0 1] [20.0 90] [40.0 9]]
  (format-rows-by [(partial u/round-to-decimals 1) int]
    (rows (data/run-mbql-query venues
            {:aggregation [[:count]]
             :breakout    [[:binning-strategy $latitude :num-bins 3]]}))))

(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning)
  [[10.0 -170.0 1] [32.0 -120.0 4] [34.0 -120.0 57] [36.0 -125.0 29] [40.0 -75.0 9]]
  (format-rows-by [(partial u/round-to-decimals 1) (partial u/round-to-decimals 1) int]
    (rows (data/run-mbql-query venues
            {:aggregation [[:count]]
             :breakout    [[:binning-strategy $latitude :num-bins 20]
                           [:binning-strategy $longitude :num-bins 20]]}))))

;; Currently defaults to 8 bins when the number of bins isn't
;; specified
(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning)
  [[10.0 1] [30.0 90] [40.0 9]]
  (format-rows-by [(partial u/round-to-decimals 1) int]
    (rows (data/run-mbql-query venues
            {:aggregation [[:count]]
             :breakout    [[:binning-strategy $latitude :default]]}))))

(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning)
  [[10.0 1] [30.0 61] [35.0 29] [40.0 9]]
  (tu/with-temporary-setting-values [breakout-bin-width 5.0]
    (format-rows-by [(partial u/round-to-decimals 1) int]
      (rows (data/run-mbql-query venues
              {:aggregation [[:count]]
               :breakout    [[:binning-strategy $latitude :default]]})))))

;; Testing bin-width
(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning)
  [[10.0 1] [33.0 4] [34.0 57] [37.0 29] [40.0 9]]
  (format-rows-by [(partial u/round-to-decimals 1) int]
    (rows (data/run-mbql-query venues
            {:aggregation [[:count]]
             :breakout    [[:binning-strategy $latitude :bin-width 1]]}))))

;; Testing bin-width using a float
(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning)
  [[10.0 1] [32.5 61] [37.5 29] [40.0 9]]
  (format-rows-by [(partial u/round-to-decimals 1) int]
    (rows (data/run-mbql-query venues
            {:aggregation [[:count]]
             :breakout    [[:binning-strategy $latitude :bin-width 2.5]]}))))

(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning)
  [[33.0 4] [34.0 57]]
  (tu/with-temporary-setting-values [breakout-bin-width 1.0]
    (format-rows-by [(partial u/round-to-decimals 1) int]
      (rows (data/run-mbql-query venues
              {:aggregation [[:count]]
               :filter      [:and
                             [:< $latitude 35]
                             [:> $latitude 20]]
               :breakout    [[:binning-strategy $latitude :default]]})))))

(defn- round-binning-decimals [result]
  (let [round-to-decimal #(u/round-to-decimals 4 %)]
    (-> result
        (update :min_value round-to-decimal)
        (update :max_value round-to-decimal)
        (update-in [:binning_info :min_value] round-to-decimal)
        (update-in [:binning_info :max_value] round-to-decimal))))

;;Validate binning info is returned with the binning-strategy
(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning)
  (assoc (breakout-col (venues-col :latitude))
    :binning_info {:min_value 10.0, :max_value 50.0, :num_bins 4, :bin_width 10.0, :binning_strategy :bin-width})
  (-> (data/run-mbql-query venues
        {:aggregation [[:count]]
         :breakout    [[:binning-strategy $latitude :default]]})
      tu/round-fingerprint-cols
      (get-in [:data :cols])
      first))

(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning)
  (assoc (breakout-col (venues-col :latitude))
    :binning_info {:min_value 7.5, :max_value 45.0, :num_bins 5, :bin_width 7.5, :binning_strategy :num-bins})
  (-> (data/run-mbql-query venues
        {:aggregation [[:count]]
         :breakout    [[:binning-strategy $latitude :num-bins 5]]})
      tu/round-fingerprint-cols
      (get-in [:data :cols])
      first))

;;Validate binning info is returned with the binning-strategy
(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning)
  {:status :failed
   :class  Exception
   :error  "Unable to bin Field without a min/max value"}
  (tu/with-temp-vals-in-db Field (data/id :venues :latitude) {:fingerprint {:type {:type/Number {:min nil, :max nil}}}}
    (-> (tu.log/suppress-output
          (data/run-mbql-query venues
            {:aggregation [[:count]]
             :breakout    [[:binning-strategy $latitude :default]]}))
        (select-keys [:status :class :error]))))

(defn- field->result-metadata [field]
  (select-keys field [:name :display_name :description :base_type :special_type :unit :fingerprint]))

(defn- nested-venues-query [card-or-card-id]
  {:database metabase.models.database/virtual-id
   :type     :query
   :query    {:source-table (str "card__" (u/get-id card-or-card-id))
              :aggregation  [:count]
              :breakout     [[:binning-strategy [:field-literal (data/format-name :latitude) :type/Float] :num-bins 20]]}})

;; Binning should be allowed on nested queries that have result metadata
(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning :nested-queries)
  [[10.0 1] [32.0 4] [34.0 57] [36.0 29] [40.0 9]]
  (tt/with-temp Card [card {:dataset_query   {:database (data/id)
                                              :type     :query
                                              :query    {:source-query {:source-table (data/id :venues)}}}
                            :result_metadata (mapv field->result-metadata (db/select Field :table_id (data/id :venues)))}]
    (->> (nested-venues-query card)
         qp/process-query
         rows
         (format-rows-by [(partial u/round-to-decimals 1) int]))))

;; Binning is not supported when there is no fingerprint to determine boundaries
(datasets/expect-with-engines (non-timeseries-engines-with-feature :binning :nested-queries)
  Exception
  (tu.log/suppress-output
    (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                              :type     :query
                                              :query    {:source-query {:source-table (data/id :venues)}}}}]
      (-> (nested-venues-query card)
          qp/process-query
          rows))))

;; if we include a Field in both breakout and fields, does the query still work? (Normalization should be taking care
;; of this) (#8760)
(expect-with-non-timeseries-dbs
  :completed
  (-> (qp/process-query
        {:database (data/id)
         :type     :query
         :query    {:source-table (data/id :venues)
                    :breakout     [[:field-id (data/id :venues :price)]]
                    :fields       [["field_id" (data/id :venues :price)]]}})
      :status))
