(ns metabase.driver.bigquery-cloud-sdk.query-processor-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.driver.bigquery-cloud-sdk.query-processor :as bigquery.qp]
   [metabase.driver.bigquery-cloud-sdk.query-processor-test.reconciliation-test-util
    :as bigquery.qp.reconciliation-tu]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.models :refer [Database]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.bigquery-cloud-sdk :as bigquery.tx]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def ^:private test-db-name (bigquery.tx/test-dataset-id "test_data"))

(defn- with-test-db-name
  "Replaces instances of v4_test_data with the full per-test-run DB name (aka dataset ID)"
  [x]
  (cond
    (string? x) (str/replace x "v4_test_data" test-db-name)
    (map? x)    (update-vals x with-test-db-name)
    (vector? x) (mapv with-test-db-name x)
    (list?   x) (map with-test-db-name x)
    (symbol? x) (-> x str with-test-db-name symbol)
    :else       x))

(deftest ^:parallel native-query-test
  (mt/test-driver :bigquery-cloud-sdk
    (is (= [[100] [99]]
           (mt/rows
             (qp/process-query
              (mt/native-query
                {:query (with-test-db-name
                          (str "SELECT `v4_test_data.venues`.`id` "
                               "FROM `v4_test_data.venues` "
                               "ORDER BY `v4_test_data.venues`.`id` DESC "
                               "LIMIT 2;"))})))))))

(deftest ^:parallel native-query-test-2
  (mt/test-driver :bigquery-cloud-sdk
    (testing (str "make sure that BigQuery native queries maintain the column ordering specified in the SQL -- "
                  "post-processing ordering shouldn't apply (metabase#2821)")
      (is (= [{:name         "venue_id"
               :display_name "venue_id"
               :source       :native
               :base_type    :type/Integer
               :effective_type :type/Integer
               :field_ref    [:field "venue_id" {:base-type :type/Integer}]}
              {:name         "user_id"
               :display_name "user_id"
               :source       :native
               :base_type    :type/Integer
               :effective_type :type/Integer
               :field_ref    [:field "user_id" {:base-type :type/Integer}]}
              {:name         "checkins_id"
               :display_name "checkins_id"
               :source       :native
               :base_type    :type/Integer
               :effective_type :type/Integer
               :field_ref    [:field "checkins_id" {:base-type :type/Integer}]}]
             (mt/cols
               (qp/process-query
                {:native   {:query (with-test-db-name
                                     (str "SELECT `v4_test_data.checkins`.`venue_id` AS `venue_id`, "
                                          "       `v4_test_data.checkins`.`user_id` AS `user_id`, "
                                          "       `v4_test_data.checkins`.`id` AS `checkins_id` "
                                          "FROM `v4_test_data.checkins` "
                                          "LIMIT 2"))}
                 :type     :native
                 :database (mt/id)})))))))

