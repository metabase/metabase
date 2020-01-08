(ns metabase.driver.bigquery.query-processor-test
  (:require [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [models :refer [Database Field]]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]
            [metabase.driver.bigquery :as bigquery]
            [metabase.driver.bigquery.query-processor :as bigquery.qp]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.util.timezone :as tu.tz]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.util.test :as tt]))

(deftest native-query-test
  (mt/test-driver :bigquery
    (is (= [[100]
            [99]]
           (get-in
            (qp/process-query
              {:native   {:query (str "SELECT `test_data.venues`.`id` "
                                      "FROM `test_data.venues` "
                                      "ORDER BY `test_data.venues`.`id` DESC "
                                      "LIMIT 2;")}
               :type     :native
               :database (mt/id)})
            [:data :rows])))

    (is (= [{:name         "venue_id"
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
                :database (mt/id)})))
        (str "make sure that BigQuery native queries maintain the column ordering specified in the SQL -- "
             "post-processing ordering shouldn't apply (Issue #2821)"))))

(deftest aggregations-test
  (mt/test-driver :bigquery
    (testing (str "make sure queries with two or more of the same aggregation type still work. Aggregations used to be "
                  "deduplicated here in the BigQuery driver; now they are deduplicated as part of the main QP "
                  "middleware, but no reason not to keep a few of these tests just to be safe")
      (let [{:keys [rows columns]} (qp.test/rows+column-names
                                     (mt/run-mbql-query checkins
                                       {:aggregation [[:sum $user_id] [:sum $user_id]]}))]
        (is (= ["sum" "sum_2"]
               columns))
        (is (= [[7929 7929]]
               rows)))
      (let [{:keys [rows columns]} (qp.test/rows+column-names
                                     (mt/run-mbql-query checkins
                                       {:aggregation [[:sum $user_id] [:sum $user_id] [:sum $user_id]]}))]
        (is (= ["sum" "sum_2" "sum_3"]
               columns))
        (is (= [[7929 7929 7929]]
               rows))))

    (testing "let's make sure we're generating correct HoneySQL + SQL for aggregations"
      (is (= {:select   [[(hx/identifier :field "test_data.venues" "price")
                          (hx/identifier :field-alias "price")]
                         [(hsql/call :avg (hx/identifier :field "test_data.venues" "category_id"))
                          (hx/identifier :field-alias "avg")]]
              :from     [(hx/identifier :table "test_data.venues")]
              :group-by [(hx/identifier :field-alias "price")]
              :order-by [[(hx/identifier :field-alias "avg") :asc]]}
             (mt/with-everything-store
               (#'sql.qp/mbql->honeysql
                :bigquery
                (mt/mbql-query venues
                  {:aggregation [[:avg $category_id]]
                   :breakout    [$price]
                   :order-by    [[:asc [:aggregation 0]]]})))))

      (is (= {:query      (str "SELECT `test_data.venues`.`price` AS `price`,"
                               " avg(`test_data.venues`.`category_id`) AS `avg` "
                               "FROM `test_data.venues` "
                               "GROUP BY `price` "
                               "ORDER BY `avg` ASC, `price` ASC")
              :table-name "venues"
              :mbql?      true}
             (qp/query->native
               (mt/mbql-query venues
                 {:aggregation [[:avg $category_id]], :breakout [$price], :order-by [[:asc [:aggregation 0]]]})))))))

(deftest join-alias-test
  (mt/test-driver :bigquery
    (is (= (str "SELECT `categories__via__category_id`.`name` AS `name`,"
                " count(*) AS `count` "
                "FROM `test_data.venues` "
                "LEFT JOIN `test_data.categories` `categories__via__category_id`"
                " ON `test_data.venues`.`category_id` = `categories__via__category_id`.`id` "
                "GROUP BY `name` "
                "ORDER BY `name` ASC")
           ;; normally for test purposes BigQuery doesn't support foreign keys so override the function that checks
           ;; that and make it return `true` so this test proceeds as expected
           (with-redefs [driver/supports? (constantly true)]
             (mt/with-temp-vals-in-db Field (mt/id :venues :category_id) {:fk_target_field_id (mt/id :categories :id)
                                                                            :special_type       "type/FK"}
               (let [results (mt/run-mbql-query venues
                               {:aggregation [:count]
                                :breakout    [$category_id->categories.name]})]
                 (get-in results [:data :native_form :query] results)))))
        (str "make sure that BigQuery properly aliases the names generated for Join Tables. It's important to use the "
             "right alias, e.g. something like `categories__via__category_id`, which is considerably different from "
             "what other SQL databases do. (#4218)"))))

