(ns metabase.driver.googleanalytics-test
  "Tests for the Google Analytics driver and query processor."
  (:require [expectations :refer [expect]]
            [metabase.driver.googleanalytics.query-processor :as ga.qp]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.data.users :as users]
            [metabase.util :as u]
            [metabase.util.date :as du]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             QUERY "TRANSFORMATION"                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - I think we might want to move these to the GA QP test namespace?

;; check that a built-in Metric gets removed from the query and put in `:ga`
(expect
  {:ga {:segment nil, :metrics "ga:users"}}
  (ga.qp/transform-query {:query {:aggregation [[:metric "ga:users"]]}}))


;; check that a built-in segment gets removed from the query and put in `:ga`
(expect
  {:ga {:segment "gaid::-4", :metrics nil}}
  (ga.qp/transform-query {:query {:filter [:segment "gaid::-4"]}}))

;; check that other things stay in the order-by clause
(expect
  {:query {:filter [:< [:field-id 100] 200]}
   :ga    {:segment nil, :metrics nil}}
  (ga.qp/transform-query {:query {:filter [:< [:field-id 100] 200]}}))

(expect
  {:query {:filter [:< [:field-id 100] 200]}
   :ga    {:segment nil, :metrics nil}}
  (ga.qp/transform-query {:query {:filter [:< [:field-id 100] 200]}}))

(expect
  {:query {:filter [:< [:field-id 100] 200]}
   :ga    {:segment "gaid::-4", :metrics nil}}
  (ga.qp/transform-query {:query {:filter [:and [:segment "gaid::-4"]
                                           [:< [:field-id 100] 200]]}}))


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
  (binding [qp.store/*store* (atom {:tables {1 #metabase.models.table.TableInstance{:name   "0123456"
                                                                                    :schema nil
                                                                                    :id     1}}})]
    (ga.qp/mbql->native (update query :query (partial merge {:source-table 1})))))

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
  (mbql->native {:query {:breakout [[:field-literal "ga:browser"]]}
                 :ga    {:metrics "ga:users"}}))


;; query w/ segment (filter)
(expect
  (ga-query {:segment "gaid::-4"})
  (mbql->native {:ga {:segment "gaid::-4"}}))


;; query w/ non-segment filter
(expect
  (ga-query {:filters "ga:continent==North America"})
  (mbql->native {:query {:filter [:= [:field-literal "ga:continent"] [:value "North America"]]}}))

;; query w/ segment & non-segment filter
(expect
  (ga-query {:filters "ga:continent==North America"
             :segment "gaid::-4"})
  (mbql->native {:query {:filter [:= [:field-literal "ga:continent"] [:value "North America"]]}
                 :ga    {:segment "gaid::-4"}}))

;; query w/ date filter
(defn- ga-date-field [unit]
  [:datetime-field [:field-literal "ga:date"] unit])

;; absolute date
(expect
  (ga-query {:start-date "2016-11-08", :end-date "2016-11-08"})
  (mbql->native {:query {:filter [:= (ga-date-field :day) [:absolute-datetime #inst "2016-11-08" :day]]}}))

;; relative date -- last month
(expect
  (ga-query {:start-date (du/format-date "yyyy-MM-01" (du/relative-date :month -1))
             :end-date   (du/format-date "yyyy-MM-01")})
  (mbql->native {:query {:filter [:= (ga-date-field :month) [:relative-datetime -1 :month]]}}))

;; relative date -- this month
(expect
  (ga-query {:start-date (du/format-date "yyyy-MM-01")
             :end-date   (du/format-date "yyyy-MM-01" (du/relative-date :month 1))})
  (mbql->native {:query {:filter [:= (ga-date-field :month) [:relative-datetime 0 :month]]}}))

;; relative date -- next month
(expect
  (ga-query {:start-date (du/format-date "yyyy-MM-01" (du/relative-date :month 1))
             :end-date   (du/format-date "yyyy-MM-01" (du/relative-date :month 2))})
  (mbql->native {:query {:filter [:= (ga-date-field :month) [:relative-datetime 1 :month]]}}))

;; relative date -- 2 months from now
(expect
  (ga-query {:start-date (du/format-date "yyyy-MM-01" (du/relative-date :month 2))
             :end-date   (du/format-date "yyyy-MM-01" (du/relative-date :month 3))})
  (mbql->native {:query {:filter [:= (ga-date-field :month) [:relative-datetime 2 :month]]}}))

;; relative date -- last year
(expect
  (ga-query {:start-date (du/format-date "yyyy-01-01" (du/relative-date :year -1))
             :end-date   (du/format-date "yyyy-01-01")})
  (mbql->native {:query {:filter [:= (ga-date-field :year) [:relative-datetime -1 :year]]}}))

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
                                    :query    {:source-table (u/get-id table)
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