(deftest ^:parallel native-query-test-3
  (mt/test-driver :bigquery-cloud-sdk
    (testing "queries with array result columns deserialize properly (metabase#10275)"
      (is (= [[["foo" "bar"]
               [1 2]
               [3.14159265359 0.5772156649]
               [1234M 5678M]
               [#t "2018-01-01" #t "2018-12-31"]
               [#t "12:34" #t "20:01:13.230"]
               [#t "1957-05-17T03:35" #t "2018-06-01T01:15:34.120"]
               [#t "2014-09-27T20:30:00.450Z[UTC]" #t "2020-09-27T14:57:00.450Z[UTC]"]
               []]]
             (mt/rows
              (qp/process-query
               {:native   {:query (with-test-db-name
                                    (str "SELECT ['foo', 'bar'], "
                                         "[1, 2], "
                                         "[3.14159265359, 0.5772156649], "
                                         "[NUMERIC '1234', NUMERIC '5678'], "
                                         "[DATE '2018-01-01', DATE '2018-12-31'], "
                                         "[TIME '12:34:00.00', TIME '20:01:13.23'], "
                                         "[DATETIME '1957-05-17 03:35:00.00', DATETIME '2018-06-01 01:15:34.12'], "
                                         "[TIMESTAMP '2014-09-27 12:30:00.45-08', TIMESTAMP '2020-09-27 09:57:00.45-05'], "
                                         "[]"))}
                 :type     :native
                 :database (mt/id)})))))))

(deftest ^:parallel aggregations-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing (str "make sure queries with two or more of the same aggregation type still work. Aggregations used to be "
                  "deduplicated here in the BigQuery driver; now they are deduplicated as part of the main QP "
                  "middleware, but no reason not to keep a few of these tests just to be safe")
      (let [{:keys [rows columns]} (mt/rows+column-names
                                    (mt/run-mbql-query checkins
                                      {:aggregation [[:sum $user_id] [:sum $user_id]]}))]
        (is (= ["sum" "sum_2"]
               columns))
        (is (= [[7929 7929]]
               rows)))
      (let [{:keys [rows columns]} (mt/rows+column-names
                                    (mt/run-mbql-query checkins
                                      {:aggregation [[:sum $user_id] [:sum $user_id] [:sum $user_id]]}))]
        (is (= ["sum" "sum_2" "sum_3"]
               columns))
        (is (= [[7929 7929 7929]]
               rows))))))

(deftest ^:parallel aggregations-test-2
  (mt/test-driver :bigquery-cloud-sdk
    (testing "let's make sure we're generating correct HoneySQL + SQL for aggregations"
      (is (= (with-test-db-name
               {:query      ["SELECT"
                             "  `v4_test_data.venues`.`price` AS `price`,"
                             "  AVG("
                             "    `v4_test_data.venues`.`category_id`"
                             "  ) AS `avg`"
                             "FROM"
                             "  `v4_test_data.venues`"
                             "GROUP BY"
                             "  `price`"
                             "ORDER BY"
                             "  `avg` ASC,"
                             "  `v4_test_data.venues`.`price` ASC"]
                :params     nil
                :table-name "venues"
                :mbql?      true})

             (-> (mt/mbql-query venues
                   {:aggregation [[:avg $category_id]]
                    :breakout    [$price]
                    :order-by    [[:asc [:aggregation 0]]]})
                 qp.compile/compile
                 (update :query #(str/split-lines (driver/prettify-native-form :bigquery-cloud-sdk %)))))))))

(deftest ^:parallel join-alias-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing (str "Make sure that BigQuery properly aliases the names generated for Join Tables. It's important to use "
                  "the right alias, e.g. something like `categories__via__category_id`, which is considerably "
                  "different  what other SQL databases do. (#4218)")
      (let [results (mt/run-mbql-query venues
                                       {:aggregation [:count]
                                        :breakout    [$category_id->categories.name]})]
        (is (= (with-test-db-name
                 (->> ["SELECT"
                       "  `categories__via__category_id`.`name` AS `categories__via__category_id__name`,"
                       "  COUNT(*) AS `count`"
                       "FROM"
                       "  `v4_test_data.venues`"
                       "  LEFT JOIN `v4_test_data.categories` AS `categories__via__category_id` ON `v4_test_data.venues`.`category_id` = `categories__via__category_id`.`id`"
                       "GROUP BY"
                       "  `categories__via__category_id__name`"
                       "ORDER BY"
                       "  `categories__via__category_id__name` ASC"]
                        ;; reformat the SQL because the formatting may have changed once we change the test DB name.
                      (str/join " ")
                      (driver/prettify-native-form :bigquery-cloud-sdk)
                      str/split-lines))
               (or (when-let [sql (get-in results [:data :native_form :query])]
                     (str/split-lines (driver/prettify-native-form :bigquery-cloud-sdk sql)))
                   results)))))))

(defn- native-timestamp-query [db-or-db-id timestamp-str timezone-str]
  (-> (qp/process-query
        {:database (u/the-id db-or-db-id)
         :type     :native
         :native   {:query (format "select DATETIME(TIMESTAMP \"%s\", \"%s\")" timestamp-str timezone-str)}})
      :data
      :rows
      ffirst))

(deftest parsed-date-timezone-handling-test
  (mt/test-driver :bigquery-cloud-sdk
    (is (= "2018-08-31T00:00:00Z"
           (native-timestamp-query (mt/id) "2018-08-31 00:00:00" "UTC"))
        "A UTC date is returned, we should read/return it as UTC")

    (test.tz/with-system-timezone-id! "America/Chicago"
      (t2.with-temp/with-temp [Database db {:engine  :bigquery-cloud-sdk
                                            :details (assoc (:details (mt/db))
                                                            :use-jvm-timezone true)}]
        (is (= "2018-08-31T00:00:00-05:00"
               (native-timestamp-query db "2018-08-31 00:00:00-05" "America/Chicago"))
            (str "This test includes a `use-jvm-timezone` flag of true that will assume that the date coming from BigQuery "
                 "is already in the JVM's timezone. The test puts the JVM's timezone into America/Chicago an ensures that "
                 "the correct date is compared"))))

    (test.tz/with-system-timezone-id! "Asia/Jakarta"
      (t2.with-temp/with-temp [Database db {:engine  :bigquery-cloud-sdk
                                            :details (assoc (:details (mt/db))
                                                            :use-jvm-timezone true)}]
        (is (= "2018-08-31T00:00:00+07:00"
               (native-timestamp-query db "2018-08-31 00:00:00+07" "Asia/Jakarta"))
            "Similar to the above test, but covers a positive offset")))))

;; if I run a BigQuery query, does it get a remark added to it?
(defn- query->native [query]
  (let [native-query   (atom nil)
        done-exception (Exception. "Done.")]
    (binding [bigquery/*process-native* (fn [_respond _database sql _parameters _cancel-chan]
                                          (reset! native-query sql)
                                          (throw done-exception))]
      (try
        (qp/process-query query)
        (catch Throwable e
          (when-not (identical? e done-exception)
            (throw e))))
      @native-query)))

(deftest ^:parallel remark-test
  (mt/test-driver :bigquery-cloud-sdk
    (is (= (with-test-db-name
             (str "-- Metabase:: userID: 1000 queryType: MBQL queryHash: 01020304\n"
                  "SELECT"
                  " `v4_test_data.venues`.`id` AS `id`,"
                  " `v4_test_data.venues`.`name` AS `name`,"
                  " `v4_test_data.venues`.`category_id` AS `category_id`,"
                  " `v4_test_data.venues`.`latitude` AS `latitude`,"
                  " `v4_test_data.venues`.`longitude` AS `longitude`,"
                  " `v4_test_data.venues`.`price` AS `price` "
                  "FROM `v4_test_data.venues` "
                  "LIMIT 1"))
           (query->native
            {:database (mt/id)
             :type     :query
             :query    {:source-table (mt/id :venues)
                        :limit        1}
             :info     {:executed-by 1000
                        :query-hash  (byte-array [1 2 3 4])}}))
        "if I run a BigQuery query, does it get a remark added to it?")))

(deftest ^:parallel remove-remark-test
  (testing "if I run a BigQuery query with include-user-id-and-hash set to false, does it get a remark added to it?"
    (mt/test-driver :bigquery-cloud-sdk
      (qp.store/with-metadata-provider (let [db (merge meta/database
                                                       {:id      1
                                                        :engine  :bigquery-cloud-sdk
                                                        :details (merge (:details (mt/db))
                                                                        {:include-user-id-and-hash false})})]
                                         (lib.tu/mock-metadata-provider
                                          {:database db
                                           :tables   [(merge (meta/table-metadata :venues)
                                                             {:name   "venues"
                                                              :id     1
                                                              :db-id  1
                                                              :schema (get-in db [:details :dataset-filters-patterns])})]
                                           :fields   [(merge (meta/field-metadata :venues :id)
                                                             {:table-id  1
                                                              :name      "id"
                                                              :base-type :type/Integer})
                                                      (merge (meta/field-metadata :venues :name)
                                                             {:table-id  1
                                                              :name      "name"
                                                              :base_type :type/Text})]}))
        (is (= (with-test-db-name
                 (str "SELECT `v4_test_data.venues`.`id` AS `id`,"
                      " `v4_test_data.venues`.`name` AS `name` "
                      "FROM `v4_test_data.venues` "
                      "LIMIT 1"))
               (query->native
                {:database 1
                 :type     :query
                 :query    {:source-table 1
                            :limit        1}
                 :info     {:executed-by 1000
                            :query-hash  (byte-array [1 2 3 4])}})))))))

(deftest ^:parallel query-with-params-test
  (testing "Can we execute queries with parameters? (EE #277)"
           (mt/test-driver :bigquery-cloud-sdk

             (is (= [["Red Medicine"]]
                    (mt/rows
                     (qp/process-query
                      (mt/native-query
                        {:query  (with-test-db-name
                                   (str "SELECT `v4_test_data.venues`.`name` AS `name` "
                                        "FROM `v4_test_data.venues` "
                                        "WHERE `v4_test_data.venues`.`name` = ?"))
                         :params ["Red Medicine"]}))))))))

(deftest ^:parallel temporal-type-test
  (testing "Make sure we can detect temporal types correctly"
    (are [expr expected-type] (= expected-type
                                 (#'bigquery.qp/temporal-type expr))
      [:field "x" {:base-type :type/DateTime}]                              :datetime
      [:field "x" {:base-type :type/DateTime, :temporal-unit :day-of-week}] nil
      (meta/field-metadata :checkins :date)                                 :date)))

(deftest reconcile-temporal-types-test
  (doseq [test-case (bigquery.qp.reconciliation-tu/test-cases)]
    (testing (str \newline (u/pprint-to-str (list `bigquery.qp.reconciliation-tu/test-temporal-type-reconciliation! test-case)))
      (bigquery.qp.reconciliation-tu/test-temporal-type-reconciliation! test-case))))

(deftest reconcile-temporal-types-date-extraction-filters-test
  (mt/with-report-timezone-id! nil
    (qp.store/with-metadata-provider bigquery.qp.reconciliation-tu/mock-temporal-fields-metadata-provider
      (binding [*print-meta* true]
        (testing "\ndate extraction filters"
          (doseq [[temporal-type field] bigquery.qp.reconciliation-tu/mock-temporal-fields
                  :let                  [identifier          (-> (h2x/identifier :field "ABC" (name temporal-type))
                                                                 (vary-meta assoc ::bigquery.qp/do-not-qualify? true))
                                         expected-identifier (case temporal-type
                                                               :date      (h2x/with-database-type-info identifier "date")
                                                               :datetime  [:timestamp (h2x/with-database-type-info identifier "datetime")]
                                                               :timestamp (h2x/with-database-type-info identifier "timestamp"))]]
            (testing (format "\ntemporal-type = %s" temporal-type)
              (is (= [:=
                      [::bigquery.qp/extract :dayofweek expected-identifier nil]
                      [:inline 1]]
                     (sql.qp/->honeysql :bigquery-cloud-sdk [:= [:field (:id field) {:temporal-unit     :day-of-week
                                                                                     ::add/source-table "ABC"}] 1]))))))))))

(deftest reconcile-unix-timestamps-test
  (testing "temporal type reconciliation should work for UNIX timestamps (#15376)"
    (mt/test-driver :bigquery-cloud-sdk
      (mt/with-report-timezone-id! nil
        (mt/dataset test-data
          (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                            (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                            {:fields [{:id                (mt/id :reviews :rating)
                                                       :coercion-strategy :Coercion/UNIXMilliSeconds->DateTime
                                                       :effective-type    :type/Instant}]})
            (let [query         (mt/mbql-query reviews
                                  {:filter   [:=
                                              [:field %rating {::add/source-table $$reviews}]
                                              [:relative-datetime -30 :day]]
                                   :order-by [[:asc
                                               [:field %id {:add/source-table $$reviews}]]]
                                   :limit    1})
                  filter-clause (get-in query [:query :filter])]
              (is (= [(str (format "TIMESTAMP_MILLIS(%s.reviews.rating)" test-db-name)
                           " = "
                           "TIMESTAMP_TRUNC(TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL -30 day), day)")]
                     (sql/format-expr (sql.qp/->honeysql :bigquery-cloud-sdk filter-clause))))
              (is (= :completed
                     (:status (qp/process-query query)))))))))))

(deftest temporal-type-conversion-test
  (mt/with-driver :bigquery-cloud-sdk
    (qp.store/with-metadata-provider (mt/id)
      (mt/with-report-timezone-id! "US/Pacific"
        (let [temporal-string "2022-01-01"
              convert         (fn [from-t to-t]
                                (->> (#'bigquery.qp/->temporal-type to-t (#'bigquery.qp/->temporal-type from-t temporal-string))
                                     (sql.qp/format-honeysql :bigquery-cloud-sdk)))]
          (testing "convert from datetime to different temporal types"
            (testing :time
              (is (= ["TIME(DATETIME(?))" temporal-string]
                     (convert :datetime :time))))
            (testing :date
              (is (= ["DATE(DATETIME(?))" temporal-string]
                     (convert :datetime :date))))
            (testing :timestamp
              (is (= ["TIMESTAMP(DATETIME(?), 'US/Pacific')" temporal-string]
                     (convert :datetime :timestamp)))))
          (testing "convert from date to different temporal types"
            (testing :time
              (is (= ["TIME(DATE(?))" temporal-string]
                     (convert :date :time))))
            (testing :datetime
              (is (= ["DATETIME(DATE(?))" temporal-string]
                     (convert :date :datetime))))
            (testing :timestamp
              (is (= ["TIMESTAMP(DATE(?), 'US/Pacific')" temporal-string]
                     (convert :date :timestamp)))))
          (testing "convert from timestamp to different temporal types"
            (doseq [to-t [:time :date :datetime]]
              (testing to-t
                (is (= [(str (u/upper-case-en (name to-t)) "(TIMESTAMP(?, 'US/Pacific'), 'US/Pacific')") temporal-string]
                       (convert :timestamp to-t)))))))))))

(deftest reconcile-relative-datetimes-test-1
  (mt/with-driver :bigquery-cloud-sdk
    (mt/with-report-timezone-id! nil
      (qp.store/with-metadata-provider (mt/id)
        (testing "relative-datetime clauses on their own"
          (doseq [[t unit expected-sql]
                  [[:time      :hour "TIME_TRUNC(TIME_ADD(CURRENT_TIME(), INTERVAL -1 hour), hour)"]
                   [:date      :year "DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL -1 year), year)"]
                   [:datetime  :year "DATETIME_TRUNC(DATETIME_ADD(CURRENT_DATETIME(), INTERVAL -1 year), year)"]
                   ;; TIMESTAMP_ADD doesn't support `year` so this should cast a datetime instead
                   [:timestamp :year "TIMESTAMP_TRUNC(TIMESTAMP(DATETIME_ADD(CURRENT_DATETIME(), INTERVAL -1 year)), year)"]]]
            (testing t
              (let [hsql (->> (sql.qp/->honeysql :bigquery-cloud-sdk [:relative-datetime -1 unit])
                              (#'bigquery.qp/->temporal-type t))]
                (testing "Should have correct type metadata after reconciliation"
                  (is (= t
                         (#'bigquery.qp/temporal-type hsql))))
                (testing "Should get converted to the correct SQL"
                  (is (= [(str "WHERE " expected-sql)]
                         (sql.qp/format-honeysql :bigquery-cloud-sdk
                                                 {:where hsql}))))))))))))

(deftest reconcile-relative-datetimes-test-2
  (mt/with-driver :bigquery-cloud-sdk
    (qp.store/with-metadata-provider (mt/id)
      (testing "relative-datetime clauses on their own when a reporting timezone is set"
        (doseq [timezone ["UTC" "US/Pacific"]]
          (mt/with-report-timezone-id! timezone
            (doseq [[t [unit expected-sql]]
                    {:time      [:hour ["TIME_TRUNC("
                                        "  TIME_ADD(CURRENT_TIME('{{timezone}}'), INTERVAL -1 hour),"
                                        "  hour"
                                        ")"]]
                     :date      [:year ["DATE_TRUNC("
                                        "  DATE_ADD(CURRENT_DATE('{{timezone}}'), INTERVAL -1 year),"
                                        "  year"
                                        ")"]]
                     :datetime  [:year ["DATETIME_TRUNC("
                                        "  DATETIME_ADD(CURRENT_DATETIME('{{timezone}}'), INTERVAL -1 year),"
                                        "  year"
                                        ")"]]
                     ;; TIMESTAMP_ADD doesn't support `year` so this should cast a datetime instead
                     :timestamp [:year ["TIMESTAMP_TRUNC("
                                        "  TIMESTAMP("
                                        "    DATETIME_ADD(CURRENT_DATETIME('{{timezone}}'), INTERVAL -1 year),"
                                        "    '{{timezone}}'"
                                        "  ),"
                                        "  year,"
                                        "  '{{timezone}}'"
                                        ")"]]}
                    :let [expected-sql (for [line expected-sql]
                                         (str/replace line #"\Q{{timezone}}\E" timezone))]]
              (testing t
                (let [hsql (->> (sql.qp/->honeysql :bigquery-cloud-sdk [:relative-datetime -1 unit])
                                (#'bigquery.qp/->temporal-type t))]
                  (testing "Should have correct type metadata after reconciliation"
                    (is (= t
                           (#'bigquery.qp/temporal-type hsql))))
                  (testing "Should get converted to the correct SQL"
                    (is (= expected-sql
                           (->> (sql/format-expr hsql)
                                first
                                (driver/prettify-native-form :bigquery-cloud-sdk)
                                str/split-lines)))))))))))))

(deftest ^:parallel reconcile-relative-datetimes-test-3
  (mt/with-driver :bigquery-cloud-sdk
    (qp.store/with-metadata-provider (mt/id)
      (testing "relative-datetime clauses inside filter clauses"
        (doseq [[expected-type t] {:date      #t "2020-01-31"
                                   :datetime  #t "2020-01-31T20:43:00.000"
                                   :timestamp #t "2020-01-31T20:43:00.000-08:00"}]
          (testing expected-type
            (let [[_ _ relative-datetime :as clause] (sql.qp/->honeysql :bigquery-cloud-sdk
                                                                        [:=
                                                                         t
                                                                         [:relative-datetime -1 :year]])]
              (testing (format "\nclause = %s" (pr-str clause))
                (is (= expected-type
                       (#'bigquery.qp/temporal-type relative-datetime)))))))))))

(deftest field-literal-trunc-form-test
  (testing "`:field` clauses with literal string names should be quoted correctly when doing date truncation (#20806)"
    (mt/with-driver :bigquery-cloud-sdk
      (qp.store/with-metadata-provider (mt/id)
        (mt/with-temporary-setting-values [start-of-week :sunday]
          (is (= ["DATE_TRUNC(`source`.`date`, week(sunday))"]
                 (sql.qp/format-honeysql
                  :bigquery-cloud-sdk
                  (sql.qp/->honeysql
                   :bigquery-cloud-sdk
                   [:field "date" {:temporal-unit      :week
                                   :base-type          :type/Date
                                   ::add/source-table  ::add/source
                                   ::add/source-alias  "date"
                                   ::add/desired-alias "date"
                                   ::add/position      0}])))))))))

(deftest ^:parallel between-test
  (testing "Make sure :between clauses reconcile the temporal types of their args"
    (letfn [(between->sql [clause]
              (sql.qp/format-honeysql :bigquery-cloud-sdk
                                      {:where (sql.qp/->honeysql :bigquery-cloud-sdk clause)}))]
      (testing "Should look for `:bigquery-cloud-sdk/temporal-type` metadata"
        (is (= ["WHERE field BETWEEN ? AND ?"
                (t/local-date-time "2019-11-11T00:00")
                (t/local-date-time "2019-11-12T00:00")]
               (between->sql [:between
                              (with-meta (sql.qp/compiled [:raw "field"]) {:bigquery-cloud-sdk/temporal-type :datetime})
                              (t/local-date "2019-11-11")
                              (t/local-date "2019-11-12")]))))
      (testing "If first arg has no temporal-type info, should look at next arg"
        (is (= ["WHERE DATE(field) BETWEEN ? AND ?"
                (t/local-date "2019-11-11")
                (t/local-date "2019-11-12")]
               (between->sql [:between
                              (sql.qp/compiled [:raw "field"])
                              (t/local-date "2019-11-11")
                              (t/local-date "2019-11-12")]))))
      (testing "No need to cast if args agree on temporal type"
        (is (= ["WHERE field BETWEEN ? AND ?"
                (t/local-date "2019-11-11")
                (t/local-date "2019-11-12")]
               (between->sql [:between
                              (with-meta (sql.qp/compiled [:raw "field"]) {:bigquery-cloud-sdk/temporal-type :date})
                              (t/local-date "2019-11-11")
                              (t/local-date "2019-11-12")]))))
      (mt/test-driver :bigquery-cloud-sdk
        (qp.store/with-metadata-provider (mt/id)
          (let [expected [(with-test-db-name "WHERE `v4_test_data.checkins`.`date` BETWEEN ? AND ?")
                          (t/local-date "2019-11-11")
                          (t/local-date "2019-11-12")]]
            (testing "Should be able to get temporal type from a `:field` with integer ID"
              (is (= expected
                     (between->sql [:between
                                    [:field (mt/id :checkins :date) {::add/source-table (mt/id :checkins)}]
                                    (t/local-date "2019-11-11")
                                    (t/local-date "2019-11-12")]))))
            (testing "Should be able to get temporal type from a `:field` with `:temporal-unit`"
              (is (= (cons (with-test-db-name "WHERE DATE_TRUNC(`v4_test_data.checkins`.`date`, day) BETWEEN ? AND ?")
                           (rest expected))
                     (between->sql [:between
                                    [:field (mt/id :checkins :date) {::add/source-table (mt/id :checkins)
                                                                     :temporal-unit     :day}]
                                    (t/local-date "2019-11-11")
                                    (t/local-date "2019-11-12")]))))
            (testing "Should work with a field literal"
              (is (= ["WHERE `date` BETWEEN ? AND ?" (t/local-date "2019-11-11") (t/local-date "2019-11-12")]
                     (between->sql [:between
                                    [:field "date" {:base-type :type/Date}]
                                    (t/local-date-time "2019-11-11T12:00:00")
                                    (t/local-date-time "2019-11-12T12:00:00")]))))))))))

(defn- do-with-datetime-timestamp-table [f]
  (driver/with-driver :bigquery-cloud-sdk
    (let [table-name (format "table_%s" (mt/random-name))]
      (mt/with-temp-copy-of-db
        (try
          (bigquery.tx/execute!
           (with-test-db-name
             (format "CREATE TABLE `v4_test_data.%s` ( ts TIMESTAMP, dt DATETIME )" table-name)))
          (bigquery.tx/execute!
           (with-test-db-name
             (format "INSERT INTO `v4_test_data.%s` (ts, dt) VALUES (TIMESTAMP \"2020-01-01 00:00:00 UTC\", DATETIME \"2020-01-01 00:00:00\")"
                     table-name)))
          (sync/sync-database! (mt/db))
          (f table-name)
          (finally
            (bigquery.tx/execute! (with-test-db-name "DROP TABLE IF EXISTS `v4_test_data.%s`") table-name)))))))

(deftest ^:parallel filter-by-datetime-timestamp-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Make sure we can filter against different types of BigQuery temporal columns (#11222)"
      (do-with-datetime-timestamp-table
       (fn [table-name]
         (doseq [column [:ts :dt]]
           (testing (format "Filtering against %s column" column)
             (doseq [s    ["2020-01-01" "2020-01-01T00:00:00"]
                     field [[:field (mt/id table-name column) nil]
                            [:field (mt/id table-name column) {:temporal-unit :default}]
                            [:field (mt/id table-name column) {:temporal-unit :day}]]
                     :let [filter-clause [:= field s]]]
               (testing (format "\nMBQL filter clause = %s" (pr-str filter-clause))
                 (is (= [["2020-01-01T00:00:00Z" "2020-01-01T00:00:00Z"]]
                        (mt/rows
                          (mt/run-mbql-query nil
                            {:source-table (mt/id table-name)
                             :filter       filter-clause})))))))))))))

(deftest ^:parallel datetime-parameterized-sql-test
  (mt/test-driver :bigquery-cloud-sdk
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
              (let [query {:database   (mt/id)
                           :type       :native
                           :native     {:query         (str "SELECT count(*)\n"
                                                            (format "FROM `%s.attempts`\n"
                                                                    (bigquery.tx/test-dataset-id "attempted_murders"))
                                                            "WHERE {{d}}")
                                        :template-tags {"d" {:name         "d"
                                                             :display-name "Date"
                                                             :type         :dimension
                                                             :widget-type  :date/all-options
                                                             :dimension    [:field (mt/id :attempts field) nil]}}}
                           :parameters [{:type   value-type
                                         :name   "d"
                                         :target [:dimension [:template-tag "d"]]
                                         :value  value}]}]
                (mt/with-native-query-testing-context query
                  (is (= [[0]]
                         (mt/rows (qp/process-query query)))))))))))))


(deftest datetime-timezone-parameter-test
  (testing "Date Field Filter not includes Timezone (#43597)"
    (mt/test-driver
      :bigquery-cloud-sdk
      (mt/dataset
        attempted-murders
        (doseq [:let [expectations {["Europe/Oslo" :date "2020-01-09"]
                                    [#t"2020-01-09"],
                                    ["Europe/Oslo" :datetime "2020-01-09"]
                                    [#t "2020-01-09T00:00" #t "2020-01-10T00:00"],
                                    ["Europe/Oslo" :datetime "2020-01-09T01:03"]
                                    [#t "2020-01-09T01:03" #t "2020-01-09T01:04"],
                                    ["Europe/Oslo" :datetime_tz "2020-01-09"]
                                    [#t "2020-01-09T00:00+01:00[Europe/Oslo]" #t "2020-01-10T00:00+01:00[Europe/Oslo]"],
                                    ["Europe/Oslo" :datetime_tz "2020-01-09T01:03"]
                                    [#t "2020-01-09T01:03+01:00[Europe/Oslo]" #t "2020-01-09T01:04+01:00[Europe/Oslo]"],

                                    ["UTC" :date "2020-01-09"]
                                    [#t"2020-01-09"],
                                    ["UTC" :datetime "2020-01-09"]
                                    [#t "2020-01-09T00:00" #t "2020-01-10T00:00"],
                                    ["UTC" :datetime "2020-01-09T01:03"]
                                    [#t "2020-01-09T01:03" #t "2020-01-09T01:04"],
                                    ["UTC" :datetime_tz "2020-01-09"]
                                    [#t "2020-01-09T00:00Z[UTC]" #t "2020-01-10T00:00Z[UTC]"],
                                    ["UTC" :datetime_tz "2020-01-09T01:03"]
                                    [#t "2020-01-09T01:03Z[UTC]" #t "2020-01-09T01:04Z[UTC]"],

                                    [nil :date "2020-01-09"]
                                    [#t"2020-01-09"]
                                    [nil :datetime "2020-01-09"]
                                    [#t "2020-01-09T00:00" #t "2020-01-10T00:00"],
                                    [nil :datetime "2020-01-09T01:03"]
                                    [#t "2020-01-09T01:03" #t "2020-01-09T01:04"],
                                    [nil :datetime_tz "2020-01-09"]
                                    [#t "2020-01-09T00:00Z[UTC]" #t "2020-01-10T00:00Z[UTC]"]
                                    [nil :datetime_tz "2020-01-09T01:03"]
                                    [#t "2020-01-09T01:03Z[UTC]" #t "2020-01-09T01:04Z[UTC]"]}]
                tz [nil "Europe/Oslo" "UTC"]
                field [:date :datetime :datetime_tz]
                value (cond-> ["2020-01-09"]
                        (not= field :date)
                        (conj "2020-01-09T01:03"))]
          (testing (format "With TZ %s: field: %s value: %s parsed: %s" tz field value (pr-str (u.date/parse value)))
            (mt/with-report-timezone-id!
              tz
              (let [expected (get expectations [tz field value])
                    value-type :date/single
                    query {:database (mt/id)
                           :type :native
                           :native {:query (str "SELECT count(*)\n"
                                                (format "FROM `%s.attempts`\n"
                                                        (bigquery.tx/test-dataset-id "attempted_murders"))
                                                "WHERE {{d}}")
                                    :template-tags {"d" {:name         "d"
                                                         :display-name "Date"
                                                         :type         :dimension
                                                         :widget-type  :date/all-options
                                                         :dimension    [:field (mt/id :attempts field) nil]}}}
                           :parameters [{:type value-type
                                         :name "d"
                                         :target [:dimension [:template-tag "d"]]
                                         :value value}]}]
                (is (= expected (:params (qp.compile/compile query))))))))))))

(deftest current-datetime-honeysql-form-test
  (mt/test-driver :bigquery-cloud-sdk
    (qp.store/with-metadata-provider (mt/id)
      (testing (str "The object returned by `current-datetime-honeysql-form` should be a magic object that can take on "
                    "whatever temporal type we want.")
        (doseq [report-timezone [nil "UTC"]]
          (mt/with-report-timezone-id! report-timezone
            (let [form (sql.qp/current-datetime-honeysql-form :bigquery-cloud-sdk)]
              (is (= nil
                     (#'bigquery.qp/temporal-type form))
                  "When created the temporal type should be unspecified. The world's your oyster!")
              (is (= ["CURRENT_TIMESTAMP()"]
                     (sql/format-expr form))
                  "Should fall back to acting like a timestamp if we don't coerce it to something else first")
              (doseq [[temporal-type expected-sql] {:date      (if report-timezone "CURRENT_DATE('UTC')"     "CURRENT_DATE()")
                                                    :time      (if report-timezone "CURRENT_TIME('UTC')"     "CURRENT_TIME()")
                                                    :datetime  (if report-timezone "CURRENT_DATETIME('UTC')" "CURRENT_DATETIME()")
                                                    :timestamp "CURRENT_TIMESTAMP()"}]
                (testing (format "temporal type = %s" temporal-type)
                  (is (= temporal-type
                         (#'bigquery.qp/temporal-type (#'bigquery.qp/->temporal-type temporal-type form)))
                      "Should be possible to convert to another temporal type/should report its type correctly")
                  (is (= [expected-sql]
                         (sql/format-expr (#'bigquery.qp/->temporal-type temporal-type form)))
                      "Should convert to the correct SQL"))))))))))

(deftest current-datetime-honeysql-form-test-2
  (mt/test-driver :bigquery-cloud-sdk
    (qp.store/with-metadata-provider (mt/id)
      (testing (str "The object returned by `current-datetime-honeysql-form` should use the reporting timezone when set.")
        (doseq [timezone ["UTC" "US/Pacific"]]
          (mt/with-report-timezone-id! timezone
            (let [form (sql.qp/current-datetime-honeysql-form :bigquery-cloud-sdk)]
              (is (= ["CURRENT_TIMESTAMP()"]
                     (sql/format-expr form))
                  "Should fall back to acting like a timestamp if we don't coerce it to something else first")
              (doseq [[temporal-type expected-sql] {:date      (str "CURRENT_DATE('" timezone "')")
                                                    :time      (str "CURRENT_TIME('" timezone "')")
                                                    :datetime  (str "CURRENT_DATETIME('" timezone "')")
                                                    :timestamp "CURRENT_TIMESTAMP()"}]
                (testing (format "temporal type = %s" temporal-type)
                  (is (= temporal-type
                         (#'bigquery.qp/temporal-type (#'bigquery.qp/->temporal-type temporal-type form)))
                      "Should be possible to convert to another temporal type/should report its type correctly")
                  (is (= [expected-sql]
                         (sql/format-expr (#'bigquery.qp/->temporal-type temporal-type form)))
                      "Should specify the correct timezone in the SQL for non-timestamp functions"))))))))))

(deftest add-interval-honeysql-form-test
  ;; this doesn't test conversion to/from time because there's no unit we can use that works for all for. So we'll
  ;; just test the 3 that support `:day` and that should be proof the logic is working. (The code that actually uses
  ;; this is tested e2e by [[filter-by-relative-date-ranges-test]] anyway.)
  (mt/test-driver :bigquery-cloud-sdk
    (qp.store/with-metadata-provider (mt/id)
      (mt/with-report-timezone-id! nil
        (doseq [initial-type [:date :datetime :timestamp]
                :let         [form (sql.qp/add-interval-honeysql-form
                                    :bigquery-cloud-sdk
                                    (#'bigquery.qp/->temporal-type
                                     initial-type
                                     (sql.qp/current-datetime-honeysql-form :bigquery-cloud-sdk))
                                    -1
                                    :day)]]
          (testing (format "initial form = %s" (pr-str form))
            (is (= initial-type
                   (#'bigquery.qp/temporal-type form))
                "Should have the temporal-type of the form it wraps when created.")
            (doseq [[new-type expected-sql] {:date      "DATE_ADD(CURRENT_DATE(), INTERVAL -1 day)"
                                             :datetime  "DATETIME_ADD(CURRENT_DATETIME(), INTERVAL -1 day)"
                                             :timestamp "TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL -1 day)"}]
              (testing (format "\nconvert from %s -> %s" initial-type new-type)
                (is (= new-type
                       (#'bigquery.qp/temporal-type (#'bigquery.qp/->temporal-type new-type form)))
                    "Should be possible to convert to another temporal type/should report its type correctly")
                (is (= [expected-sql]
                       (sql/format-expr (#'bigquery.qp/->temporal-type new-type form)))
                    "Should convert to the correct SQL")))))))))

(deftest filter-by-relative-date-ranges-test
  (mt/with-driver :bigquery-cloud-sdk
    (testing "Make sure the SQL we generate for filters against relative-datetimes is typed correctly"
      (doseq [[field-type [unit expected-sql]]
              {:type/Time                [:hour (str "WHERE TIME_TRUNC(ABC.time, hour)"
                                                     " = TIME_TRUNC(TIME_ADD(CURRENT_TIME(), INTERVAL -1 hour), hour)")]
               :type/Date                [:year (str "WHERE DATE_TRUNC(ABC.date, year)"
                                                     " = DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL -1 year), year)")]
               :type/DateTime            [:year (str "WHERE DATETIME_TRUNC(ABC.datetime, year)"
                                                     " = DATETIME_TRUNC(DATETIME_ADD(CURRENT_DATETIME(), INTERVAL -1 year), year)")]
               ;; `TIMESTAMP_ADD` doesn't support `year` so it should do `DATETIME_ADD` first, then cast to `TIMESTAMP`
               ;; later.
               :type/DateTimeWithLocalTZ [:year (str "WHERE TIMESTAMP_TRUNC(ABC.datetimewithlocaltz, year)"
                                                     " = TIMESTAMP_TRUNC(TIMESTAMP(DATETIME_ADD(CURRENT_DATETIME(), INTERVAL -1 year)), year)")]}]
        (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                          meta/metadata-provider
                                          {:fields [(merge (meta/field-metadata :checkins :date)
                                                           {:id             1
                                                            :name           (u/lower-case-en (name field-type))
                                                            :base-type      field-type
                                                            :effective-type field-type
                                                            :database-type  (name (bigquery.tx/base-type->bigquery-type field-type))})]})
          (mt/with-report-timezone-id! nil
            (testing (format "%s field" field-type)
              (is (= [expected-sql]
                     (sql/format {:where (sql.qp/->honeysql
                                          :bigquery-cloud-sdk
                                          [:=
                                           [:field 1 {:temporal-unit     unit
                                                      ::add/source-table "ABC"}]
                                           [:relative-datetime -1 unit]])}
                                 {:dialect ::h2x/unquoted-dialect}))))))))))

(deftest filter-by-relative-date-ranges-test-2
  (mt/with-driver :bigquery-cloud-sdk
    (testing "Make sure the SQL we generate for filters against relative-datetimes uses the reporting timezone when set"
      (doseq [timezone ["UTC" "US/Pacific"]]
        (mt/with-report-timezone-id! timezone
          (letfn [(mock-metadata-provider [field-type]
                    (lib.tu/mock-metadata-provider
                     meta/metadata-provider
                     {:fields [(merge (meta/field-metadata :checkins :date)
                                      {:id             1
                                       :name           (u/lower-case-en (name field-type))
                                       :base-type      field-type
                                       :effective-type field-type
                                       :database-type  (name (bigquery.tx/base-type->bigquery-type field-type))})]}))
                  (compile-sql [field-type unit]
                    (qp.store/with-metadata-provider (mock-metadata-provider field-type)
                      (let [[sql] (sql/format {:where (sql.qp/->honeysql
                                                       :bigquery-cloud-sdk
                                                       [:=
                                                        [:field 1 {:temporal-unit     unit
                                                                   ::add/source-table "ABC"}]
                                                        [:relative-datetime -1 unit]])}
                                              {:dialect ::h2x/unquoted-dialect})]
                        (str/split-lines (driver/prettify-native-form :bigquery-cloud-sdk sql)))))]
            (are [field-type unit expected-sql] (= (for [line expected-sql]
                                                     (str/replace line #"\Q{{timezone}}\E" timezone))
                                                   (compile-sql field-type unit))
              :type/Time
              :hour
              ["WHERE"
               "  TIME_TRUNC(ABC.time, hour) = TIME_TRUNC("
               "    TIME_ADD(CURRENT_TIME('{{timezone}}'), INTERVAL -1 hour),"
               "    hour"
               "  )"]

              :type/Date
              :year
              ["WHERE"
               "  DATE_TRUNC(ABC.date, year) = DATE_TRUNC("
               "    DATE_ADD(CURRENT_DATE('{{timezone}}'), INTERVAL -1 year),"
               "    year"
               "  )"]

              :type/DateTime
              :year
              ["WHERE"
               "  DATETIME_TRUNC(ABC.datetime, year) = DATETIME_TRUNC("
               "    DATETIME_ADD(CURRENT_DATETIME('{{timezone}}'), INTERVAL -1 year),"
               "    year"
               "  )"]

              ;; `TIMESTAMP_ADD` doesa't support `year` so it should cast a `DATETIME_TRUNC` instead, but when it
              ;; converts to a timestamp it needs to specify the tz
              :type/DateTimeWithLocalTZ
              :year
              ["WHERE"
               "  TIMESTAMP_TRUNC(ABC.datetimewithlocaltz, year, '{{timezone}}') = TIMESTAMP_TRUNC("
               "    TIMESTAMP("
               "      DATETIME_ADD(CURRENT_DATETIME('{{timezone}}'), INTERVAL -1 year),"
               "      '{{timezone}}'"
               "    ),"
               "    year,"
               "    '{{timezone}}'"
               "  )"])))))))

;; This is a table of different BigQuery column types -> temporal units we should be able to bucket them by for
;; filtering purposes against RELATIVE-DATETIMES. `relative-datetime` only supports the unit below -- a subset of all
;; the MBQL date bucketing units.
(def ^:private filter-test-table
  [[nil          :minute :hour :day  :week :month :quarter :year]
   [:time        true    true  false false false  false    false]
   [:datetime    true    true  true  true  true   true     true]
   [:date        false   false true  true  true   true     true]
   [:datetime_tz true    true  true  true  true   true     true]])

(defn- test-table-seq [table]
  (let [col-keys (rest (first table))]
    (for [[row-key & vs]     (rest table)
          [col-key expected] (zipmap col-keys vs)]
      {:row      row-key
       :col      col-key
       :expected expected})))

(defn- can-we-filter-against-relative-datetime?! [field unit report-timezone]
  (try
    (mt/test-driver :bigquery-cloud-sdk
      (mt/dataset attempted-murders
        (mt/with-report-timezone-id! report-timezone
          (mt/run-mbql-query attempts
            {:aggregation [[:count]]
             :filter      [:time-interval (mt/id :attempts field) :last unit]}))))
    true
    (catch Throwable _
      false)))

(defn- run-filter-test-table-tests-for-field! [field report-timezone]
  (testing (str "Make sure filtering against relative date ranges works correctly regardless of underlying column "
                "type (#11725)")
    (doseq [test-case       (test-table-seq filter-test-table)
            :when           (= (:row test-case) field)
            :let            [unit (:col test-case)]]
      (if (:expected test-case)
        (is (can-we-filter-against-relative-datetime?! field unit report-timezone))
        (is (not (can-we-filter-against-relative-datetime?! field unit report-timezone)))))))

(deftest filter-by-relative-date-ranges-e2e-time-test      (run-filter-test-table-tests-for-field! :time nil))
(deftest filter-by-relative-date-ranges-e2e-datetime-test  (run-filter-test-table-tests-for-field! :datetime nil))
(deftest filter-by-relative-date-ranges-e2e-date-test      (run-filter-test-table-tests-for-field! :date nil))
(deftest filter-by-relative-date-ranges-e2e-timestamp-test (run-filter-test-table-tests-for-field! :datetime_tz nil))

(deftest filter-by-relative-date-ranges-e2e-time-report-timezone-test      (run-filter-test-table-tests-for-field! :time "UTC"))
(deftest filter-by-relative-date-ranges-e2e-datetime-report-timezone-test  (run-filter-test-table-tests-for-field! :datetime "UTC"))
(deftest filter-by-relative-date-ranges-e2e-date-report-timezone-test      (run-filter-test-table-tests-for-field! :date "UTC"))
(deftest filter-by-relative-date-ranges-e2e-timestamp-report-timezone-test (run-filter-test-table-tests-for-field! :datetime_tz "UTC"))

;; This is a table of different BigQuery column types -> temporal units we should be able to bucket them by for
;; breakout purposes.
(def ^:private breakout-test-table
  [[nil          :default :minute :hour :day  :week :month :quarter :year :minute-of-hour :hour-of-day :day-of-week :day-of-month :day-of-year :week-of-year :month-of-year :quarter-of-year]
   [:time        true     true    true  false false false  false    false true            true         false        false         false        false         false          false]
   [:datetime    true     true    true  true  true  true   true     true  true            true         true         true          true         true          true           true]
   [:date        true     false   false true  true  true   true     true  false           false        true         true          true         true          true           true]
   [:datetime_tz true     true    true  true  true  true   true     true  true            true         true         true          true         true          true           true]])

(defn- can-breakout?! [field unit report-timezone]
  (try
    (mt/test-driver :bigquery-cloud-sdk
      (mt/dataset attempted-murders
        (mt/with-report-timezone-id! report-timezone
          (mt/run-mbql-query attempts
            {:aggregation [[:count]]
             :breakout    [[:field (mt/id :attempts field) {:temporal-unit unit}]]}))))
    true
    (catch Throwable _
      false)))

(defn- run-breakout-test-table-tests-for-field!
  [field report-timezone]
  (testing "Make sure datetime breakouts like :minute-of-hour work correctly for different temporal types"
    (doseq [test-case (test-table-seq breakout-test-table)
            :when     (= (:row test-case) field)
            :let      [unit (:col test-case)]]
      (if (:expected test-case)
        (is (can-breakout?! field unit report-timezone))
        (is (not (can-breakout?! field unit report-timezone)))))))

(deftest breakout-by-bucketed-datetimes-e2e-time-test      (run-breakout-test-table-tests-for-field! :time nil))
(deftest breakout-by-bucketed-datetimes-e2e-datetime-test  (run-breakout-test-table-tests-for-field! :datetime nil))
(deftest breakout-by-bucketed-datetimes-e2e-date-test      (run-breakout-test-table-tests-for-field! :date nil))
(deftest breakout-by-bucketed-datetimes-e2e-timestamp-test (run-breakout-test-table-tests-for-field! :datetime_tz nil))

(deftest breakout-by-bucketed-datetimes-e2e-time-report-timezone-test      (run-breakout-test-table-tests-for-field! :time "UTC"))
(deftest breakout-by-bucketed-datetimes-e2e-datetime-report-timezone-test  (run-breakout-test-table-tests-for-field! :datetime "UTC"))
(deftest breakout-by-bucketed-datetimes-e2e-date-report-timezone-test      (run-breakout-test-table-tests-for-field! :date "UTC"))
(deftest breakout-by-bucketed-datetimes-e2e-timestamp-report-timezone-test (run-breakout-test-table-tests-for-field! :datetime_tz "UTC"))

(deftest ^:parallel string-escape-test
  (mt/test-driver :bigquery-cloud-sdk
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
                    {:query  (with-test-db-name
                               (str "SELECT count(*) AS `count` "
                                    "FROM `v4_test_data.venues` "
                                    "WHERE `v4_test_data.venues`.`name` = ?"))
                     :params ["x\\\\' OR 1 = 1 -- "]})))))))))

(deftest ^:parallel escape-alias-test
  (testing "`escape-alias` should generate valid field identifiers"
    (testing "no need to change anything"
      (is (= "abc"
             (driver/escape-alias :bigquery-cloud-sdk "abc"))))
    (testing "replace spaces with underscores"
      (is (= "A_B_C"
             (driver/escape-alias :bigquery-cloud-sdk "A B C"))))
    (testing "trim spaces"
      (is (= "A_B"
             (driver/escape-alias :bigquery-cloud-sdk " A B "))))
    (testing "diacritical marks"
      (is (= "Organizacao"
             (driver/escape-alias :bigquery-cloud-sdk "Organização"))))
    (testing "cannot start with a number"
      (is (= "_123"
             (driver/escape-alias :bigquery-cloud-sdk "123"))))
    (testing "replace non-letter characters with underscores"
      (is (= "_"
             (driver/escape-alias :bigquery-cloud-sdk "😍"))))
    (testing "trim long strings"
      (is (= "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_89971909"
             (driver/escape-alias :bigquery-cloud-sdk (str/join (repeat 300 "a"))))))))

(deftest ^:parallel remove-diacriticals-from-field-aliases-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "We should remove diacriticals and other disallowed characters from field aliases (#14933)"
      (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                        (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                        {:tables [{:id (mt/id :venues), :name "Organização"}]})
        (let [query (mt/mbql-query checkins
                                   {:fields [$id $venue-id->venues.name]
                                    :limit  1})]
          (is (= (with-test-db-name
                   {:query      ["SELECT"
                                 "  `v4_test_data.checkins`.`id` AS `id`,"
                                 "  `Organizacao__via__venue_id`.`name` AS `Organizacao__via__venue_id__name`"
                                 "FROM"
                                 "  `v4_test_data.checkins`"
                                 "  LEFT JOIN `v4_test_data.Organização` AS `Organizacao__via__venue_id` ON `v4_test_data.checkins`.`venue_id` = `Organizacao__via__venue_id`.`id`"
                                 "LIMIT"
                                 "  1"]
                    :params     nil
                    :table-name "checkins"
                    :mbql?      true})
                 (-> (qp.compile/compile query)
                     (update :query #(str/split-lines (driver/prettify-native-form :bigquery-cloud-sdk %)))))))))))

(deftest ^:parallel multiple-template-parameters-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Make sure multiple template parameters can be used in a single query correctly (#15487)"
      (is (= ["foo" "bar"]
             (mt/first-row
               (qp/process-query
                 {:database   (mt/id)
                  :type       :native
                  :native     {:query (str "DECLARE param1 STRING DEFAULT {{p1}};\n"
                                           "DECLARE param2 STRING DEFAULT {{p2}};\n"
                                            "SELECT param1, param2")
                               :template-tags {:p1 {:name         "p1"
                                                    :display_name "p1"
                                                    :type         "text"
                                                    :required     true}
                                               :p2 {:name         "p2"
                                                    :display_name "p2"
                                                    :type         "text"
                                                    :required     true}}}
                  :parameters [{:type   "text"
                                :name   "p1"
                                :target [:variable [:template-tag "p1"]]
                                :value  "foo"}
                               {:type   "text"
                                :name   "p2"
                                :target [:variable [:template-tag "p2"]]
                                :value  "bar"}]})))))))

(deftest ^:parallel multiple-counts-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Count of count grouping works (#15074)"
      (let [query (mt/mbql-query checkins
                    {:aggregation  [[:count]]
                     :breakout     [[:field "count" {:base-type :type/Integer}]]
                     :source-query {:source-table (mt/id :checkins)
                                    :aggregation  [[:count]]
                                    :breakout     [!month.date]}
                     :limit        2})]
        (mt/with-native-query-testing-context query
          (is (= (with-test-db-name
                   {:query      ["SELECT"
                                 "  `source`.`count` AS `count`,"
                                 "  COUNT(*) AS `count_2`"
                                 "FROM"
                                 "  ("
                                 "    SELECT"
                                 "      DATE_TRUNC("
                                 "        `v4_test_data.checkins`.`date`,"

                                 "        month"
                                 "      ) AS `date`,"
                                 "      COUNT(*) AS `count`"
                                 "    FROM"
                                 "      `v4_test_data.checkins`"
                                 "    GROUP BY"
                                 "      `date`"
                                 "    ORDER BY"
                                 "      `date` ASC"
                                 "  ) AS `source`"
                                 "GROUP BY"
                                 "  `count`"
                                 "ORDER BY"
                                 "  `count` ASC"
                                 "LIMIT"
                                 "  2"]
                    :params     nil
                    :table-name "source"
                    :mbql?      true})
                 (-> (qp.compile/compile query)
                     (update :query #(str/split-lines (driver/prettify-native-form :bigquery-cloud-sdk %))))))
          (is (= [[7 1] [8 1]]
                 (mt/rows
                  (qp/process-query query)))))))))

(deftest ^:parallel custom-expression-args-quoted
  (mt/test-driver :bigquery-cloud-sdk
    (mt/dataset test-data
      (testing "Arguments to custom aggregation expression functions have backticks applied properly"
        (is (= {:mbql?      true
                :params     nil
                :table-name "orders"
                :query      (for [line ["SELECT"
                                        "  APPROX_QUANTILES("
                                        "    `v4_sample_dataset.orders`.`quantity`,"
                                        "    10"
                                        "  ) [OFFSET(5)] AS `CE`"
                                        "FROM"
                                        "  `v4_sample_dataset.orders`"
                                        "LIMIT"
                                        "  10"]]
                              (str/replace line #"\Qv4_sample_dataset\E" test-db-name))}
               (-> (mt/mbql-query orders
                     {:aggregation [[:aggregation-options
                                     [:percentile $orders.quantity 0.5]
                                     {:name "CE", :display-name "CE"}]]
                      :limit       10})
                   qp.compile/compile
                   (update :query #(str/split-lines (driver/prettify-native-form :bigquery-cloud-sdk %))))))))))

(deftest ^:parallel no-qualify-breakout-field-name-with-subquery-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "Make sure columns name `source` in source query work correctly (#18742)"
      (let [query (mt/mbql-query checkins
                    {:aggregation  [[:count]]
                     :breakout     [[:field "source" {:base-type :type/Text}]]
                     :source-query {:native "select 1 as `val`, '2' as `source`"}})]
        (is (= {:query      ["SELECT"
                             "  `source`.`source` AS `source`,"
                             "  COUNT(*) AS `count`"
                             "FROM"
                             "  ("
                             "    select"
                             "      1 as `val`,"
                             "      '2' as `source`"
                             "  ) AS `source`"
                             "GROUP BY"
                             "  `source`"
                             "ORDER BY"
                             "  `source` ASC"]
                :params     nil
                :table-name "source"
                :mbql?      true}
               (-> (qp.compile/compile query)
                   (update :query #(str/split-lines (driver/prettify-native-form :bigquery-cloud-sdk %))))))
        (mt/with-native-query-testing-context query
          (is (= [["2" 1]]
                 (mt/rows (qp/process-query query)))))))))

(deftest ^:parallel cast-timestamp-to-datetime-if-needed-for-temporal-arithmetic-test
  (testing "cast timestamps to datetimes so we can use DATETIME_ADD() if needed for units like month (#21969)"
    (is (= ["DATETIME_ADD(CAST(? AS datetime), INTERVAL 3 month)"
            #t "2022-04-22T18:27-08:00"]
           (let [t         #t "2022-04-22T18:27:00-08:00"
                 hsql-form (sql.qp/add-interval-honeysql-form :bigquery-cloud-sdk t 3 :month)]
             (sql.qp/format-honeysql :bigquery-cloud-sdk hsql-form))))))

(deftest ^:parallel custom-expression-with-space-in-having
  (mt/test-driver :bigquery-cloud-sdk
    (mt/dataset avian-singles
      (testing "Custom expressions with spaces are matched properly (#22310)"
        (let [name-with-spaces "sum id diff"
              sql-query (-> (mt/mbql-query messages
                              {:filter [:> [:field name-with-spaces {:base-type :type/Float}] 5]
                               :source-query {:source-table $$messages
                                              :aggregation [[:aggregation-options
                                                             [:sum [:- $sender_id $receiver_id]]
                                                             {:name name-with-spaces
                                                              :display-name name-with-spaces}]]
                                              :breakout [$text]}
                               :limit 1})
                            qp.compile/compile
                            :query)]
          (is (not (str/includes? sql-query name-with-spaces))
              (format "Query `%s' should not contain `%s'" sql-query name-with-spaces)))))))

(deftest ^:parallel parse-bigquery-bignumeric-correctly-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [query (mt/native-query {:query (str/join \newline
                                                   ["select"
                                                    "  1234.1234567890123456                     as extremely_long_undef"
                                                    ", cast(1234.1234567890123456 as decimal)    as extremely_long_decimal"
                                                    ", cast(1234.1234567890123456 as float64)    as extremely_long_float64"
                                                    ", cast(1234.1234567890123456 as bigdecimal) as extremely_long_BIGdecimal"])})]
      (is (= [[1234.1234567890124
               1234.123456789M
               1234.1234567890124
               1234.1234567890123456M]]
             (mt/rows (mt/process-query query)))))))

(deftest ^:parallel test-bigquery-log
  (testing "correct format of log10 for BigQuery"
    (is (= ["LOG(150, 10)"]
           (sql/format-expr (sql.qp/->honeysql :bigquery-cloud-sdk [:log 150]))))))

(deftest ^:parallel mixed-cumulative-and-non-cumulative-aggregations-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          orders            (lib.metadata/table metadata-provider (mt/id :orders))
          orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
          orders-total      (lib.metadata/field metadata-provider (mt/id :orders :total))
          query             (-> (lib/query metadata-provider orders)
                                ;; 1. month
                                (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                ;; 2. cumulative count of orders
                                (lib/aggregate (lib/cum-count))
                                ;; 3. cumulative sum of order total
                                (lib/aggregate (lib/cum-sum orders-total))
                                ;; 4. sum of order total
                                (lib/aggregate (lib/sum orders-total))
                                (lib/limit 3))]
      (is (= ["SELECT"
              "  `source`.`created_at` AS `created_at`,"
              "  SUM(COUNT(*)) OVER ("
              "    ORDER BY"
              "      `source`.`created_at` ASC ROWS UNBOUNDED PRECEDING"
              "  ) AS `count`,"
              "  SUM(SUM(`source`.`total`)) OVER ("
              "    ORDER BY"
              "      `source`.`created_at` ASC ROWS UNBOUNDED PRECEDING"
              "  ) AS `sum`,"
              "  SUM(`source`.`total`) AS `sum_2`"
              "FROM"
              "  ("
              "    SELECT"
              "      TIMESTAMP_TRUNC("
              "        `test_data.orders`.`created_at`,"
              "        month"
              "      ) AS `created_at`,"
              "      `test_data.orders`.`total` AS `total`"
              "    FROM"
              "      `test_data.orders`"
              "  ) AS `source`"
              "GROUP BY"
              "  `created_at`"
              "ORDER BY"
              "  `created_at` ASC"
              "LIMIT"
              "  3"]
             (-> (qp.compile/compile query)
                 :query
                 (->> (driver/prettify-native-form :bigquery-cloud-sdk))
                 (str/replace #"v4_test_data__transient_\d+" "test_data")
                 str/split-lines))))))
