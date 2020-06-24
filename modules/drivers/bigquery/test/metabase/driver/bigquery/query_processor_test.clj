(ns metabase.driver.bigquery.query-processor-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [honeysql
             [core :as hsql]
             [format :as hformat]]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [models :refer [Database Field]]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [sync :as sync]
             [test :as mt]
             [util :as u]]
            [metabase.driver.bigquery :as bigquery]
            [metabase.driver.bigquery.query-processor :as bigquery.qp]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.data.bigquery :as bigquery.tx]
            [metabase.test.util.timezone :as tu.tz]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.util.test :as tt]))

(deftest native-query-test
  (mt/test-driver :bigquery
    (is (= [[100] [99]]
           (mt/rows
             (qp/process-query
              (mt/native-query
                {:query (str "SELECT `v2_test_data.venues`.`id` "
                             "FROM `v2_test_data.venues` "
                             "ORDER BY `v2_test_data.venues`.`id` DESC "
                             "LIMIT 2;")})))))

    (testing (str "make sure that BigQuery native queries maintain the column ordering specified in the SQL -- "
                  "post-processing ordering shouldn't apply (Issue #2821)")
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
                {:native   {:query (str "SELECT `v2_test_data.checkins`.`venue_id` AS `venue_id`, "
                                        "       `v2_test_data.checkins`.`user_id` AS `user_id`, "
                                        "       `v2_test_data.checkins`.`id` AS `checkins_id` "
                                        "FROM `v2_test_data.checkins` "
                                        "LIMIT 2")}
                 :type     :native
                 :database (mt/id)})))))))

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
      (is (= {:select   [[(hx/identifier :field "v2_test_data.venues" "price")
                          (hx/identifier :field-alias "price")]
                         [(hsql/call :avg (hx/identifier :field "v2_test_data.venues" "category_id"))
                          (hx/identifier :field-alias "avg")]]
              :from     [(hx/identifier :table "v2_test_data.venues")]
              :group-by [(hx/identifier :field-alias "price")]
              :order-by [[(hx/identifier :field-alias "avg") :asc]]}
             (mt/with-everything-store
               (#'sql.qp/mbql->honeysql
                :bigquery
                (mt/mbql-query venues
                  {:aggregation [[:avg $category_id]]
                   :breakout    [$price]
                   :order-by    [[:asc [:aggregation 0]]]})))))

      (is (= {:query      (str "SELECT `v2_test_data.venues`.`price` AS `price`,"
                               " avg(`v2_test_data.venues`.`category_id`) AS `avg` "
                               "FROM `v2_test_data.venues` "
                               "GROUP BY `price` "
                               "ORDER BY `avg` ASC, `price` ASC")
              :params     nil
              :table-name "venues"
              :mbql?      true}
             (qp/query->native
               (mt/mbql-query venues
                 {:aggregation [[:avg $category_id]], :breakout [$price], :order-by [[:asc [:aggregation 0]]]})))))))

(deftest join-alias-test
  (mt/test-driver :bigquery
    (is (= (str "SELECT `categories__via__category_id`.`name` AS `name`,"
                " count(*) AS `count` "
                "FROM `v2_test_data.venues` "
                "LEFT JOIN `v2_test_data.categories` `categories__via__category_id`"
                " ON `v2_test_data.venues`.`category_id` = `categories__via__category_id`.`id` "
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
    (with-redefs [bigquery/process-native* (fn [_ _ sql _]
                                             (reset! native-query sql)
                                             (throw (Exception. "Done.")))]
      (u/ignore-exceptions
        (qp/process-query {:database (mt/id)
                           :type     :query
                           :query    {:source-table (mt/id :venues)
                                      :limit        1}
                           :info     {:executed-by 1000
                                      :query-hash  (byte-array [1 2 3 4])}}))
      @native-query)))

(deftest remark-test
  (mt/test-driver :bigquery
    (is (= (str
            "-- Metabase:: userID: 1000 queryType: MBQL queryHash: 01020304\n"
            "SELECT"
            " `v2_test_data.venues`.`id` AS `id`,"
            " `v2_test_data.venues`.`name` AS `name`,"
            " `v2_test_data.venues`.`category_id` AS `category_id`,"
            " `v2_test_data.venues`.`latitude` AS `latitude`,"
            " `v2_test_data.venues`.`longitude` AS `longitude`,"
            " `v2_test_data.venues`.`price` AS `price` "
            "FROM `v2_test_data.venues` "
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
              (mt/native-query
                {:query  (str "SELECT `v2_test_data.venues`.`name` AS `name` "
                              "FROM `v2_test_data.venues` "
                              "WHERE `v2_test_data.venues`.`name` = ?")
                 :params ["Red Medicine"]}))))
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
   (let [unix-ts (sql.qp/unix-timestamp->honeysql :bigquery :seconds :some_field)]
     {:value unix-ts
      :type  :timestamp
      :as    {:date     (hx/cast :date unix-ts)
              :datetime (hx/cast :datetime unix-ts)}})
   (let [unix-ts (sql.qp/unix-timestamp->honeysql :bigquery :milliseconds :some_field)]
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
                                           expected-identifier (case temporal-type
                                                                 :date      identifier
                                                                 :datetime  (hx/cast :timestamp identifier)
                                                                 :timestamp identifier)]]
              (testing (format "\ntemporal-type = %s" temporal-type)
                (is (= [:= (hsql/call :extract :dayofweek expected-identifier) 1]
                       (sql.qp/->honeysql :bigquery [:= [:datetime-field [:field-id (:id field)] :day-of-week] 1])))))))))))

