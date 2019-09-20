(ns metabase.query-processor.middleware.parameters.native.substitute-test
  (:require [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.models.field :refer [Field]]
            [metabase.test.data :as data]
            [metabase.query-processor.middleware.parameters.native
             [interface :as i]
             [substitute :as substitute]]))

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

;; field filter -- non-optional + present

;; field filter -- non-optional + missing -- should be replaced with 1 = 1

;; field filter -- optional + present

;; field filter -- optional + missing -- should be omitted entirely
