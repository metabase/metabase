(ns metabase.driver.bigquery-test
  (:require [clj-time.core :as time]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [util :as u]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver.bigquery :as bigquery]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.mbql.util :as mbql.u]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.util.timezone :as tu.tz]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.util.test :as tt]))

;; Test native queries
(datasets/expect-with-driver :bigquery
  [[100]
   [99]]
  (get-in (qp/process-query
            {:native   {:query (str "SELECT `test_data.venues`.`id` "
                                    "FROM `test_data.venues` "
                                    "ORDER BY `test_data.venues`.`id` DESC "
                                    "LIMIT 2;")}
             :type     :native
             :database (data/id)})
          [:data :rows]))

;;; table-rows-sample
(datasets/expect-with-driver :bigquery
  [[1 "Red Medicine"]
   [2 "Stout Burgers & Beers"]
   [3 "The Apple Pan"]
   [4 "Wurstküche"]
   [5 "Brite Spot Family Restaurant"]]
  (->> (metadata-queries/table-rows-sample (Table (data/id :venues))
         [(Field (data/id :venues :id))
          (Field (data/id :venues :name))])
       (sort-by first)
       (take 5)))

;; make sure that BigQuery native queries maintain the column ordering specified in the SQL -- post-processing
;; ordering shouldn't apply (Issue #2821)
(datasets/expect-with-driver :bigquery
  [{:name         "venue_id"
    :display_name "venue_id"
    :source       :native
    :base_type    :type/Integer
    :field_ref    [:field-literal "venue_id" :type/Integer]}
   {:name         "user_id"
    :display_name "user_id"
    :source       :native
    :base_type    :type/Integer
    :field_ref    [:field-literal "user_id" :type/Integer]}
   {:name         "checkins_id"
    :display_name "checkins_id"
    :source       :native
    :base_type    :type/Integer
    :field_ref    [:field-literal "checkins_id" :type/Integer]}]
  (qp.test/cols
    (qp/process-query
      {:native   {:query (str "SELECT `test_data.checkins`.`venue_id` AS `venue_id`, "
                              "       `test_data.checkins`.`user_id` AS `user_id`, "
                              "       `test_data.checkins`.`id` AS `checkins_id` "
                              "FROM `test_data.checkins` "
                              "LIMIT 2")}
       :type     :native
       :database (data/id)})))

;; ok, make sure we actually wrap all of our ag clauses in `:aggregation-options` clauses with unique names
(defn- aggregation-names [query]
  (mbql.u/match (-> query :query :aggregation)
    [:aggregation-options _ {:name ag-name}] ag-name))

;; make sure queries with two or more of the same aggregation type still work. Aggregations used to be deduplicated
;; here in the BigQuery driver; now they are deduplicated as part of the main QP middleware, but no reason not to keep
;; a few of these tests just to be safe
(datasets/expect-with-driver :bigquery
  {:rows [[7929 7929]], :columns ["sum" "sum_2"]}
  (qp.test/rows+column-names
    (qp/process-query {:database (data/id)
                       :type     "query"
                       :query    {:source-table (data/id :checkins)
                                  :aggregation [[:sum [:field-id (data/id :checkins :user_id)]]
                                                [:sum [:field-id (data/id :checkins :user_id)]]]}})))

(datasets/expect-with-driver :bigquery
  {:rows [[7929 7929 7929]], :columns ["sum" "sum_2" "sum_3"]}
  (qp.test/rows+column-names
    (qp/process-query {:database (data/id)
                       :type     "query"
                       :query    {:source-table (data/id :checkins)
                                  :aggregation  [[:sum [:field-id (data/id :checkins :user_id)]]
                                                 [:sum [:field-id (data/id :checkins :user_id)]]
                                                 [:sum [:field-id (data/id :checkins :user_id)]]]}})))

(datasets/expect-with-driver :bigquery
  "UTC"
  (tu/db-timezone-id))


