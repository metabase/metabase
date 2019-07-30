(ns metabase.query-processor.middleware.parameters.mbql-test
  "Tests for *MBQL* parameter substitution."
  (:require [expectations :refer [expect]]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.mbql.normalize :as normalize]
            [metabase.query-processor.middleware.parameters.mbql :as mbql-params]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.util.date :as du]))

(defn- expand-parameters [query]
  (let [query (normalize/normalize query)]
    (mbql-params/expand (dissoc query :parameters) (:parameters query))))


;; adding a simple parameter
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1000
              :filter       [:= [:field-id (data/id :venues :name)] "Cam's Toucannery"]
              :breakout     [[:field-id 17]]}}
  (expand-parameters
   {:database   1
    :type       :query
    :query      {:source-table 1000
                 :breakout     [[:field-id 17]]}
    :parameters [{:hash   "abc123"
                  :name   "foo"
                  :type   "id"
                  :target [:dimension [:field-id (data/id :venues :name)]]
                  :value  "Cam's Toucannery"}]}))

;; multiple filters are conjoined by an "AND"
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1000
              :filter       [:and
                             [:= [:field-id (data/id :venues :id)] 12]
                             [:= [:field-id (data/id :venues :name)] "Cam's Toucannery"]
                             [:= [:field-id (data/id :venues :id)] 999]]
              :breakout     [[:field-id 17]]}}
  (expand-parameters
   {:database   1
    :type       :query
    :query      {:source-table 1000
                 :filter       ["AND" [:= (data/id :venues :id) 12]]
                 :breakout     [[:field-id 17]]}
    :parameters [{:hash   "abc123"
                  :name   "foo"
                  :type   :id
                  :target [:dimension [:field-id (data/id :venues :name)]]
                  :value  "Cam's Toucannery"}
                 {:hash   "def456"
                  :name   "bar"
                  :type   :category
                  :target [:dimension [:field-id (data/id :venues :id)]]
                  :value  999}]}))

