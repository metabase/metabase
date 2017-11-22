(ns metabase.api.x-ray-test
  "Tests for /api/x-ray endpoints"
  (:require [expectations :refer :all]
            [metabase.api.x-ray :refer :all]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database] :as database]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.test.async :refer :all]
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [toucan.util.test :as tt]))

(defn- async-call
  [method endpoint & args]
  (let [client (user->client :rasta)
        job-id (:job-id (apply client method 200 endpoint args))]
    (result! job-id)
    (:result (client :get 200 (str "async/" job-id)))))

(expect
  100.0
  (-> (async-call :get (str "x-ray/field/" (id :venues :price)))
      :features
      :count
      :value))

(expect
  100.0
  (-> (async-call :get (str "x-ray/table/" (id :venues)))
      :constituents
      :PRICE
      :count
      :value))

(def ^:private test-query
  {:database (id)
   :type :query
   :query {:source_table (id :checkins)
           :aggregation  [[:count]]
           :breakout     [[:datetime-field [:field-id (id :checkins :date)] :month]]}
   :parameters []})

(def ^:private test-card
  {:name          "test card"
   :dataset_query test-query})

(def ^:private test-segment
  {:name       "test segment"
   :table_id   (id :venues)
   :definition {:filter       [:= [:field-id (id :venues :category_id)] 7]
                :source_table (id :venues)}})

(expect
  1000.0
  (-> (async-call :post "x-ray/query" test-query)
      :constituents
      :count
      :sum
      :value))

(tt/expect-with-temp [Card [{card-id :id} test-card]]
  1000.0
  (-> (async-call :get (str "x-ray/card/" card-id))
      :constituents
      :count
      :sum
      :value))

(tt/expect-with-temp [Segment [{segment-id :id} test-segment]]
  10.0
  (-> (async-call :get (str "x-ray/segment/" segment-id))
      :constituents
      :PRICE
      :count
      :value))

(def ^:private test-metric
  {:definition {:aggregation [[:sum [:field-id (id :venues :price)]]]}
   :table_id   (id :venues)})

(tt/expect-with-temp [Metric [{metric-id :id} test-metric]]
  5
  (-> (async-call :get (str "x-ray/metric/" metric-id))
      :constituents
      count))

(expect
  true
  (:significant? (async-call :get (format "x-ray/compare/fields/%s/%s"
                                          (id :venues :price)
                                          (id :venues :category_id)))))

(expect
  false
  (boolean (:significant? (async-call :get (format "x-ray/compare/tables/%s/%s"
                                                   (id :venues)
                                                   (id :venues))))))

(tt/expect-with-temp [Segment [{segment1-id :id} test-segment]
                      Segment [{segment2-id :id}
                               (assoc-in test-segment [:definition :filter 2] 5)]]
  true
  (:significant? (async-call :get (format "x-ray/compare/segments/%s/%s"
                                          segment1-id
                                          segment2-id))))

(tt/expect-with-temp [Segment [{segment-id :id} test-segment]]
  true
  (:significant? (async-call :get (format "x-ray/compare/table/%s/segment/%s"
                                          (id :venues)
                                          segment-id))))

(expect
  [true
   false]
  [(-> (async-call :post "x-ray/query" test-query)
       :features
       :seasonal-decomposition
       :value
       :trend
       :rows
       count
       pos?)
   (-> (async-call :post "x-ray/query?max_computation_cost=linear" test-query)
       :features
       :seasonal-decomposition
       :value
       :trend
       :rows
       count
       pos?)])