(deftest reconcile-relative-datetimes-test
  (testing "relative-datetime clauses on their own"
    (doseq [[t [unit expected-sql]]
            {:time      [:hour "time_trunc(time_add(current_time(), INTERVAL -1 hour), hour)"]
             :date      [:year "date_trunc(date_add(current_date(), INTERVAL -1 year), year)"]
             :datetime  [:year "datetime_trunc(datetime_add(current_datetime(), INTERVAL -1 year), year)"]
             ;; timestamp_add doesn't support `year` so this should cast a datetime instead
             :timestamp [:year "CAST(datetime_trunc(datetime_add(current_datetime(), INTERVAL -1 year), year) AS timestamp)"]}]
      (testing t
        (let [reconciled-clause (#'bigquery.qp/->temporal-type t [:relative-datetime -1 unit])]
          (is (= t
                 (#'bigquery.qp/temporal-type reconciled-clause))
              "Should have correct type metadata after reconciliation")
          (is (= [(str "WHERE " expected-sql)]
                 (sql.qp/format-honeysql :bigquery
                   {:where (sql.qp/->honeysql :bigquery reconciled-clause)}))
              "Should get converted to the correct SQL")))))

  (testing "relative-datetime clauses inside filter clauses"
    (doseq [[expected-type t] {:date      #t "2020-01-31"
                               :datetime  #t "2020-01-31T20:43:00.000"
                               :timestamp #t "2020-01-31T20:43:00.000-08:00"}]
      (testing expected-type
        (let [[_ _ relative-datetime] (sql.qp/->honeysql :bigquery
                                        [:=
                                         t
                                         [:relative-datetime -1 :year]])]
          (is (= expected-type
                 (#'bigquery.qp/temporal-type relative-datetime))))))))

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
          (let [expected ["WHERE `v2_test_data.checkins`.`date` BETWEEN ? AND ?"
                          (t/local-date "2019-11-11")
                          (t/local-date "2019-11-12")]]
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
              (is (= (cons "WHERE date_trunc(`v2_test_data.checkins`.`date`, day) BETWEEN ? AND ?"
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

(deftest timezones-test
  (mt/test-driver :bigquery
    (testing "BigQuery does not support report-timezone, so setting it should not affect results"
      (doseq [timezone ["UTC" "US/Pacific"]]
        (mt/with-temporary-setting-values [report-timezone timezone]
          (is (= [[37 "2015-11-19T00:00:00Z"]]
                 (mt/rows
                   (mt/run-mbql-query checkins
                     {:fields   [$id $date]
                      :filter   [:= $date "2015-11-19"]
                      :order-by [[:asc $id]]})))))))))

(defn- do-with-datetime-timestamp-table [f]
  (driver/with-driver :bigquery
    (let [table-name (name (munge (gensym "table_")))]
      (mt/with-temp-copy-of-db
        (try
          (bigquery.tx/execute!
           (format "CREATE TABLE `v2_test_data.%s` ( ts TIMESTAMP, dt DATETIME )" table-name))
          (bigquery.tx/execute!
           (format "INSERT INTO `v2_test_data.%s` (ts, dt) VALUES (TIMESTAMP \"2020-01-01 00:00:00 UTC\", DATETIME \"2020-01-01 00:00:00\")"
                   table-name))
          (sync/sync-database! (mt/db))
          (f table-name)
          (finally
            (bigquery.tx/execute! "DROP TABLE IF EXISTS `v2_test_data.%s`" table-name)))))))

(deftest filter-by-datetime-timestamp-test
  (mt/test-driver :bigquery
    ;; there are more tests in the `bigquery.query-processor-test` namespace
    (testing "Make sure we can filter against different types of BigQuery temporal columns (#11222)"
      (do-with-datetime-timestamp-table
       (fn [table-name]
         (doseq [column [:ts :dt]]
           (testing (format "Filtering against %s column" column)
             (doseq [s    ["2020-01-01" "2020-01-01T00:00:00"]
                     field [[:field-id (mt/id table-name column)]
                            [:datetime-field [:field-id (mt/id table-name column)] :default]
                            [:datetime-field [:field-id (mt/id table-name column)] :day]]
                     :let [filter-clause [:= field s]]]
               (testing (format "\nMBQL filter clause = %s" (pr-str filter-clause))
                 (is (= [["2020-01-01T00:00:00Z" "2020-01-01T00:00:00Z"]]
                        (mt/rows
                          (mt/run-mbql-query nil
                            {:source-table (mt/id table-name)
                             :filter       filter-clause})))))))))))))

(deftest datetime-parameterized-sql-test
  (mt/test-driver :bigquery
    (testing "Make sure Field filters against temporal fields generates correctly-typed SQL (#11578)"
      (mt/dataset attempted-murders
        (doseq [field              [:datetime
                                    :date
                                    :datetime_tz]
                [value-type value] {:date/relative     "past30days"
                                    :date/range        "2019-12-11~2020-01-09"
                                    :date/single       "2020-01-09"
                                    :date/quarter-year "Q1-2020"
                                    :date/month-year   "2020-01"}]
          (testing (format "\nField filter with %s Field" field)
            (testing (format "\nfiltering against %s value '%s'" value-type value)
              (is (= [[0]]
                     (mt/rows
                       (qp/process-query
                         {:database   (mt/id)
                          :type       :native
                          :native     {:query         "SELECT count(*) FROM `v2_attempted_murders.attempts` WHERE {{d}}"
                                       :template-tags {"d" {:name         "d"
                                                            :display-name "Date"
                                                            :type         :dimension
                                                            :dimension    [:field-id (mt/id :attempts field)]}}}
                          :parameters [{:type   value-type
                                        :name   "d"
                                        :target [:dimension [:template-tag "d"]]
                                        :value  value}]})))))))))))

(deftest current-datetime-honeysql-form-test
  (testing (str "The object returned by `current-datetime-honeysql-form` should be a magic object that can take on "
                "whatever temporal type we want.")
    (let [form (sql.qp/current-datetime-honeysql-form :bigquery)]
      (is (= nil
             (#'bigquery.qp/temporal-type form))
          "When created the temporal type should be unspecified. The world's your oyster!")
      (is (= ["current_timestamp()"]
             (hformat/format form))
          "Should fall back to acting like a timestamp if we don't coerce it to something else first")
      (doseq [[temporal-type expected-sql] {:date      "current_date()"
                                            :time      "current_time()"
                                            :datetime  "current_datetime()"
                                            :timestamp "current_timestamp()"}]
        (testing (format "temporal type = %s" temporal-type)
          (is (= temporal-type
                 (#'bigquery.qp/temporal-type (#'bigquery.qp/->temporal-type temporal-type form)))
              "Should be possible to convert to another temporal type/should report its type correctly")
          (is (= [expected-sql]
                 (hformat/format (#'bigquery.qp/->temporal-type temporal-type form)))
              "Should convert to the correct SQL"))))))

(deftest add-interval-honeysql-form-test
  ;; this doesn't test conversion to/from time because there's no unit we can use that works for all for. So we'll
  ;; just test the 3 that support `:day` and that should be proof the logic is working. (The code that actually uses
  ;; this is tested e2e by `filter-by-relative-date-ranges-test` anyway.)
  (doseq [initial-type [:date :datetime :timestamp]
          :let         [form (sql.qp/add-interval-honeysql-form
                              :bigquery
                              (#'bigquery.qp/->temporal-type
                               initial-type
                               (sql.qp/current-datetime-honeysql-form :bigquery))
                              -1
                              :day)]]
    (testing (format "initial form = %s" (pr-str form))
      (is (= initial-type
             (#'bigquery.qp/temporal-type form))
          "Should have the temporal-type of the form it wraps when created.")
      (doseq [[new-type expected-sql] {:date      "date_add(current_date(), INTERVAL -1 day)"
                                       :datetime  "datetime_add(current_datetime(), INTERVAL -1 day)"
                                       :timestamp "timestamp_add(current_timestamp(), INTERVAL -1 day)"}]
        (testing (format "\nconvert from %s -> %s" initial-type new-type)
          (is (= new-type
                 (#'bigquery.qp/temporal-type (#'bigquery.qp/->temporal-type new-type form)))
              "Should be possible to convert to another temporal type/should report its type correctly")
          (is (= [expected-sql]
                 (hformat/format (#'bigquery.qp/->temporal-type new-type form)))
              "Should convert to the correct SQL"))))))

(defn- can-we-filter-against-relative-datetime? [field unit]
  (try
    (mt/run-mbql-query attempts
      {:aggregation [[:count]]
       :filter      [:time-interval (mt/id :attempts field) :last unit]})
    true
    (catch Throwable _
      false)))

(deftest filter-by-relative-date-ranges-test
  (testing "Make sure the SQL we generate for filters against relative-datetimes is typed correctly"
    (mt/with-everything-store
      (binding [sql.qp/*table-alias* "ABC"]
        (doseq [[field-type [unit expected-sql]]
                {:type/Time                [:hour (str "WHERE time_trunc(ABC.time, hour)"
                                                       " = time_trunc(time_add(current_time(), INTERVAL -1 hour), hour)")]
                 :type/Date                [:year (str "WHERE date_trunc(ABC.date, year)"
                                                       " = date_trunc(date_add(current_date(), INTERVAL -1 year), year)")]
                 :type/DateTime            [:year (str "WHERE datetime_trunc(ABC.datetime, year)"
                                                       " = datetime_trunc(datetime_add(current_datetime(), INTERVAL -1 year), year)")]
                 ;; `timestamp_add` doesn't support `year` so it should cast a `datetime_trunc` instead
                 :type/DateTimeWithLocalTZ [:year (str "WHERE timestamp_trunc(ABC.datetimewithlocaltz, year)"
                                                       " = CAST(datetime_trunc(datetime_add(current_datetime(), INTERVAL -1 year), year) AS timestamp)")]}]
          (mt/with-temp Field [f {:name (str/lower-case (name field-type)), :base_type field-type}]
            (testing (format "%s field" field-type)
              (is (= [expected-sql]
                     (hsql/format {:where (sql.qp/->honeysql :bigquery [:=
                                                                        [:datetime-field [:field-id (:id f)] unit]
                                                                        [:relative-datetime -1 unit]])}))))))))))

(def ^:private filter-test-table
  [[nil          :minute :hour :day  :week :month :quarter :year]
   [:time        true    true  false false false  false    false]
   [:datetime    true    true  true  true  true   true     true]
   [:date        false   false true  true  true   true     true]
   [:datetime_tz true    true  true  true  true   true     true]])

(defn- test-table-with-fn [table f]
  (let [units (rest (first table))]
    (dorun (pmap (fn [[field & vs]]
                   (testing (format "\nfield = %s" field)
                     (dorun (pmap (fn [[unit expected]]
                                    (let [result (f field unit)]
                                      (locking f
                                        (testing (format "\nunit = %s" unit)
                                          (is (= expected
                                                 result))))))
                                  (zipmap units vs)))))
                 (rest table)))))

(deftest filter-by-relative-date-ranges-e2e-test
  (mt/test-driver :bigquery
    (testing (str "Make sure filtering against relative date ranges works correctly regardless of underlying column "
                  "type (#11725)")
      (mt/dataset attempted-murders
        (test-table-with-fn filter-test-table can-we-filter-against-relative-datetime?)))))

(def ^:private breakout-test-table
  [[nil          :default :minute :hour :day  :week :month :quarter :year :minute-of-hour :hour-of-day :day-of-week :day-of-month :day-of-year :week-of-year :month-of-year :quarter-of-year]
   [:time        true     true    true  false false false  false    false true            true         false        false         false        false         false          false]
   [:datetime    true     true    true  true  true  true   true     true  true            true         true         true          true         true          true           true]
   [:date        true     false   false true  true  true   true     true  false           false        true         true          true         true          true           true]
   [:datetime_tz true     true    true  true  true  true   true     true  true            true         true         true          true         true          true           true]])

(defn- can-breakout? [field unit]
  (try
    (mt/run-mbql-query attempts
      {:aggregation [[:count]]
       :breakout [[:datetime-field (mt/id :attempts field) unit]]})
    true
    (catch Throwable _
      false)))

(deftest breakout-by-bucketed-datetimes-e2e-test
  (mt/test-driver :bigquery
    (testing "Make sure datetime breakouts like :minute-of-hour work correctly for different temporal types"
      (mt/dataset attempted-murders
        (test-table-with-fn breakout-test-table can-breakout?)))))

(deftest string-escape-test
  (mt/test-driver :bigquery
    (testing "Make sure single quotes in parameters are escaped properly to prevent SQL injection\n"
      (testing "MBQL query"
        (is (= [[0]]
               (mt/formatted-rows [int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:count]]
                    :filter      [:= $name "x\\\\' OR 1 = 1 -- "]})))))

      (testing "native query"
        (is (= [[0]]
               (mt/formatted-rows [int]
                 (qp/process-query
                  (mt/native-query
                    {:query  "SELECT count(*) AS `count` FROM `v2_test_data.venues` WHERE `v2_test_data.venues`.`name` = ?"
                     :params ["x\\\\' OR 1 = 1 -- "]})))))))))