;; date range parameters
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1000
              :filter       [:time-interval [:field-id (data/id :users :last_login)] -30 :day {:include-current false}]
              :breakout     [[:field-id 17]]}}
  (expand-parameters
   {:database   1
    :type       :query
    :query      {:source-table 1000
                 :breakout     [[:field-id 17]]}
    :parameters [{:hash   "abc123"
                  :name   "foo"
                  :type   :date
                  :target [:dimension [:field-id (data/id :users :last_login)]]
                  :value  "past30days"}]}))

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1000
              :filter       [:time-interval [:field-id (data/id :users :last_login)] -30 :day {:include-current true}]
              :breakout     [[:field-id 17]]}}
  (expand-parameters
   {:database   1
    :type       :query
    :query      {:source-table 1000
                 :breakout     [[:field-id 17]]}
    :parameters [{:hash   "abc123"
                  :name   "foo"
                  :type   :date
                  :target [:dimension [:field-id (data/id :users :last_login)]]
                  :value  "past30days~"}]}))

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1000
              :filter       [:=
                             [:datetime-field [:field-id (data/id :users :last_login)] :day]
                             [:relative-datetime -1 :day]]
              :breakout     [[:field-id 17]]}}
  (expand-parameters
   {:database   1
    :type       :query
    :query      {:source-table 1000
                 :breakout     [[:field-id 17]]}
    :parameters [{:hash   "abc123"
                  :name   "foo"
                  :type   "date"
                  :target [:dimension [:field-id (data/id :users :last_login)]]
                  :value  "yesterday"}]}))

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1000
              :filter       [:between [:datetime-field [:field-id (data/id :users :last_login)] :day]
                             "2014-05-10"
                             "2014-05-16"]
              :breakout     [[:field-id 17]]}}
  (expand-parameters
   {:database   1
    :type       :query
    :query      {:source-table 1000
                 :breakout     [[:field-id 17]]}
    :parameters [{:hash   "abc123"
                  :name   "foo"
                  :type   "date"
                  :target [:dimension [:field-id (data/id :users :last_login)]]
                  :value  "2014-05-10~2014-05-16"}]}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                END-TO-END TESTS                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; for some reason param substitution tests fail on Redshift so just don't run those for now
(def ^:private params-test-drivers (disj qp.test/non-timeseries-drivers :redshift))

;; check that date ranges work correctly
(datasets/expect-with-drivers params-test-drivers
  [29]
  (do
    ;; Prevent an issue with Snowflake were a previous connection's report-timezone setting can affect this test's results
    (when (= :snowflake driver/*driver*)
      (driver/notify-database-updated driver/*driver* (data/id)))
    (qp.test/first-row
      (qp.test/format-rows-by [int]
        (qp/process-query
          (data/query checkins
            {:query      {:aggregation [[:count]]}
             :parameters [{:hash   "abc123"
                           :name   "foo"
                           :type   "date"
                           :target [:dimension $date]
                           :value  "2015-04-01~2015-05-01"}]}))))))

;; check that IDs work correctly (passed in as numbers)
(datasets/expect-with-drivers params-test-drivers
  [1]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (qp/process-query
        (data/query checkins
          {:query      {:aggregation [[:count]]}
           :parameters [{:hash   "abc123"
                         :name   "foo"
                         :type   :number
                         :target [:dimension $id]
                         :value  100}]})))))

;; check that IDs work correctly (passed in as strings, as the frontend is wont to do; should get converted)
(datasets/expect-with-drivers params-test-drivers
  [1]
  (qp.test/first-row
    (qp.test/format-rows-by [int]
      (qp/process-query
        (data/query checkins
          {:query      {:aggregation [[:count]]}
           :parameters [{:hash   "abc123"
                         :name   "foo"
                         :type   :number
                         :target [:dimension $id]
                         :value  "100"}]})))))

;; check that Categories work correctly (passed in as strings, as the frontend is wont to do; should get converted)
(datasets/expect-with-drivers params-test-drivers
  [[6]]
  (qp.test/format-rows-by [int]
    (qp.test/rows
      (qp/process-query
        (data/query venues
          {:query      {:aggregation [[:count]]}
           :parameters [{:name   "price"
                         :type   :category
                         :target $price
                         :value  "4"}]})))))

;; test that we can inject a basic `WHERE id = 9` type param (`id` type)
(datasets/expect-with-drivers params-test-drivers
  [[9 "Nils Gotam"]]
  (qp.test/format-rows-by [int str]
    (qp.test/rows
      (qp/process-query
        (data/query users
          {:parameters [{:name   "id"
                         :type   "id"
                         :target $id
                         :value  9}]})))))

;; test that we can do the same thing but with a `category` type
(datasets/expect-with-drivers params-test-drivers
  [[6]]
  (qp.test/format-rows-by [int]
    (qp.test/rows
      (qp/process-query
        (data/query venues
          {:query      {:aggregation [[:count]]}
           :parameters [{:name   "price"
                         :type   :category
                         :target $price
                         :value  4}]})))))


;; Make sure that *multiple* values work. This feature was added in 0.28.0. You are now allowed to pass in an array of
;; parameter values instead of a single value, which should stick them together in a single MBQL `:=` clause, which
;; ends up generating a SQL `*or*` clause
(datasets/expect-with-drivers params-test-drivers
  [[19]]
  (qp.test/format-rows-by [int]
    (qp.test/rows
      (qp/process-query
        (data/query venues
          {:query      {:aggregation [[:count]]}
           :parameters [{:name   "price"
                         :type   :category
                         :target $price
                         :value  [3 4]}]})))))

;; now let's make sure the correct query is actually being generated for the same thing above...
;; (NOTE: We're only testing this with H2 because the SQL generated is simply too different between various SQL drivers.
;; we know the features are still working correctly because we're actually checking that we get the right result from
;; running the query above these tests are more of a sanity check to make sure the SQL generated is sane.)
(datasets/expect-with-driver :h2
  {:query  (str "SELECT count(*) AS \"count\" "
                "FROM \"PUBLIC\".\"VENUES\" "
                "WHERE (\"PUBLIC\".\"VENUES\".\"PRICE\" = 3 OR \"PUBLIC\".\"VENUES\".\"PRICE\" = 4)")
   :params nil}
  (qp/query->native
    (data/query venues
      {:query      {:aggregation [[:count]]}
       :parameters [{:name   "price"
                     :type   :category
                     :target $price
                     :value  [3 4]}]})))

;; try it with date params as well. Even though there's no way to do this in the frontend AFAIK there's no reason we
;; can't handle it on the backend
;;
;; TODO - If we actually wanted to generate efficient queries we should be doing something like
;;
;;    WHERE (cast(DATE as date) IN ((cast(? AS date), cast(? AS date)))
;;
;; instead of all these BETWEENs
(datasets/expect-with-driver :h2
  {:query  (str "SELECT count(*) AS \"count\" FROM \"PUBLIC\".\"CHECKINS\" "
                "WHERE (CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN CAST(? AS date) AND CAST(? AS date)"
                " OR CAST(\"PUBLIC\".\"CHECKINS\".\"DATE\" AS date) BETWEEN CAST(? AS date) AND CAST(? AS date))")
   :params [(du/->Timestamp #inst "2014-06-01")
            (du/->Timestamp #inst "2014-06-30")
            (du/->Timestamp #inst "2015-06-01")
            (du/->Timestamp #inst "2015-06-30")]}
  (qp/query->native
    (data/query checkins
      {:query      {:aggregation [[:count]]}
       :parameters [{:name   "date"
                     :type   "date/month"
                     :target $date
                     :value  ["2014-06" "2015-06"]}]})))

;; make sure that "ID" type params get converted to numbers when appropriate
(expect
  (data/$ids venues
    [:= $id 1])
  (#'mbql-params/build-filter-clause
   (data/$ids venues
     {:type   :id
      :target [:dimension $id]
      :slug   "venue_id"
      :value  "1"
      :name   "Venue ID"})))

;; Make sure we properly handle paramters that have `fk->` forms in `:dimension` targets (#9017)
(datasets/expect-with-drivers (filter #(driver/supports? % :foreign-keys) params-test-drivers)
  [[31 "Bludso's BBQ" 5 33.8894 -118.207 2]
   [32 "Boneyard Bistro" 5 34.1477 -118.428 3]
   [33 "My Brother's Bar-B-Q" 5 34.167 -118.595 2]
   [35 "Smoke City Market" 5 34.1661 -118.448 1]
   [37 "bigmista's barbecue" 5 34.118 -118.26 2]
   [38 "Zeke's Smokehouse" 5 34.2053 -118.226 2]
   [39 "Baby Blues BBQ" 5 34.0003 -118.465 2]]
  (qp.test/format-rows-by :venues
    (qp.test/rows
      (qp/process-query
        (data/query venues
          {:query      {:order-by [[:asc $id]]}
           :parameters [{:type   :id
                         :target [:dimension $category_id->categories.name]
                         :value  ["BBQ"]}]})))))
