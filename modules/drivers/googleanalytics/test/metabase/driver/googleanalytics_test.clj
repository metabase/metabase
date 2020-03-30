(ns metabase.driver.googleanalytics-test
  "Tests for the Google Analytics driver and query processor."
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [models :refer [Card Database Field Table]]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            metabase.driver.googleanalytics
            [metabase.driver.googleanalytics
             [execute :as ga.execute]
             [query-processor :as ga.qp]]
            [metabase.query-processor
             [context :as qp.context]
             [store :as qp.store]]
            [metabase.test
             [data :as data]
             [fixtures :as fixtures]
             [util :as tu]]
            [metabase.test.data.users :as users]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(comment metabase.driver.googleanalytics/keep-me)

(use-fixtures :once (fixtures/initialize :db))

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
    (driver/mbql->native :googleanalytics (update query :query (partial merge {:source-table 1})))))

(deftest basic-compilation-test
  (testing "just check that a basic almost-empty MBQL query can be compiled"
    (is (= (ga-query {})
           (mbql->native {}))))
  (testing "try a basic query with a metric (aggregation)"
    (is (= (ga-query {:metrics "ga:users"})
           (mbql->native {:query {:aggregation [[:metric "ga:users"]]}}))))
  (testing "query with metric (aggregation) + breakout"
    (is (= (ga-query {:metrics    "ga:users"
                      :dimensions "ga:browser"})
           (mbql->native {:query {:aggregation [[:metric "ga:users"]]
                                  :breakout    [[:field-literal "ga:browser"]]}}))))
  (testing "query w/ segment (filter)"
    (is (= (ga-query {:segment "gaid::-4"})
           (mbql->native {:query {:filter [:segment "gaid::-4"]}}))))
  (testing "query w/ non-segment filter"
    (is (= (ga-query {:filters "ga:continent==North America"})
           (mbql->native {:query {:filter [:= [:field-literal "ga:continent"] [:value "North America"]]}}))))
  (testing "query w/ segment & non-segment filter"
    (is (= (ga-query {:filters "ga:continent==North America"
                      :segment "gaid::-4"})
           (mbql->native {:query {:filter [:and
                                           [:segment "gaid::-4"]
                                           [:= [:field-literal "ga:continent"] [:value "North America"]]]}})))))

(defn- ga-date-field [unit]
  [:datetime-field [:field-literal "ga:date"] unit])

(deftest filter-by-absolute-datetime-test
  (is (= (ga-query {:start-date "2016-11-08", :end-date "2016-11-08"})
         (mbql->native {:query {:filter [:= (ga-date-field :day) [:absolute-datetime (t/local-date "2016-11-08") :day]]}})))
  (testing "tests off by one day correction for gt/lt operators (GA doesn't support exclusive ranges)"
    (is (= (ga-query {:start-date "2016-11-09", :end-date "today"})
           (mbql->native {:query {:filter [:> (ga-date-field :day) [:absolute-datetime (t/local-date "2016-11-08") :day]]}})))
    (is (= (ga-query {:start-date "2005-01-01", :end-date "2016-10-01"})
           (mbql->native {:query {:filter [:< (ga-date-field :day) [:absolute-datetime (t/local-date "2016-10-02") :day]]}})))
    (is (= (ga-query {:start-date "2005-01-01", :end-date "2016-10-02"})
           (mbql->native {:query {:filter [:<= (ga-date-field :day) [:absolute-datetime (t/local-date "2016-10-02") :day]]}})))
    (is (= (ga-query {:start-date "2016-09-10", :end-date "2016-10-01"})
           (mbql->native {:query {:filter [:and
                                           [:< (ga-date-field :day) [:absolute-datetime (t/local-date "2016-10-02") :day]]
                                           [:> (ga-date-field :day) [:absolute-datetime (t/local-date "2016-09-09") :day]]]}})))
    (is (= (ga-query {:start-date "2016-09-10", :end-date "2016-10-02"})
           (mbql->native {:query {:filter [:and
                                           [:<= (ga-date-field :day) [:absolute-datetime (t/local-date "2016-10-02") :day]]
                                           [:> (ga-date-field :day) [:absolute-datetime (t/local-date "2016-09-09") :day]]]}})))))

