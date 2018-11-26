(ns metabase.query-processor.middleware.auto-bucket-datetimes-test
  (:require [expectations :refer [expect]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.middleware.auto-bucket-datetimes :as auto-bucket-datetimes]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

(defn- auto-bucket [query]
  ((auto-bucket-datetimes/auto-bucket-datetimes identity)
   query))

(defn- auto-bucket-mbql [mbql-query]
  (-> (auto-bucket {:database (data/id), :type :query, :query mbql-query})
      :query))

;; does a :type/DateTime Field get auto-bucketed when present in a breakout clause?
(tt/expect-with-temp [Field [field {:base_type :type/DateTime, :special_type nil}]]
  {:source-table 1
   :breakout     [[:datetime-field [:field-id (u/get-id field)] :day]]}
  (auto-bucket-mbql
   {:source-table 1
    :breakout     [[:field-id (u/get-id field)]]}))

;; does the Field get bucketed if present in the `:filter` clause? (#8932)
;;
;; e.g. `[:= <field> "2018-11-19"] should get rewritten as `[:= [:datetime-field <field> :day] "2018-11-19"]` if
;; `<field>` is a `:type/DateTime` Field
(tt/expect-with-temp [Field [field {:base_type :type/DateTime, :special_type nil}]]
  {:source-table 1
   :filter       [:= [:datetime-field [:field-id (u/get-id field)] :day] "2018-11-19"]}
  (auto-bucket-mbql
   {:source-table 1
    :filter       [:= [:field-id (u/get-id field)] "2018-11-19"]}))

;; On the other hand, we shouldn't auto-bucket Fields inside a filter clause if they are being compared against a
;; datetime string that includes more than just yyyy-MM-dd:
(tt/expect-with-temp [Field [field {:base_type :type/DateTime, :special_type nil}]]
  {:source-table 1
   :filter       [:= [:field-id (u/get-id field)] "2018-11-19T14:11:00"]}
  (auto-bucket-mbql
   {:source-table 1
    :filter       [:= [:field-id (u/get-id field)] "2018-11-19T14:11:00"]}))

;; for breakouts or other filters with multiple args, all args must be yyyy-MM-dd
(tt/expect-with-temp [Field [field {:base_type :type/DateTime, :special_type nil}]]
  {:source-table 1
   :filter       [:between [:datetime-field [:field-id (u/get-id field)] :day] "2018-11-19" "2018-11-20"]}
  (auto-bucket-mbql
   {:source-table 1
    :filter       [:between [:field-id (u/get-id field)] "2018-11-19" "2018-11-20"]}))

(tt/expect-with-temp [Field [field {:base_type :type/DateTime, :special_type nil}]]
  {:source-table 1
   :filter       [:between [:field-id (u/get-id field)] "2018-11-19" "2018-11-20T14:20:00.000Z"]}
  (auto-bucket-mbql
   {:source-table 1
    :filter       [:between [:field-id (u/get-id field)] "2018-11-19" "2018-11-20T14:20:00.000Z"]}))

;; if a Field occurs more than once we should only rewrite the instances that should be rebucketed
(tt/expect-with-temp [Field [field {:base_type :type/DateTime, :special_type nil}]]
  {:source-table 1
   :breakout     [[:datetime-field [:field-id (u/get-id field)] :day]]
   :filter       [:= [:field-id (u/get-id field)] "2018-11-20T14:20:00.000Z"]}
  (auto-bucket-mbql
   {:source-table 1
    :breakout     [[:field-id (u/get-id field)]]
    :filter       [:= [:field-id (u/get-id field)] "2018-11-20T14:20:00.000Z"]}))

(tt/expect-with-temp [Field [field {:base_type :type/DateTime, :special_type nil}]]
  {:source-table 1
   :breakout       [[:datetime-field [:field-id (u/get-id field)] :month]]
   :filter         [:= [:datetime-field [:field-id (u/get-id field)] :day] "2018-11-20"]}
  (auto-bucket-mbql
   {:source-table 1
    :breakout     [[:datetime-field [:field-id (u/get-id field)] :month]]
    :filter       [:= [:field-id (u/get-id field)] "2018-11-20"]}))

;; or if they are used in a non-equality or non-comparison filter clause, for example `:is-null`:
(tt/expect-with-temp [Field [field {:base_type :type/DateTime, :special_type nil}]]
  {:source-table 1
   :filter       [:is-null [:field-id (u/get-id field)]]}
  (auto-bucket-mbql
   {:source-table 1
    :filter       [:is-null [:field-id (u/get-id field)]]}))

;; however, we should not try to bucket Fields inside a `time-interval` clause as that would be invalid
(tt/expect-with-temp [Field [field {:base_type :type/DateTime, :special_type nil}]]
  {:source-table 1
   :filter       [:time-interval [:field-id (u/get-id field)] -30 :day]}
  (auto-bucket-mbql
   {:source-table 1
    :filter       [:time-interval [:field-id (u/get-id field)] -30 :day]}))

;; we also should not auto-bucket Fields that are `:type/Time`, because grouping a Time Field by day makes ZERO SENSE.
(tt/expect-with-temp [Field [field {:base_type :type/Time, :special_type nil}]]
  {:source-table 1
   :breakout     [[:field-id (u/get-id field)]]}
  (auto-bucket-mbql
   {:source-table 1
    :breakout     [[:field-id (u/get-id field)]]}))

;; should be considered to be :type/DateTime based on `special_type` as well
(tt/expect-with-temp [Field [field {:base_type :type/Integer, :special_type :type/DateTime}]]
  {:source-table 1
   :breakout     [[:datetime-field [:field-id (u/get-id field)] :day]]}
  (auto-bucket-mbql
   {:source-table 1
    :breakout     [[:field-id (u/get-id field)]]}))

;; do native queries pass thru unchanged?
(let [native-query {:database 1, :type :native, :native {:query "SELECT COUNT(cans) FROM birds;"}}]
  (expect
    native-query
    (auto-bucket native-query)))

;; do MBQL queries w/o breakouts pass thru unchanged?
(expect
  {:source-table 1}
  (auto-bucket-mbql
   {:source-table 1}))

;; does a breakout Field that isn't :type/DateTime pass thru unchnaged?
(tt/expect-with-temp [Field [field {:base_type :type/Integer, :special_type nil}]]
  {:source-table 1
   :breakout     [[:field-id (u/get-id field)]]}
  (auto-bucket-mbql
   {:source-table 1
    :breakout     [[:field-id (u/get-id field)]]}))

;; does a :type/DateTime breakout Field that is already bucketed pass thru unchanged?
(tt/expect-with-temp [Field [field {:base_type :type/DateTime, :special_type nil}]]
  {:source-table 1
   :breakout     [[:datetime-field [:field-id (u/get-id field)] :month]]}
  (auto-bucket-mbql
   {:source-table 1
    :breakout     [[:datetime-field [:field-id (u/get-id field)] :month]]}))

;; does the middleware avoid barfing if for some reason the Field could not be resolved in the DB? (That is the job of
;; the resolve middleware to worry about that stuff.)
(expect
  {:source-table 1
   :breakout     [[:field-id Integer/MAX_VALUE]]}
  (auto-bucket-mbql
   {:source-table 1
    :breakout     [[:field-id Integer/MAX_VALUE]]}))

;; do UNIX TIMESTAMP datetime fields get auto-bucketed?
(expect
  (data/dataset sad-toucan-incidents
    (data/$ids incidents
      {:source-table $$table
       :breakout     [[:datetime-field [:field-id $timestamp] :day]]}))
  (data/dataset sad-toucan-incidents
    (data/$ids incidents
      (auto-bucket-mbql
       {:source-table $$table
        :breakout     [[:field-id $timestamp]]}))))
