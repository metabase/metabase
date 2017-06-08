(ns metabase.query-processor-test.breakout-test
  "Tests for the `:breakout` clause."
  (:require [cheshire.core :as json]
            [metabase.query-processor-test :refer :all]
            [metabase.query-processor.middleware
             [expand :as ql]
             [add-dimension-projections :as dim-proj]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.models
             [dimensions :refer [Dimensions]]
             [field-values :refer [FieldValues]]]
            [toucan.db :as db]
            [metabase.test.data.dataset-definitions :as defs]))

(tu/resolve-private-vars metabase.query-processor.middleware.add-dimension-projections create-remapped-col)

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

(qp-expect-with-all-engines
  {:rows  [[2 8 "Artisan"]
           [3 2 "Asian"]
           [4 2 "BBQ"]
           [5 7 "Bakery"]
           [6 2 "Bar"]]
   :columns [(data/format-name "category_id")
             "count"
             "Foo"]
   :cols    [(assoc (breakout-col (venues-col :category_id))
               :remapped_to "Foo")
             (aggregate-col :count)
             (create-remapped-col "Foo" (data/format-name "category_id"))]
   :native_form true}
  (data/with-data
    (fn []
      (let [venue-names (defs/field-values defs/test-data-map "categories" "name")]
        [(db/insert! Dimensions {:field_id (data/id :venues :category_id)
                                 :name "Foo"
                                 :type :internal})
         (db/insert! FieldValues {:field_id (data/id :venues :category_id)
                                  :values (json/generate-string (range 0 (count venue-names)))
                                  :human_readable_values (json/generate-string venue-names)})]))
    (->> (data/run-query venues
           (ql/aggregation (ql/count))
           (ql/breakout $category_id)
           (ql/limit 5))
         booleanize-native-form
         (format-rows-by [int int str]))))