;; make sure that BigQuery properly aliases the names generated for Join Tables. It's important to use the right
;; alias, e.g. something like `categories__via__category_id`, which is considerably different from what other SQL
;; databases do. (#4218)
(datasets/expect-with-driver :bigquery
  (str "SELECT `categories__via__category_id`.`name` AS `name`,"
       " count(*) AS `count` "
       "FROM `test_data.venues` "
       "LEFT JOIN `test_data.categories` `categories__via__category_id`"
       " ON `test_data.venues`.`category_id` = `categories__via__category_id`.`id` "
       "GROUP BY `name` "
       "ORDER BY `name` ASC")
  ;; normally for test purposes BigQuery doesn't support foreign keys so override the function that checks that and
  ;; make it return `true` so this test proceeds as expected
  (with-redefs [driver/supports? (constantly true)]
    (tu/with-temp-vals-in-db Field (data/id :venues :category_id) {:fk_target_field_id (data/id :categories :id)
                                                                   :special_type       "type/FK"}
      (let [results (qp/process-query
                     {:database (data/id)
                      :type     "query"
                      :query    {:source-table (data/id :venues)
                                 :aggregation  [:count]
                                 :breakout     [[:fk-> (data/id :venues :category_id) (data/id :categories :name)]]}})]
        (get-in results [:data :native_form :query] results)))))

(defn- native-timestamp-query [db-or-db-id timestamp-str timezone-str]
  (-> (qp/process-query
        {:database (u/get-id db-or-db-id)
         :type     :native
         :native   {:query (format "select datetime(TIMESTAMP \"%s\", \"%s\")" timestamp-str timezone-str)}})
      :data
      :rows
      ffirst))

;; This query tests out the timezone handling of parsed dates. For this test a UTC date is returned, we should
;; read/return it as UTC
(datasets/expect-with-driver :bigquery
  "2018-08-31T00:00:00.000Z"
  (native-timestamp-query (data/id) "2018-08-31 00:00:00" "UTC"))

;; This test includes a `use-jvm-timezone` flag of true that will assume that the date coming from BigQuery is already
;; in the JVM's timezone. The test puts the JVM's timezone into America/Chicago an ensures that the correct date is
;; compared
(datasets/expect-with-driver :bigquery
  "2018-08-31T00:00:00.000-05:00"
   (tu.tz/with-jvm-tz (time/time-zone-for-id "America/Chicago")
    (tt/with-temp* [Database [db {:engine :bigquery
                                  :details (assoc (:details (data/db))
                                             :use-jvm-timezone true)}]]
      (native-timestamp-query db "2018-08-31 00:00:00-05" "America/Chicago"))))

;; Similar to the above test, but covers a positive offset
(datasets/expect-with-driver :bigquery
  "2018-08-31T00:00:00.000+07:00"
  (tu.tz/with-jvm-tz (time/time-zone-for-id "Asia/Jakarta")
    (tt/with-temp* [Database [db {:engine :bigquery
                                  :details (assoc (:details (data/db))
                                             :use-jvm-timezone true)}]]
      (native-timestamp-query db "2018-08-31 00:00:00+07" "Asia/Jakarta"))))

;; if I run a BigQuery query, does it get a remark added to it?
(defn- query->native [query]
  (let [native-query (atom nil)]
    (with-redefs [bigquery/process-native* (fn [_ sql]
                                             (reset! native-query sql)
                                             (throw (Exception. "Done.")))]
      (qp/process-query {:database (data/id)
                         :type     :query
                         :query    {:source-table (data/id :venues)
                                    :limit        1}
                         :info     {:executed-by 1000
                                    :query-hash  (byte-array [1 2 3 4])}})
      @native-query)))

(datasets/expect-with-driver :bigquery
  (str
   "-- Metabase:: userID: 1000 queryType: MBQL queryHash: 01020304\n"
   "SELECT `test_data.venues`.`id` AS `id`,"
   " `test_data.venues`.`name` AS `name`,"
   " `test_data.venues`.`category_id` AS `category_id`,"
   " `test_data.venues`.`latitude` AS `latitude`,"
   " `test_data.venues`.`longitude` AS `longitude`,"
   " `test_data.venues`.`price` AS `price` "
   "FROM `test_data.venues` "
   "LIMIT 1")
  (query->native
   {:database (data/id)
    :type     :query
    :query    {:source-table (data/id :venues)
               :limit        1}
    :info     {:executed-by 1000
               :query-hash  (byte-array [1 2 3 4])}}))

;; let's make sure we're generating correct HoneySQL + SQL for aggregations
(datasets/expect-with-driver :bigquery
  {:select   [[(hx/identifier :field "test_data.venues" "price")                        (hx/identifier :field-alias "price")]
              [(hsql/call :avg (hx/identifier :field "test_data.venues" "category_id")) (hx/identifier :field-alias "avg")]]
   :from     [(hx/identifier :table "test_data.venues")]
   :group-by [(hx/identifier :field-alias "price")]
   :order-by [[(hx/identifier :field-alias "avg") :asc]]}
  (qp.test-util/with-everything-store
    (#'sql.qp/mbql->honeysql
     :bigquery
     (data/mbql-query venues
       {:aggregation [[:avg $category_id]]
        :breakout    [$price]
        :order-by    [[:asc [:aggregation 0]]]}))))

(datasets/expect-with-driver :bigquery
  {:query      (str "SELECT `test_data.venues`.`price` AS `price`,"
                    " avg(`test_data.venues`.`category_id`) AS `avg` "
                    "FROM `test_data.venues` "
                    "GROUP BY `price` "
                    "ORDER BY `avg` ASC, `price` ASC")
   :table-name "venues"
   :mbql?      true}
  (qp/query->native
    (data/mbql-query venues
      {:aggregation [[:avg $category_id]], :breakout [$price], :order-by [[:asc [:aggregation 0]]]})))

;; Do we properly unprepare, and can we execute, queries that still have parameters for one reason or another? (EE #277)
(datasets/expect-with-driver :bigquery
  [["Red Medicine"]]
  (qp.test/rows
    (qp/process-query
      {:database (data/id)
       :type     :native
       :native   {:query  (str "SELECT `test_data.venues`.`name` AS `name` "
                               "FROM `test_data.venues` "
                               "WHERE `test_data.venues`.`name` = ?")
                  :params ["Red Medicine"]}})))