(deftest filter-by-relative-date-test
  (mt/with-database-timezone-id nil
    (testing "\nsystem timezone should not affect the queries that get generated"
      (doseq [system-timezone-id ["UTC" "US/Pacific"]]
        (mt/with-system-timezone-id system-timezone-id
          (mt/with-clock (t/mock-clock (t/instant (t/zoned-date-time
                                                   (t/local-date "2019-11-18")
                                                   (t/local-time 0)
                                                   (t/zone-id system-timezone-id)))
                                       (t/zone-id system-timezone-id))
            (testing "last month"
              (is (= (ga-query {:start-date "2019-10-01"
                                :end-date   "2019-10-31"})
                     (mbql->native {:query {:filter [:= (ga-date-field :month) [:relative-datetime -1 :month]]}}))))
            (testing "this month"
              (is (= (ga-query {:start-date "2019-11-01"
                                :end-date   "2019-11-30"})
                     (mbql->native {:query {:filter [:= (ga-date-field :month) [:relative-datetime 0 :month]]}}))))
            (testing "next month"
              (is (= (ga-query {:start-date "2019-12-01"
                                :end-date   "2019-12-31"})
                     (mbql->native {:query {:filter [:= (ga-date-field :month) [:relative-datetime 1 :month]]}}))))
            (testing "month is 2 months from current month"
              (is (= (ga-query {:start-date "2020-01-01"
                                :end-date   "2020-01-31"})
                     (mbql->native {:query {:filter [:= (ga-date-field :month) [:relative-datetime 2 :month]]}}))))
            (testing "last year"
              (is (= (ga-query {:start-date "2018-01-01"
                                :end-date   "2018-12-31"})
                     (mbql->native {:query {:filter [:= (ga-date-field :year) [:relative-datetime -1 :year]]}}))))
            (testing "day is > yesterday (start-date should be today)"
              (is (= (ga-query {:start-date "today", :end-date "today"})
                     (mbql->native {:query {:filter [:> (ga-date-field :day) [:relative-datetime -1 :day]]}}))))
            (testing "day is > 30 days ago (start-date should be 29 days ago)"
              (is (= (ga-query {:start-date "29daysAgo"
                                :end-date   "today"})
                     (mbql->native {:query {:filter [:> (ga-date-field :day) [:relative-datetime -30 :day]]}}))))
            (testing "day is >= 30 days ago (start-date should be 30 days ago)"
              (is (= (ga-query {:start-date "30daysAgo"
                                :end-date   "today"})
                     (mbql->native {:query {:filter [:>= (ga-date-field :day) [:relative-datetime -30 :day]]}}))))
            (testing "day is within last year"
              (is (= (ga-query {:start-date "2018-11-19"
                                :end-date   "today"})
                     (mbql->native {:query {:filter [:> (ga-date-field :day) [:relative-datetime -1 :year]]}}))))
            (testing "year > last year"
              (is (= (ga-query {:start-date "2019-01-01"
                                :end-date   "today"})
                     (mbql->native {:query {:filter [:> (ga-date-field :year) [:relative-datetime -1 :year]]}}))))
            (testing "month is between 4 months ago and 1 month ago (:between is inclusive) (i.e., July, August, September, or Octover)"
              (is (= (ga-query {:start-date "2019-07-01", :end-date "2019-10-31"})
                     (mbql->native
                      {:query {:filter [:between
                                        (ga-date-field :month)
                                        [:relative-datetime -4 :month]
                                        [:relative-datetime -1 :month]]}}))))))))))

(deftest limit-test
  (is (= (ga-query {:max-results 25})
         (mbql->native {:query {:limit 25}}))))


;;; ----------------------------------------------- (Almost) E2E tests -----------------------------------------------

(defn- do-with-some-fields [thunk]
  (tt/with-temp* [Database [db                 {:engine "googleanalytics"}]
                  Table    [table              {:name "98765432", :db_id (u/get-id db)}]
                  Field    [event-action-field {:name "ga:eventAction", :base_type "type/Text", :table_id (u/get-id table)}]
                  Field    [event-label-field  {:name "ga:eventLabel", :base_type "type/Text", :table_id (u/get-id table)}]
                  Field    [date-field         {:name "ga:date", :base_type "type/Date", :table_id (u/get-id table)}]]
    (data/with-db db
      (thunk {:db                 db
              :table              table
              :event-action-field event-action-field
              :event-label-field  event-label-field
              :date-field         date-field}))))

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

(deftest almost-e2e-test-1
  ;; system timezone ID shouldn't affect generated query
  (doseq [system-timezone-id ["UTC" "US/Pacific"]]
    (mt/with-system-timezone-id system-timezone-id
      (mt/with-clock (t/mock-clock (t/instant (t/zoned-date-time
                                              (t/local-date "2019-11-18")
                                              (t/local-time 0)
                                              (t/zone-id system-timezone-id)))
                                  (t/zone-id system-timezone-id))
        (is (= expected-ga-query
               (do-with-some-fields
                (fn [{:keys [db table event-action-field event-label-field date-field], :as objects}]
                  (qp.store/with-store
                    (qp.store/fetch-and-store-database! (u/get-id db))
                    (qp.store/fetch-and-store-tables! [(u/get-id table)])
                    (qp.store/fetch-and-store-fields! (map u/get-id [event-action-field event-label-field date-field]))
                    (ga.qp/mbql->native (preprocessed-query-with-some-fields objects)))))))))))

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

(deftest almost-e2e-test-2
  (doseq [system-timezone-id ["UTC" "US/Pacific"]]
    (mt/with-system-timezone-id system-timezone-id
      (mt/with-clock (t/mock-clock (t/instant (t/zoned-date-time
                                              (t/local-date "2019-11-18")
                                              (t/local-time 0)
                                              (t/zone-id system-timezone-id)))
                                  (t/zone-id system-timezone-id))
        (is (= expected-ga-query
               (do-with-some-fields
                (comp qp/query->native query-with-some-fields))))))))