(defn- native-timestamp-query [db-or-db-id timestamp-str timezone-str]
  (-> (qp/process-query
        {:database (u/get-id db-or-db-id)
         :type     :native
         :native   {:query (format "select datetime(TIMESTAMP \"%s\", \"%s\")" timestamp-str timezone-str)}})
      :data
      :rows
      ffirst))

(deftest parsed-date-timezone-handling-test
  (mt/test-driver :bigquery
    (is (= "2018-08-31T00:00:00Z"
           (native-timestamp-query (mt/id) "2018-08-31 00:00:00" "UTC"))
        "A UTC date is returned, we should read/return it as UTC")

    (is (= "2018-08-31T00:00:00-05:00"
           (tu.tz/with-system-timezone-id "America/Chicago"
             (tt/with-temp* [Database [db {:engine  :bigquery
                                           :details (assoc (:details (mt/db))
                                                           :use-jvm-timezone true)}]]
               (native-timestamp-query db "2018-08-31 00:00:00-05" "America/Chicago"))))
        (str "This test includes a `use-jvm-timezone` flag of true that will assume that the date coming from BigQuery "
             "is already in the JVM's timezone. The test puts the JVM's timezone into America/Chicago an ensures that "
             "the correct date is compared"))

    (is (= "2018-08-31T00:00:00+07:00"
           (tu.tz/with-system-timezone-id "Asia/Jakarta"
             (tt/with-temp* [Database [db {:engine  :bigquery
                                           :details (assoc (:details (mt/db))
                                                           :use-jvm-timezone true)}]]
               (native-timestamp-query db "2018-08-31 00:00:00+07" "Asia/Jakarta"))))
        "Similar to the above test, but covers a positive offset")))


;; if I run a BigQuery query, does it get a remark added to it?
(defn- query->native [query]
  (let [native-query (atom nil)]
    (with-redefs [bigquery/process-native* (fn [_ sql]
                                             (reset! native-query sql)
                                             (throw (Exception. "Done.")))]
      (qp/process-query {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id :venues)
                                    :limit        1}
                         :info     {:executed-by 1000
                                    :query-hash  (byte-array [1 2 3 4])}})
      @native-query)))

(deftest remark-test
  (mt/test-driver :bigquery
    (is (= (str
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
            {:database (mt/id)
             :type     :query
             :query    {:source-table (mt/id :venues)
                        :limit        1}
             :info     {:executed-by 1000
                        :query-hash  (byte-array [1 2 3 4])}}))
        "if I run a BigQuery query, does it get a remark added to it?")))

(deftest unprepare-params-test
  (mt/test-driver :bigquery
    (is (= [["Red Medicine"]]
           (qp.test/rows
             (qp/process-query
               {:database (mt/id)
                :type     :native
                :native   {:query  (str "SELECT `test_data.venues`.`name` AS `name` "
                                        "FROM `test_data.venues` "
                                        "WHERE `test_data.venues`.`name` = ?")
                           :params ["Red Medicine"]}})))
        (str "Do we properly unprepare, and can we execute, queries that still have parameters for one reason or "
             "another? (EE #277)"))))

