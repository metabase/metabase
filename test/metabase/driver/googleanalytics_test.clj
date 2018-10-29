(ns metabase.driver.googleanalytics-test
  "Tests for the Google Analytics driver and query processor."
  (:require [expectations :refer [expect]]
            [medley.core :as m]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.driver.googleanalytics.query-processor :as ga.qp]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.data.users :as users]
            [metabase.test.util :as tu]
            [metabase.util.date :as du]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        MBQL->NATIVE (QUERY -> GA QUERY)                                        |
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
  (mbql->native {:query {:aggregation [[:metric "ga:users"]]}}))


;; query with metric (aggregation) + breakout
(expect
  (ga-query {:metrics    "ga:users"
             :dimensions "ga:browser"})
  (mbql->native {:query {:aggregation [[:metric "ga:users"]]
                         :breakout    [[:field-literal "ga:browser"]]}}))


;; query w/ segment (filter)
(expect
  (ga-query {:segment "gaid::-4"})
  (mbql->native {:query {:filter [:segment "gaid::-4"]}}))


;; query w/ non-segment filter
(expect
  (ga-query {:filters "ga:continent==North America"})
  (mbql->native {:query {:filter [:= [:field-literal "ga:continent"] [:value "North America"]]}}))

;; query w/ segment & non-segment filter
(expect
  (ga-query {:filters "ga:continent==North America"
             :segment "gaid::-4"})
  (mbql->native {:query {:filter [:and
                                  [:segment "gaid::-4"]
                                  [:= [:field-literal "ga:continent"] [:value "North America"]]]}}))

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


;;; ----------------------------------------------- (Almost) E2E tests -----------------------------------------------

(defn- do-with-some-fields [f]
  (tt/with-temp* [Database [db                 {:engine :googleanalytics}]
                  Table    [table              {:name "98765432"}]
                  Field    [event-action-field {:name "ga:eventAction", :base_type "type/Text"}]
                  Field    [event-label-field  {:name "ga:eventLabel", :base_type "type/Text"}]
                  Field    [date-field         {:name "ga:date", :base_type "type/Date"}]]
    (f {:db                 db
        :table              table
        :event-action-field event-action-field
        :event-label-field  event-label-field
        :date-field         date-field})))

;; let's try a real-life GA query and see how it looks when it's all put together. This one has already been
;; preprocessed, so we're just checking it gets converted to the correct native query
(def ^:private expected-ga-query
  {:query {:ids                "ga:98765432"
           :dimensions         "ga:eventLabel"
           :metrics            "ga:totalEvents"
           :segment            "gaid::-4"
           :start-date         "30daysAgo"
           :end-date           "yesterday"
           :filters            "ga:eventAction==Run Query;ga:eventLabel!=(not set);ga:eventLabel!=url"
           :sort               "ga:eventLabel"
           :max-results        10000
           :include-empty-rows false}
   :mbql? true})

(defn- preprocessed-query-with-some-fields [{:keys [db table event-action-field event-label-field date-field]}]
  {:database (u/get-id db)
   :type     :query
   :query    {:source-table
              (u/get-id table)

              :aggregation
              [[:metric "ga:totalEvents"]]

              :breakout
              [[:field-id (u/get-id event-label-field)]]

              :filter
              [:and
               [:segment "gaid::-4"]
               [:=
                [:field-id (u/get-id event-action-field)]
                [:value "Run Query" {:base_type :type/Text, :special_type nil, :database_type "VARCHAR"}]]
               [:between
                [:datetime-field [:field-id (u/get-id date-field)] :day]
                [:relative-datetime -30 :day]
                [:relative-datetime -1 :day]]
               [:!=
                [:field-id (u/get-id event-label-field)]
                [:value "(not set)" {:base_type :type/Text, :special_type nil, :database_type "VARCHAR"}]]
               [:!=
                [:field-id (u/get-id event-label-field)]
                [:value "url" {:base_type :type/Text, :special_type nil, :database_type "VARCHAR"}]]]

              :order-by
              [[:asc [:field-id (u/get-id event-label-field)]]]}})

(expect
  expected-ga-query
  (do-with-some-fields
   (fn [{:keys [table event-action-field event-label-field date-field], :as objects}]
     (qp.store/with-store
       (qp.store/store-table! table)
       (doseq [field [event-action-field event-label-field date-field]]
         (qp.store/store-field! field))
       (ga.qp/mbql->native (preprocessed-query-with-some-fields objects))))))

;; this was the above query before it was preprocessed. Make sure we actually handle everything correctly end-to-end
;; for the entire preprocessing process
(defn- query-with-some-fields [{:keys [db table event-action-field event-label-field date-field]}]
  {:database (u/get-id db)
   :type     :query
   :query    {:source-table (u/get-id table)
              :aggregation  [[:metric "ga:totalEvents"]]
              :filter       [:and
                             [:segment "gaid::-4"]
                             [:= [:field-id (u/get-id event-action-field)] "Run Query"]
                             [:time-interval [:field-id (u/get-id date-field)] -30 :day]
                             [:!= [:field-id (u/get-id event-label-field)] "(not set)" "url"]]
              :breakout     [[:field-id (u/get-id event-label-field)]]}})

(expect
  expected-ga-query
  (do-with-some-fields
   (comp metabase.query-processor/query->native query-with-some-fields)))

;; ok, now do the same query again, but run the entire QP pipeline, swapping out a few things so nothing is actually
;; run externally.
(expect
  {:row_count 1
   :status    :completed
   :data      {:columns     [:ga:eventLabel :ga:totalEvents]
               :rows        [["Toucan Sighting" 1000]]
               :native_form expected-ga-query
               :cols        [{:description     "This is ga:eventLabel"
                              :special_type    nil
                              :name            "ga:eventLabel"
                              :settings        nil
                              :source          :breakout
                              :parent_id       nil
                              :visibility_type :normal
                              :display_name    "ga:eventLabel"
                              :fingerprint     nil
                              :base_type       :type/Text}
                             {:name         "metric"
                              :display_name "metric"
                              :source       :aggregation
                              :description  "This is metric"
                              :base_type    :type/Text}]}}
  (with-redefs [metabase.driver.googleanalytics/memoized-column-metadata (fn [_ column-name]
                                                                           {:display_name column-name
                                                                            :description  (str "This is " column-name)
                                                                            :base_type    :type/Text})]
    (do-with-some-fields
     (fn [objects]
       (let [results {:columns [:ga:eventLabel :ga:totalEvents]
                      :cols    [{}, {:base_type :type/Text}]
                      :rows    [["Toucan Sighting" 1000]]}
             qp      (#'metabase.query-processor/qp-pipeline (constantly results))
             query   (query-with-some-fields objects)]
         (-> (tu/doall-recursive (qp query))
             (update-in [:data :cols] #(for [col %]
                                         (dissoc col :table_id :id)))
             (m/dissoc-in [:data :results_metadata])
             (m/dissoc-in [:data :insights])))))))


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
