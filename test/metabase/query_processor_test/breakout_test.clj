(ns metabase.query-processor-test.breakout-test
  "Tests for the `:breakout` clause."
  (:require [metabase
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.expand :as ql]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [toucan.db :as db]))

;;; single column
(qp-expect-with-all-engines
  {:rows    [[1 31] [2 70] [3 75] [4 77] [5 69] [6 70] [7 76] [8 81] [9 68] [10 78] [11 74] [12 59] [13 76] [14 62] [15 34]]
   :columns [(data/format-name "user_id")
             "count"]
   :cols    [(breakout-col (checkins-col :user_id))
             (aggregate-col :count)]
   :native_form true}
  (->> (data/run-query checkins
         (ql/aggregation (ql/count))
         (ql/breakout $user_id)
         (ql/order-by (ql/asc $user_id)))
       booleanize-native-form
       (format-rows-by [int int])))

;;; BREAKOUT w/o AGGREGATION
;; This should act as a "distinct values" query and return ordered results
(qp-expect-with-all-engines
  {:cols    [(breakout-col (checkins-col :user_id))]
   :columns [(data/format-name "user_id")]
   :rows    [[1] [2] [3] [4] [5] [6] [7] [8] [9] [10]]
   :native_form true}
  (->> (data/run-query checkins
         (ql/breakout $user_id)
         (ql/limit 10))
       booleanize-native-form
       (format-rows-by [int])))


;;; "BREAKOUT" - MULTIPLE COLUMNS W/ IMPLICT "ORDER_BY"
;; Fields should be implicitly ordered :ASC for all the fields in `breakout` that are not specified in `order_by`
(qp-expect-with-all-engines
  {:rows    [[1 1 1] [1 5 1] [1 7 1] [1 10 1] [1 13 1] [1 16 1] [1 26 1] [1 31 1] [1 35 1] [1 36 1]]
   :columns [(data/format-name "user_id")
             (data/format-name "venue_id")
             "count"]
   :cols    [(breakout-col (checkins-col :user_id))
             (breakout-col (checkins-col :venue_id))
             (aggregate-col :count)]
   :native_form true}
  (->> (data/run-query checkins
         (ql/aggregation (ql/count))
         (ql/breakout $user_id $venue_id)
         (ql/limit 10))
       booleanize-native-form
       (format-rows-by [int int int])))

;;; "BREAKOUT" - MULTIPLE COLUMNS W/ EXPLICIT "ORDER_BY"
;; `breakout` should not implicitly order by any fields specified in `order_by`
(qp-expect-with-all-engines
  {:rows    [[15 2 1] [15 3 1] [15 7 1] [15 14 1] [15 16 1] [15 18 1] [15 22 1] [15 23 2] [15 24 1] [15 27 1]]
   :columns [(data/format-name "user_id")
             (data/format-name "venue_id")
             "count"]
   :cols    [(breakout-col (checkins-col :user_id))
             (breakout-col (checkins-col :venue_id))
             (aggregate-col :count)]
   :native_form true}
  (->> (data/run-query checkins
         (ql/aggregation (ql/count))
         (ql/breakout $user_id $venue_id)
         (ql/order-by (ql/desc $user_id))
         (ql/limit 10))
       booleanize-native-form
       (format-rows-by [int int int])))

(datasets/expect-with-engines (engines-that-support :binning)
  [[10.1 1] [33.1 61] [37.7 29] [39.2 8] [40.8 1]]
  (format-rows-by [(partial u/round-to-decimals 1) int]
    (rows (data/run-query venues
            (ql/aggregation (ql/count))
            (ql/breakout (ql/binning-strategy $latitude :num-bins 20))))))

(datasets/expect-with-engines (engines-that-support :binning)
 [[10.1 1] [30.5 99]]
  (format-rows-by [(partial u/round-to-decimals 1) int]
    (rows (data/run-query venues
            (ql/aggregation (ql/count))
            (ql/breakout (ql/binning-strategy $latitude :num-bins 3))))))