(def ^:private reconcile-test-values
  [{:value (t/local-date "2019-12-10")
    :type  :date
    :as    {:datetime  (t/local-date-time "2019-12-10T00:00:00")
            :timestamp (t/zoned-date-time "2019-12-10T00:00:00Z[UTC]")}}
   {:value (t/local-date-time "2019-12-10T14:47:00")
    :type  :datetime
    :as    {:date      (t/local-date "2019-12-10")
            :timestamp (t/zoned-date-time "2019-12-10T14:47:00Z[UTC]")}}
   {:value (t/zoned-date-time "2019-12-10T14:47:00Z[UTC]")
    :type  :timestamp
    :as    {:date     (t/local-date "2019-12-10")
            :datetime (t/local-date-time "2019-12-10T14:47:00")}}
   {:value (t/offset-date-time "2019-12-10T14:47:00Z")
    :type  :timestamp
    :as    {:date     (t/local-date "2019-12-10")
            :datetime (t/local-date-time "2019-12-10T14:47:00")}}
   (let [unix-ts (sql.qp/unix-timestamp->timestamp :bigquery :seconds :some_field)]
     {:value unix-ts
      :type  :timestamp
      :as    {:date     (hx/cast :date unix-ts)
              :datetime (hx/cast :datetime unix-ts)}})
   (let [unix-ts (sql.qp/unix-timestamp->timestamp :bigquery :milliseconds :some_field)]
     {:value unix-ts
      :type  :timestamp
      :as    {:date     (hx/cast :date unix-ts)
              :datetime (hx/cast :datetime unix-ts)}})])

