(ns metabase.query-processor.middleware.auto-bucket-datetime-breakouts-test
  (:require [expectations :refer [expect]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.middleware.auto-bucket-datetime-breakouts :as auto-bucket-datetime-breakouts]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

(defn- auto-bucket [query]
  ((auto-bucket-datetime-breakouts/auto-bucket-datetime-breakouts identity)
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