(datasets/expect-with-engines (engines-that-support :binning)
  [[10.1 -165.4 1] [33.1 -119.7 61] [37.7 -124.2 29] [39.2 -78.5 8] [40.8 -78.5 1]]
  (format-rows-by [(partial u/round-to-decimals 1) (partial u/round-to-decimals 1) int]
    (rows (data/run-query venues
            (ql/aggregation (ql/count))
            (ql/breakout (ql/binning-strategy $latitude :num-bins 20)
                         (ql/binning-strategy $longitude :num-bins 20))))))

;; Currently defaults to 8 bins when the number of bins isn't
;; specified
(datasets/expect-with-engines (engines-that-support :binning)
 [[10.1 1] [30.1 90] [40.1 9]]
  (format-rows-by [(partial u/round-to-decimals 1) int]
    (rows (data/run-query venues
            (ql/aggregation (ql/count))
            (ql/breakout (ql/binning-strategy $latitude :default))))))

(datasets/expect-with-engines (engines-that-support :binning)
 [[10.1 1] [30.1 61] [35.1 29] [40.1 9]]
  (tu/with-temporary-setting-values [breakout-bin-width 5.0]
    (format-rows-by [(partial u/round-to-decimals 1) int]
      (rows (data/run-query venues
              (ql/aggregation (ql/count))
              (ql/breakout (ql/binning-strategy $latitude :default)))))))

;; Testing bin-width
(datasets/expect-with-engines (engines-that-support :binning)
  [[10.1 1] [33.1 25] [34.1 36] [37.1 29] [40.1 9]]
  (format-rows-by [(partial u/round-to-decimals 1) int]
    (rows (data/run-query venues
            (ql/aggregation (ql/count))
            (ql/breakout (ql/binning-strategy $latitude :bin-width 1))))))

;; Testing bin-width using a float
(datasets/expect-with-engines (engines-that-support :binning)
   [[10.1 1] [32.6 61] [37.6 29] [40.1 9]]
  (format-rows-by [(partial u/round-to-decimals 1) int]
    (rows (data/run-query venues
            (ql/aggregation (ql/count))
            (ql/breakout (ql/binning-strategy $latitude :bin-width 2.5))))))

(datasets/expect-with-engines (engines-that-support :binning)
  [[33.0 4] [34.0 57]]
  (tu/with-temporary-setting-values [breakout-bin-width 1.0]
    (format-rows-by [(partial u/round-to-decimals 1) int]
      (rows (data/run-query venues
              (ql/aggregation (ql/count))
              (ql/filter (ql/and (ql/< $latitude 35)
                                 (ql/> $latitude 20)))
              (ql/breakout (ql/binning-strategy $latitude :default)))))))

(defn- round-binning-decimals [result]
  (let [round-to-decimal #(u/round-to-decimals 4 %)]
    (-> result
        (update :min_value round-to-decimal)
        (update :max_value round-to-decimal)
        (update-in [:binning_info :min_value] round-to-decimal)
        (update-in [:binning_info :max_value] round-to-decimal))))

;;Validate binning info is returned with the binning-strategy
(datasets/expect-with-engines (engines-that-support :binning)
  (merge (venues-col :latitude)
         {:min_value 10.0646, :source :breakout,
          :max_value 40.7794, :binning_info {:binning_strategy "num-bins", :bin_width 10.0,
                                             :num_bins         4.0,        :min_value 10.0646,
                                             :max_value        40.7794}})
  (-> (data/run-query venues
                      (ql/aggregation (ql/count))
                      (ql/breakout (ql/binning-strategy $latitude :default)))
      (get-in [:data :cols])
      first
      round-binning-decimals))

;;Validate binning info is returned with the binning-strategy
(datasets/expect-with-engines (engines-that-support :binning)
  {:status :failed
   :class Exception
   :error (format "Unable to bin field '%s' with id '%s' without a min/max value"
                  (:name (Field (data/id :venues :latitude)))
                  (data/id :venues :latitude))}
  (let [{:keys [min_value max_value]} (Field (data/id :venues :latitude))]
    (try
      (db/update! Field (data/id :venues :latitude) :min_value nil :max_value nil)
      (-> (data/run-query venues
            (ql/aggregation (ql/count))
            (ql/breakout (ql/binning-strategy $latitude :default)))
          (select-keys [:status :class :error]))
      (finally
        (db/update! Field (data/id :venues :latitude) :min_value min_value :max_value max_value)))))
