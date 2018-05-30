(ns metabase.driver.googleanalytics-test
  "Tests for the Google Analytics driver and query processor."
  (:require [expectations :refer :all]
            [metabase.driver.googleanalytics.query-processor :as qp]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.interface :as qpi]
            [metabase.test.data.users :as users]
            [metabase.util :as u]
            [metabase.util.date :as du]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             QUERY "TRANSFORMATION"                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; check that a built-in Metric gets removed from the query and put in `:ga`
(expect
  {:query {:filter nil}
   :ga    {:segment nil, :metrics "ga:users"}}
  (qp/transform-query {:query {:aggregation ["METRIC" "ga:users"]}}))


;; check that a built-in segment gets removed from the query and put in `:ga`
(expect
  {:query {:filter nil}
   :ga    {:segment "gaid::-4", :metrics nil}}
  (qp/transform-query {:query {:filter [:segment "gaid::-4"]}}))

;; check that it still works if wrapped in an `:and`
(expect
  {:query {:filter nil}
   :ga    {:segment "gaid::-4", :metrics nil}}
  (qp/transform-query {:query {:filter [:and [:segment "gaid::-4"]]}}))

;; check that other things stay in the order-by clause
(expect
  {:query {:filter [:< 100 200]}
   :ga    {:segment nil, :metrics nil}}
  (qp/transform-query {:query {:filter [:< 100 200]}}))

(expect
  {:query {:filter [:and [:< 100 200]]}
   :ga    {:segment nil, :metrics nil}}
  (qp/transform-query {:query {:filter [:and [:< 100 200]]}}))

(expect
  {:query {:filter [:and [:< 100 200]]}
   :ga    {:segment "gaid::-4", :metrics nil}}
  (qp/transform-query {:query {:filter [:and [:segment "gaid::-4"]
                                             [:< 100 200]]}}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   MBQL->NATIVE (EXPANDED QUERY -> GA QUERY)                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- ga-query [inner-query]
  {:query (merge {:ids                "ga:0123456"
                  :dimensions         ""
                  :start-date         "2005-01-01"
                  :end-date           "today"
                  :max-results        10000
                  :include-empty-rows false}
                 inner-query)
   :mbql? true})

(defn- mbql->native [query]
  (qp/mbql->native (update query :query (partial merge {:source-table {:name "0123456"}}))))

;; just check that a basic almost-empty MBQL query can be compiled
(expect
  (ga-query {})
  (mbql->native {}))


;; try a basic query with a metric (aggregation)
(expect
  (ga-query {:metrics "ga:users"})
  (mbql->native {:ga {:metrics "ga:users"}}))


;; query with metric (aggregation) + breakout
(expect
  (ga-query {:metrics    "ga:users"
             :dimensions "ga:browser"})
  (mbql->native {:query {:breakout [(qpi/map->Field {:field-name "ga:browser"})]}
                 :ga    {:metrics "ga:users"}}))


;; query w/ segment (filter)
(expect
  (ga-query {:segment "gaid::-4"})
  (mbql->native {:ga {:segment "gaid::-4"}}))


;; query w/ non-segment filter
(expect
  (ga-query {:filters "ga:continent==North America"})
  (mbql->native {:query {:filter {:filter-type :=
                                  :field       (qpi/map->Field {:field-name "ga:continent"})
                                  :value       (qpi/map->Value {:value "North America"})}}}))

;; query w/ segment & non-segment filter
(expect
  (ga-query {:filters "ga:continent==North America"
             :segment "gaid::-4"})
  (mbql->native {:query {:filter {:filter-type :=
                                  :field       (qpi/map->Field {:field-name "ga:continent"})
                                  :value       (qpi/map->Value {:value "North America"})}}
                 :ga    {:segment "gaid::-4"}}))

;; query w/ date filter
(defn- ga-date-field [unit]
  (qpi/map->DateTimeField {:field (qpi/map->Field {:field-name "ga:date"})
                           :unit unit}))

;; absolute date
(expect
  (ga-query {:start-date "2016-11-08", :end-date "2016-11-08"})
  (mbql->native {:query {:filter {:filter-type :=
                                  :field       (ga-date-field :day)
                                  :value       (qpi/map->DateTimeValue {:value #inst "2016-11-08"
                                                                        :field (ga-date-field :day)})}}}))

;; relative date -- last month
(expect
  (ga-query {:start-date (du/format-date "yyyy-MM-01" (du/relative-date :month -1))
             :end-date   (du/format-date "yyyy-MM-01")})
  (mbql->native {:query {:filter {:filter-type :=
                                  :field       (ga-date-field :month)
                                  :value       (qpi/map->RelativeDateTimeValue {:amount -1
                                                                                :unit   :month
                                                                                :field  (ga-date-field :month)})}}}))

;; relative date -- this month
(expect
  (ga-query {:start-date (du/format-date "yyyy-MM-01")
             :end-date   (du/format-date "yyyy-MM-01" (du/relative-date :month 1))})
  (mbql->native {:query {:filter {:filter-type :=
                                  :field       (ga-date-field :month)
                                  :value       (qpi/map->RelativeDateTimeValue {:amount 0
                                                                                :unit   :month
                                                                                :field  (ga-date-field :month)})}}}))

;; relative date -- next month
(expect
  (ga-query {:start-date (du/format-date "yyyy-MM-01" (du/relative-date :month 1))
             :end-date   (du/format-date "yyyy-MM-01" (du/relative-date :month 2))})
  (mbql->native {:query {:filter {:filter-type :=
                                  :field       (ga-date-field :month)
                                  :value       (qpi/map->RelativeDateTimeValue {:amount 1
                                                                                :unit   :month
                                                                                :field  (ga-date-field :month)})}}}))

;; relative date -- 2 months from now
(expect
  (ga-query {:start-date (du/format-date "yyyy-MM-01" (du/relative-date :month 2))
             :end-date   (du/format-date "yyyy-MM-01" (du/relative-date :month 3))})
  (mbql->native {:query {:filter {:filter-type :=
                                  :field       (ga-date-field :month)
                                  :value       (qpi/map->RelativeDateTimeValue {:amount 2
                                                                                :unit   :month
                                                                                :field  (ga-date-field :month)})}}}))

;; relative date -- last year
(expect
  (ga-query {:start-date (du/format-date "yyyy-01-01" (du/relative-date :year -1))
             :end-date   (du/format-date "yyyy-01-01")})
  (mbql->native {:query {:filter {:filter-type :=
                                  :field       (ga-date-field :year)
                                  :value       (qpi/map->RelativeDateTimeValue {:amount -1
                                                                                :unit   :year
                                                                                :field  (ga-date-field :year)})}}}))

;; limit
(expect
  (ga-query {:max-results 25})
  (mbql->native {:query {:limit 25}}))


;;; ------------------------------------------------ Saving GA Cards -------------------------------------------------

;; Can we *save* a GA query that has two aggregations?

(expect
  1
  (tt/with-temp* [Database [db    {:engine :googleanalytics}]
                  Table    [table {:db_id (u/get-id db)}]
                  Field    [field {:table_id (u/get-id table)}]]
    (->> ((users/user->client :crowberto) :post 200 "card"
          {:name                   "Metabase Websites, Sessions and 1 Day Active Users, Grouped by Date (day)"
           :display                :table
           :visualization_settings {}
           :dataset_query          {:database (u/get-id db)
                                    :type     :query
                                    :query    {:source_table (u/get-id table)
                                               :aggregation  [[:METRIC "ga:sessions"]
                                                              [:METRIC "ga:1dayUsers"]]
                                               :breakout     [[:datetime-field [:field-id (u/get-id field)] :day]]}}
           :result_metadata        [{:base_type    :type/Date
                                     :display_name :Date
                                     :name         "ga:date"
                                     :description  "The date of the session formatted as YYYYMMDD."
                                     :unit         :day}
                                    {:base_type    :type/Integer
                                     :display_name "Ga:1day Users"
                                     :name         "ga:1dayUsers"}
                                    {:base_type    :type/Integer
                                     :display_name "Ga:sessions"
                                     :name         "ga:sessions"}]
           :metadata_checksum      "VRyGLaFPj6T9RTIgMFvyAA=="})
         ;; just make sure the API call actually worked by checking that the created Card is actually successfully
         ;; saved in the DB
         u/get-id
         (db/count Card :id))))
