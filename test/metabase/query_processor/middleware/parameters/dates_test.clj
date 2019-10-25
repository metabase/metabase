(ns metabase.query-processor.middleware.parameters.dates-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.parameters.dates :as dates]))

;; year and month
(expect
  {:end "2019-04-30", :start "2019-04-01"}
  (dates/date-string->range "2019-04" "UTC"))

(expect
  [:between
   [:datetime-field [:field-literal "field" :type/DateTime] :day]
   "2019-04-01"
   "2019-04-30"]
  (dates/date-string->filter "2019-04" [:field-literal "field" :type/DateTime]))

;; quarter year
(expect
  {:start "2019-04-01", :end "2019-06-30"}
  (dates/date-string->range "Q2-2019" "UTC"))

(expect
 [:between
  [:datetime-field [:field-literal "field" :type/DateTime] :day]
  "2019-04-01"
  "2019-06-30"]
 (dates/date-string->filter "Q2-2019" [:field-literal "field" :type/DateTime]))

;; single day
(expect
  {:start "2019-04-01", :end "2019-04-01"}
  (dates/date-string->range "2019-04-01" "UTC"))

(expect
  [:=
   [:datetime-field [:field-literal "field" :type/DateTime] :day]
   "2019-04-01"]
  (dates/date-string->filter "2019-04-01" [:field-literal "field" :type/DateTime]))

;; day range
(expect
  {:start "2019-04-01", :end "2019-04-03"}
  (dates/date-string->range "2019-04-01~2019-04-03" "UTC"))

(expect
  [:between
   [:datetime-field [:field-literal "field" :type/DateTime] :day]
   "2019-04-01"
   "2019-04-03"]
  (dates/date-string->filter "2019-04-01~2019-04-03" [:field-literal "field" :type/DateTime]))

;; after day
(expect
 {:start "2019-04-01"}
 (dates/date-string->range "2019-04-01~" "UTC"))

(expect
  [:>
   [:datetime-field [:field-literal "field" :type/DateTime] :day]
   "2019-04-01"]
  (dates/date-string->filter "2019-04-01~" [:field-literal "field" :type/DateTime]))