;; ok, now do the same query again, but run the entire QP pipeline, swapping out a few things so nothing is actually
;; run externally.
(deftest almost-e2e-test-3
  (testing "system timezone ID shouldn't affect generated query"
    (doseq [system-timezone-id ["UTC" "US/Pacific"]]
      (mt/with-system-timezone-id system-timezone-id
        (mt/with-clock (t/mock-clock (t/instant (t/zoned-date-time
                                                 (t/local-date "2019-11-18")
                                                 (t/local-time 0)
                                                 (t/zone-id system-timezone-id)))
                                     (t/zone-id system-timezone-id))
          (with-redefs [ga.execute/memoized-column-metadata (fn [_ column-name]
                                                              {:display_name column-name
                                                               :description  (str "This is " column-name)
                                                               :base_type    :type/Text})]
            (do-with-some-fields
             (fn [objects]
               (let [query   (query-with-some-fields objects)
                     cols    (for [col [{:name "ga:eventLabel"}
                                        {:name "ga:totalEvents", :base_type :type/Text}]]
                               (#'ga.execute/add-col-metadata query col))
                     rows    [["Toucan Sighting" 1000]]
                     context {:timeout 500
                              :runf    (fn [query rff context]
                                         (let [metadata {:cols cols}]
                                           (qp.context/reducef rff context metadata rows)))}
                     qp      (fn [query]
                               (qp/process-query query context))]
                 (is (= {:row_count 1
                         :status    :completed
                         :data      {:rows             [["Toucan Sighting" 1000]]
                                     :native_form      expected-ga-query
                                     :cols             [{:description     "This is ga:eventLabel"
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
                                                         :display_name "ga:totalEvents"
                                                         :source       :aggregation
                                                         :description  "This is ga:totalEvents"
                                                         :base_type    :type/Text}]
                                     :results_timezone system-timezone-id}}
                        (-> (tu/doall-recursive (qp query))
                            (update-in [:data :cols] #(for [col %]
                                                        (dissoc col :table_id :id :field_ref)))
                            (m/dissoc-in [:data :results_metadata])
                            (m/dissoc-in [:data :insights])))))))))))))

(deftest almost-e2e-time-interval-test
  (testing "Make sure filtering by the previous 4 months actually filters against the right months (#10701)"
    (doseq [system-timezone-id ["UTC" "US/Pacific"]]
      (mt/with-system-timezone-id system-timezone-id
        (mt/with-clock (t/mock-clock (t/instant (t/zoned-date-time
                                                (t/local-date "2019-11-18")
                                                (t/local-time 0)
                                                (t/zone-id system-timezone-id)))
                                    (t/zone-id system-timezone-id))
          (do-with-some-fields
           (fn [{:keys [db table date-field]}]
             (is (= {:metrics    "ga:users"
                     :dimensions "ga:date"
                     :start-date "2019-07-01"
                     :end-date   "2019-10-31"
                     :sort       "ga:date"}
                    (-> {:query    {:source-table (:id table)
                                    :filter       [:time-interval [:field-id (:id date-field)] -4 :month]
                                    :aggregation  [[:metric "ga:users"]]
                                    :breakout     [[:datetime-field [:field-id (:id date-field)] :day]]}
                         :type     :query
                         :database (:id db)}
                        qp/query->native
                        :query
                        (select-keys [:start-date :end-date :dimensions :metrics :sort])))
                 "Last 4 months should includy July, August, September, and October (July 1st - October 31st)"))))))))


;;; ------------------------------------------------ Saving GA Cards -------------------------------------------------

;; Can we *save* a GA query that has two aggregations?

(deftest save-ga-query-test
  (tt/with-temp* [Database [db    {:engine :googleanalytics}]
                  Table    [table {:db_id (u/get-id db)}]
                  Field    [field {:table_id (u/get-id table)}]]
    (let [cnt (->> ((users/user->client :crowberto) :post 202 "card"
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
                                               :display_name "Date"
                                               :name         "ga:date"
                                               :description  "The date of the session formatted as YYYYMMDD."
                                               :unit         :day}
                                              {:base_type    :type/Integer
                                               :display_name "Ga:1day Users"
                                               :name         "ga:1dayUsers"}
                                              {:base_type    :type/Integer
                                               :display_name "Ga:sessions"
                                               :name         "ga:sessions"}]
                     :metadata_checksum      "i3uR1PM5q6uZfIpm0qZbb6Brcfw8S3/wejWolU0Bl1n1Dz/yqvLGxf/XXV6/uOBB75WhFE9V98pIw5Qm18VY6+rlzUnuaTfPvPbiJbh3D9w="})
                   ;; just make sure the API call actually worked by checking that the created Card is actually
                   ;; successfully saved in the DB
                   u/get-id
                   (db/count Card :id))]
      (is (= 1
             cnt)))))