(deftest temporal-type-test
  (testing "Make sure we can detect temporal types correctly"
    (doseq [[expr expected-type] {[:field-literal "x" :type/DateTime]                                :datetime
                                  [:datetime-field [:field-literal "x" :type/DateTime] :day-of-week] nil}]
      (testing (format "\n(temporal-type %s)" (binding [*print-meta* true] (pr-str expr)))
        (is (= expected-type
               (#'bigquery.qp/temporal-type expr)))))))

(deftest reconcile-temporal-types-test
  (mt/with-everything-store
    (tt/with-temp* [Field [date-field      {:name "date", :base_type :type/Date}]
                    Field [datetime-field  {:name "datetime", :base_type :type/DateTime}]
                    Field [timestamp-field {:name "timestamp", :base_type :type/DateTimeWithLocalTZ}]]
      ;; bind `*table-alias*` so the BigQuery QP doesn't try to look up the current dataset name when converting
      ;; `hx/identifier`s to SQL
      (binding [sql.qp/*table-alias* "ABC"
                *print-meta*         true]
        (let [fields {:date      date-field
                      :datetime  datetime-field
                      :timestamp timestamp-field}]
          (doseq [clause [{:args 2, :mbql :=, :honeysql :=}
                          {:args 2, :mbql :!=, :honeysql :not=}
                          {:args 2, :mbql :>, :honeysql :>}
                          {:args 2, :mbql :>=, :honeysql :>=}
                          {:args 2, :mbql :<, :honeysql :<}
                          {:args 2, :mbql :<=, :honeysql :<=}
                          {:args 3, :mbql :between, :honeysql :between}]]
            (testing (format "\n%s filter clause" (:mbql clause))
              (doseq [[temporal-type field] fields
                      field                 [field
                                             [:field-id (:id field)]
                                             [:datetime-field [:field-id (:id field)] :default]
                                             [:field-literal (:name field) (:base_type field)]
                                             [:datetime-field [:field-literal (:name field) (:base_type field)] :default]]]
                (testing (format "\nField = %s %s"
                                 temporal-type
                                 (if (map? field) (format "<Field %s>" (pr-str (:name field))) field))
                  (doseq [{filter-value :value, :as value} reconcile-test-values
                          filter-value                     (cons filter-value
                                                                 (when (instance? java.time.temporal.Temporal filter-value)
                                                                   [[:absolute-datetime filter-value :default]]))]
                    (testing (format "\nValue = %s %s" (:type value) (pr-str filter-value))
                      (let [filter-clause       (into [(:mbql clause) field]
                                                      (repeat (dec (:args clause)) filter-value))
                            expected-identifier (hx/identifier :field "ABC" (name temporal-type))
                            expected-value      (get-in value [:as temporal-type] (:value value))
                            expected-clause     (into [(:honeysql clause) expected-identifier]
                                                      (repeat (dec (:args clause)) expected-value))]
                        (testing (format "\nreconcile %s -> %s"
                                         (into [(:mbql clause) temporal-type] (repeat (dec (:args clause)) (:type value)))
                                         (into [(:mbql clause) temporal-type] (repeat (dec (:args clause)) temporal-type)))
                          (testing (format "\ninferred field type = %s, inferred value type = %s"
                                           (#'bigquery.qp/temporal-type field)
                                           (#'bigquery.qp/temporal-type filter-value))
                            (is (= expected-clause
                                   (sql.qp/->honeysql :bigquery filter-clause))))))))))))
          (testing "\ndate extraction filters"
            (doseq [[temporal-type field] fields
                    :let                  [identifier          (hx/identifier :field "ABC" (name temporal-type))
                                           expected-identifier (if (= temporal-type :timestamp)
                                                                 identifier
                                                                 (hx/cast :timestamp identifier))]]
              (is (= [:= (hsql/call :extract :dayofweek expected-identifier) 1]
                     (sql.qp/->honeysql :bigquery [:= [:datetime-field [:field-id (:id field)] :day-of-week] 1]))))))))))

(deftest between-test
  (testing "Make sure :between clauses reconcile the temporal types of their args"
    (letfn [(between->sql [clause]
              (sql.qp/format-honeysql :bigquery
                {:where (sql.qp/->honeysql :bigquery clause)}))]
      (testing "Should look for `:bigquery/temporal-type` metadata"
        (is (= ["WHERE field BETWEEN ? AND ?"
                (t/local-date-time "2019-11-11T00:00")
                (t/local-date-time "2019-11-12T00:00")]
               (between->sql [:between
                              (with-meta (hsql/raw "field") {:bigquery/temporal-type :datetime})
                              (t/local-date "2019-11-11")
                              (t/local-date "2019-11-12")]))))
      (testing "If first arg has no temporal-type info, should look at next arg"
        (is (= ["WHERE CAST(field AS date) BETWEEN ? AND ?"
                (t/local-date "2019-11-11")
                (t/local-date "2019-11-12")]
               (between->sql [:between
                              (hsql/raw "field")
                              (t/local-date "2019-11-11")
                              (t/local-date "2019-11-12")]))))
      (testing "No need to cast if args agree on temporal type"
        (is (= ["WHERE field BETWEEN ? AND ?"
                (t/local-date "2019-11-11")
                (t/local-date "2019-11-12")]
               (between->sql [:between
                              (with-meta (hsql/raw "field") {:bigquery/temporal-type :date})
                              (t/local-date "2019-11-11")
                              (t/local-date "2019-11-12")]))))
      (mt/test-driver :bigquery
        (mt/with-everything-store
          (let [expected ["WHERE `test_data.checkins`.`date` BETWEEN ? AND ?"
                          (t/zoned-date-time "2019-11-11T00:00Z[UTC]")
                          (t/zoned-date-time "2019-11-12T00:00Z[UTC]")]]
            (testing "Should be able to get temporal type from a FieldInstance"
              (is (= expected
                     (between->sql [:between
                                    (qp.store/field (mt/id :checkins :date))
                                    (t/local-date "2019-11-11")
                                    (t/local-date "2019-11-12")]))))
            (testing "Should be able to get temporal type from a :field-id"
              (is (= expected
                     (between->sql [:between
                                    [:field-id (mt/id :checkins :date)]
                                    (t/local-date "2019-11-11")
                                    (t/local-date "2019-11-12")]))))
            (testing "Should be able to get temporal type from a wrapped field-id"
              (is (= (cons "WHERE timestamp_trunc(`test_data.checkins`.`date`, day) BETWEEN ? AND ?"
                           (rest expected))
                     (between->sql [:between
                                    [:datetime-field [:field-id (mt/id :checkins :date)] :day]
                                    (t/local-date "2019-11-11")
                                    (t/local-date "2019-11-12")]))))
            (testing "Should work with a field literal"
              (is (= ["WHERE `date` BETWEEN ? AND ?" (t/local-date "2019-11-11") (t/local-date "2019-11-12")]
                     (between->sql [:between
                                    [:field-literal "date" :type/Date]
                                    (t/local-date-time "2019-11-11T12:00:00")
                                    (t/local-date-time "2019-11-12T12:00:00")]))))))))))
