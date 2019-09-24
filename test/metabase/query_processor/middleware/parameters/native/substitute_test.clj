(ns metabase.query-processor.middleware.parameters.native.substitute-test
  (:require [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.middleware.parameters.native
             [interface :as i]
             [substitute :as substitute]]
            [metabase.test.data :as data]))

(defn- optional [& args] (i/->Optional args))
(defn- param [param-name] (i/->Param param-name))

(defn- substitute [parsed param->value]
  (driver/with-driver :h2
    (substitute/substitute parsed param->value)))

;; normal substitution
(expect
  ["select * from foobars where bird_type = ?" ["Steller's Jay"]]
  (substitute
   ["select * from foobars where bird_type = " (param "bird_type")]
   {"bird_type" "Steller's Jay"}))

;; make sure falsey values are substituted correctly
;; `nil` should get substituted as `NULL`
(expect
  ["select * from foobars where bird_type = NULL" []]
  (substitute
   ["select * from foobars where bird_type = " (param "bird_type")]
   {"bird_type" nil}))

;; `false` should get substituted as `false`
(expect
  ["select * from foobars where bird_type = FALSE" []]
  (substitute
   ["select * from foobars where bird_type = " (param "bird_type")]
   {"bird_type" false}))

;; optional substitution -- param present
(expect
  ;; should preserve whitespace inside optional params
  ["select * from foobars  where bird_type = ?" ["Steller's Jay"]]
  (substitute
   ["select * from foobars " (optional " where bird_type = " (param "bird_type"))]
   {"bird_type" "Steller's Jay"}))

;; optional substitution -- param not present
(expect
  ["select * from foobars" nil]
  (substitute
   ["select * from foobars " (optional " where bird_type = " (param "bird_type"))]
   {}))

;; optional -- multiple params -- all present
(expect
  ["select * from foobars  where bird_type = ? AND color = ?" ["Steller's Jay" "Blue"]]
  (substitute
   ["select * from foobars " (optional " where bird_type = " (param "bird_type") " AND color = " (param "bird_color"))]
   {"bird_type" "Steller's Jay", "bird_color" "Blue"}))

;; optional -- multiple params -- some present
(expect
  ["select * from foobars" nil]
  (substitute
   ["select * from foobars " (optional " where bird_type = " (param "bird_type") " AND color = " (param "bird_color"))]
   {"bird_type" "Steller's Jay"}))

;; nested optionals -- all present
(expect
  ["select * from foobars  where bird_type = ? AND color = ?" ["Steller's Jay" "Blue"]]
  (substitute
   ["select * from foobars " (optional " where bird_type = " (param "bird_type")
                                       (optional " AND color = " (param "bird_color")))]
   {"bird_type" "Steller's Jay", "bird_color" "Blue"}))

;; nested optionals -- some present
(expect
  ["select * from foobars  where bird_type = ?" ["Steller's Jay"]]
  (substitute
   ["select * from foobars " (optional " where bird_type = " (param "bird_type")
                                       (optional " AND color = " (param "bird_color")))]
   {"bird_type" "Steller's Jay"}))

;;; ------------------------------------------------- Field Filters --------------------------------------------------

(defn- date-field-filter-value
  "Field filter 'values' returned by the `values` namespace are actualy `FieldFilter` record types that contain information about"
  []
  (i/map->FieldFilter
   {:field (Field (data/id :checkins :date))
    :value {:type  :date/single
            :value #inst "2019-09-20T19:52:00.000-07:00"}}))

;; field filter -- non-optional + present
(expect
  ["select * from checkins where CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = ?"
   [#inst "2019-09-20T19:52:00.000-07:00"]]
  (substitute
   ["select * from checkins where " (param "date")]
   {"date" (date-field-filter-value)}))

;; field filter -- non-optional + missing -- should be replaced with 1 = 1
(expect
  ["select * from checkins where 1 = 1" []]
  (substitute
   ["select * from checkins where " (param "date")]
   {"date" (assoc (date-field-filter-value) :value i/no-value)}))

;; field filter -- optional + present
(expect
  ["select * from checkins where CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) = ?"
   [#inst "2019-09-20T19:52:00.000-07:00"]]
  (substitute
   ["select * from checkins " (optional "where " (param "date"))]
   {"date" (date-field-filter-value)}))

;; field filter -- optional + missing -- should be omitted entirely
(expect
  ["select * from checkins" nil]
  (substitute
   ["select * from checkins " (optional "where " (param "date"))]
   {"date" (assoc (date-field-filter-value) :value i/no-value)}))
