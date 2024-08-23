(ns metabase.driver.athena-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.athena :as athena]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.query-processor :as qp]
   [metabase.query-processor-test.date-time-zone-functions-test :as qp-test.date-time-zone-functions-test]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(def ^:private nested-schema
  [{:col_name "key", :data_type "int"}
   {:col_name "data", :data_type "struct<name:string>"}])

(def ^:private flat-schema-columns
  [{:column_name "id", :type_name  "string"}
   {:column_name "ts", :type_name "string"}])

(deftest sync-test
  (testing "sync with nested fields"
    (with-redefs [athena/run-query (constantly nested-schema)]
      (is (= #{{:name              "key"
                :base-type         :type/Integer
                :database-type     "int"
                :database-position 0}
               {:name              "data"
                :base-type         :type/Dictionary
                :database-type     "struct"
                :nested-fields     #{{:name "name", :base-type :type/Text, :database-type "string", :database-position 1}},
                :database-position 1}}
             (#'athena/describe-table-fields-with-nested-fields "test" "test" "test")))))
  (testing "sync without nested fields"
    (is (= #{{:name "id", :base-type :type/Text, :database-type "string", :database-position 0}
             {:name "ts", :base-type :type/Text, :database-type "string", :database-position 1}}
           (#'athena/describe-table-fields-without-nested-fields :athena flat-schema-columns)))))

(deftest ^:parallel describe-table-fields-with-nested-fields-test
  (driver/with-driver :athena
    (is (= #{{:name "id",          :base-type :type/Integer, :database-type "int",    :database-position 0}
             {:name "name",        :base-type :type/Text,    :database-type "string", :database-position 1}
             {:name "category_id", :base-type :type/Integer, :database-type "int",    :database-position 2}
             {:name "latitude",    :base-type :type/Float,   :database-type "double", :database-position 3}
             {:name "longitude",   :base-type :type/Float,   :database-type "double", :database-position 4}
             {:name "price",       :base-type :type/Integer, :database-type "int",    :database-position 5}}
           (#'athena/describe-table-fields-with-nested-fields (mt/db) "test_data" "venues")))))

(deftest ^:parallel endpoint-test
  (testing "AWS Endpoint URL"
    (are [region endpoint] (= endpoint
                              (athena/endpoint-for-region region))
      "us-east-1"      ".amazonaws.com"
      "us-west-2"      ".amazonaws.com"
      "cn-north-1"     ".amazonaws.com.cn"
      "cn-northwest-1" ".amazonaws.com.cn")))

(deftest ^:parallel data-source-name-test
  (are [details expected] (= expected
                             (sql-jdbc.conn/data-source-name :athena details))
    {:catalog "birds"}                                             "birds"
    {:catalog "birds", :s3_staging_dir "s3://metabase-metabirbs/"} "birds"
    {:catalog "", :s3_staging_dir "s3://metabase-metabirbs/"}      "metabase_metabirbs_"
    {:s3_staging_dir "s3://metabase-metabirbs/"}                   "metabase_metabirbs_"
    {:s3_staging_dir "s3://metabase-metabirbs/toucans/"}           "metabase_metabirbs_toucans_"
    {:s3_staging_dir ""}                                           nil
    {}                                                             nil))

(deftest ^:parallel read-time-and-timestamp-with-time-zone-columns-test
  (mt/test-driver :athena
    (testing "We should return TIME and TIMESTAMP WITH TIME ZONE columns correctly"
      ;; these both come back as `java.sql.type/VARCHAR` for some wacko reason from the JDBC driver, so let's make sure
      ;; we have code in place to work around that.
      (let [timestamp-tz [:raw "timestamp '2022-11-16 04:21:00 US/Pacific'"]
            time         [:raw "time '5:03:00'"]
            [sql & args] (sql.qp/format-honeysql :athena {:select [[timestamp-tz :timestamp-tz]
                                                                   [time :time]]})
            _            (assert (empty? args))
            query        (-> (mt/native-query {:query sql, :params args})
                             (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (let [[ts t] (mt/first-row (qp/process-query query))]
            (is (#{#t "2022-11-16T04:21:00.000-08:00[America/Los_Angeles]"
                   #t "2022-11-16T04:21:00.000-08:00[US/Pacific]"}
                 ts))
            (is (= #t "05:03"
                   t))))))))

(deftest ^:parallel set-time-and-timestamp-with-time-zone-test
  (mt/test-driver :athena
    (testing "We should be able to handle TIME and TIMESTAMP WITH TIME ZONE parameters correctly"
      (let [timestamp-tz #t "2022-11-16T04:21:00.000-08:00[America/Los_Angeles]"
            time         #t "05:03"
            [sql & args] (sql.qp/format-honeysql :athena {:select [[timestamp-tz :timestamp-tz]
                                                                   [time :time]]})
            _            (assert (empty? args))
            query        (-> (mt/native-query {:query sql, :params args})
                             (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [#t "2022-11-16T04:21:00.000-08:00[America/Los_Angeles]" #t "05:03"]
                 (mt/first-row (qp/process-query query)))))))))

(deftest ^:parallel add-interval-to-timestamp-with-time-zone-test
  (mt/test-driver :athena
    (testing "Should be able to use `add-interval-honeysql-form` on a timestamp with time zone (https://github.com/dacort/metabase-athena-driver/issues/115)"
      ;; Even tho Athena doesn't let you store a TIMESTAMP WITH TIME ZONE, you can still use it as a literal...
      ;;
      ;; apparently you can't cast a TIMESTAMP WITH TIME ZONE to a regular TIMESTAMP. So make sure we're not trying to
      ;; do that cast. This only applies to Athena v3! I think we're currently testing against v2. When we upgrade this
      ;; should ensure things continue to work.
      (let [literal      [:raw "timestamp '2022-11-16 04:21:00 US/Pacific'"]
            [sql & args] (sql.qp/format-honeysql :athena
                                                 {:select [[(sql.qp/add-interval-honeysql-form :athena literal 1 :day)
                                                            :t]]})
            query        (mt/native-query {:query sql, :params args})]
        (mt/with-native-query-testing-context query
          (is (= ["2022-11-17T12:21:00Z"]
                 (mt/first-row (qp/process-query query)))))))))

(deftest hard-coded-iam-credential-handling
  (testing "When not hosted"
    (with-redefs [premium-features/is-hosted? (constantly false)]
      (testing "Specifying access-key will not use credential chain"
        (is (not (contains?
                  (sql-jdbc.conn/connection-details->spec :athena {:region "us-west-2" :access_key "abc123"})
                  :AwsCredentialsProviderClass))))
      (testing "Not specifying access-key will use credential chain"
        (is (contains?
             (sql-jdbc.conn/connection-details->spec :athena {:region "us-west-2"})
             :AwsCredentialsProviderClass)))))
  (testing "When hosted"
    (with-redefs [premium-features/is-hosted? (constantly true)]
      (testing "Specifying access-key will not use credential chain"
        (is (not (contains?
                  (sql-jdbc.conn/connection-details->spec :athena {:region "us-west-2" :access_key "abc123"})
                  :AwsCredentialsProviderClass))))
      (testing "Not specifying access-key will still not use credential chain"
        (is (not (contains?
                  (sql-jdbc.conn/connection-details->spec :athena {:region "us-west-2"})
                  :AwsCredentialsProviderClass)))))))

(deftest ^:parallel page-test
  (testing ":page clause places OFFSET *before* LIMIT"
    (is (= [["SELECT"
             "  \"default\".\"categories\".\"id\" AS \"id\""
             "FROM"
             "  \"default\".\"categories\""
             "ORDER BY"
             "  \"default\".\"categories\".\"id\" ASC OFFSET 10"
             "LIMIT"
             "  5"]]
           (-> (sql.qp/format-honeysql :athena
                                       (sql.qp/apply-top-level-clause :athena :page
                                                                      {:select   [[:default.categories.id "id"]]
                                                                       :from     [:default.categories]
                                                                       :order-by [[:default.categories.id :asc]]}
                                                                      {:page {:page  3
                                                                              :items 5}}))
               (update 0 #(str/split-lines (driver/prettify-native-form :athena %))))))))

(defn- query->native! [query]
  (let [check-sql-fn (fn [_driver _conn sql _params _canceled-chan]
                       (throw (ex-info "DONE" {:sql sql})))]
    (with-redefs [sql-jdbc.execute/statement-or-prepared-statement check-sql-fn]
      (try
        (qp/process-query query)
        (catch Throwable e
          (or (-> e ex-data :sql)
              e))))))

;; TODO: If we are extending remove remark functionality to other drivers, we should consider making this
;;       test (1) general, so other drivers can use it and (2) parallel. That would require making
;;       `sql-jdbc.execute/statement-or-prepared-statement` dynamic so it can be temporarily modified using `binding`
;;       instead of `with-redefs` in [[query->native!]].
;; TODO: If that is the case, also the solution should be generalized, taking into account existing functionality
;;       for removing remark in other drivers, eg. bigquery. Generalization could be accomplished with help
;;       of [[metabase.driver.sql-jdbc.execute/inject-remark]].
(deftest remove-remark-test
  (mt/test-driver
    :athena
    (let [mock-provider
          (fn [should-include-hash?]
            (let [db (merge meta/database
                            {:id      1
                             :engine  :athena
                             :details (merge (:details (mt/db))
                                             {:include-user-id-and-hash should-include-hash?})})]
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
                                   :base_type :type/Text})]})))
          query {:database 1
                 :type     :query
                 :query    {:source-table 1
                            :limit        1}
                 :info     {:executed-by 1000
                            :query-hash  (byte-array [1 2 3 4])}}]
      (testing "Baseline: Query strarts with remark"
        (mt/with-metadata-provider (mock-provider true)
          (let [result (query->native! query)]
            (is (string? result))
            (is (str/starts-with? result "-- Metabase::")))))
      (testing "Query starts with select instead of a remark"
        (mt/with-metadata-provider (mock-provider false)
          (let [result (query->native! query)]
            (is (string? result))
            (is (str/starts-with? result "SELECT"))))))))

(deftest describe-table-works-without-get-table-metadata-permission-test
  (testing "`describe-table` works if the AWS user's IAM policy doesn't include athena:GetTableMetadata permissions")
  (mt/test-driver :athena
    (mt/dataset airports
      (let [catalog "AwsDataCatalog" ; The bug only happens when :catalog is not nil
            details (assoc (:details (mt/db))
                             ;; these credentials are for a user that doesn't have athena:GetTableMetadata permissions
                           :access_key (tx/db-test-env-var-or-throw :athena :without-get-table-metadata-access-key)
                           :secret_key (tx/db-test-env-var-or-throw :athena :without-get-table-metadata-secret-key)
                           :catalog catalog)]
        (mt/with-temp [:model/Database db {:engine :athena, :details details}]
          (sync/sync-database! db {:scan :schema})
          (let [table (t2/select-one :model/Table :db_id (:id db) :name "airport")]
            (testing "Check that .getColumns returns no results, meaning the athena JDBC driver still has a bug"
                ;; If this test fails and .getColumns returns results, the athena JDBC driver has been fixed and we can
                ;; undo the changes in https://github.com/metabase/metabase/pull/44032
              (is (empty? (sql-jdbc.execute/do-with-connection-with-options
                           :athena
                           db
                           nil
                           (fn [^Connection conn]
                             (let [metadata (.getMetaData conn)]
                               (with-open [rs (.getColumns metadata catalog (:schema table) (:name table) nil)]
                                 (jdbc/metadata-result rs))))))))
            (testing "`describe-table` returns the fields anyway"
              (is (not-empty (:fields (driver/describe-table :athena db table)))))))))))

(deftest column-name-with-question-mark-test
  (testing "Column name with a question mark in it should be compiled correctly (#44915)"
    (mt/test-driver :athena
      (let [metadata-provider (lib.tu/merged-mock-metadata-provider meta/metadata-provider {:fields [{:id   (meta/id :venues :name)
                                                                                                      :name "name?"}]})
            query             (-> (lib/query metadata-provider (meta/table-metadata :venues))
                                  (lib/with-fields [(meta/field-metadata :venues :name)])
                                  (lib/filter (lib/= (meta/field-metadata :venues :name) "BBQ"))
                                  (lib/limit 1))
            executed-query    (atom nil)]
        (with-redefs [sql-jdbc.execute/execute-reducible-query (let [orig sql-jdbc.execute/execute-reducible-query]
                                                                 (fn [driver query context respond]
                                                                   (reset! executed-query query)
                                                                   (orig driver query context respond)))]
          (try
            (qp/process-query query)
            (catch Throwable _))
          (is (= {:query ["SELECT"
                          "  \"PUBLIC\".\"VENUES\".\"name?\" AS \"name?\""
                          "FROM"
                          "  \"PUBLIC\".\"VENUES\""
                          "WHERE"
                          "  \"PUBLIC\".\"VENUES\".\"name?\" = 'BBQ'"
                          "LIMIT"
                          "  1"]
                  :params nil}
                 (-> @executed-query
                     :native
                     (update :query #(str/split-lines (driver/prettify-native-form :athena %)))))))))))

;;; Athena version of [[metabase.query-processor-test.date-time-zone-functions-test/datetime-diff-mixed-types-test]]
(deftest datetime-diff-mixed-types-test
  (mt/test-driver :athena
    (testing "datetime-diff can compare `date`, `timestamp`, and `timestamp with time zone` args with Athena"
      (mt/with-temp [:model/Card card (qp.test-util/card-with-source-metadata-for-query
                                       (mt/native-query {:query (str "select"
                                                                     " date '2022-01-01' as d,"
                                                                     " timestamp '2022-01-01 00:00:00.000' as dt,"
                                                                     " with_timezone(timestamp '2022-01-01 00:00:00.000', 'Africa/Lagos') as dt_tz")}))]
        (let [d       [:field "d" {:base-type :type/Date}]
              dt      [:field "dt" {:base-type :type/DateTime}]
              dt_tz   [:field "dt_tz" {:base-type :type/DateTimeWithZoneID}]
              results (mt/process-query
                       {:database (mt/id)
                        :type     :query
                        :query    {:fields   [[:expression "tz,dt"]
                                              [:expression "tz,d"]]
                                   :expressions
                                   {"tz,dt" [:datetime-diff dt_tz dt :second]
                                    "tz,d"  [:datetime-diff dt_tz d :second]}
                                   :source-table (str "card__" (u/the-id card))}})]
          (is (= [3600 3600]
                 (->> results
                      (mt/formatted-rows [int int])
                      first))))))))

;;; Athena version of [[metabase.query-processor-test.date-time-zone-functions-test/datetime-diff-time-zones-test]]
(mt/defdataset diff-time-zones-athena-cases
  ;; This dataset contains the same set of values as [[diff-time-zones-cases]], but without the time zones.
  ;; It is needed to test `datetime-diff` with Athena, since Athena supports `timestamp with time zone`
  ;; in query expressions but not in a table. [[diff-time-zones-athena-cases-query]] uses this dataset
  ;; to recreate [[diff-time-zones-cases]] for Athena as a query.
  [["times"
    [{:field-name "dt",      :base-type :type/DateTime}
     {:field-name "dt_text", :base-type :type/Text}]
    (for [dt [#t "2022-10-02T00:00:00"
              #t "2022-10-02T01:00:00"
              #t "2022-10-03T00:00:00"
              #t "2022-10-09T00:00:00"
              #t "2022-11-02T00:00:00"
              #t "2023-01-02T00:00:00"
              #t "2023-10-02T00:00:00"]]
      [dt (u.date/format dt)])]])

(def ^:private diff-time-zones-athena-cases-query
  ;; This query recreates [[diff-time-zones-cases]] for Athena from [[diff-time-zones-athena-cases]].
  "with x as (
     select
     with_timezone(dt, 'UTC') as dt
     , concat(dt_text, 'Z') as dt_text -- e.g. 2022-10-02T00:00:00Z
     , 'UTC' as time_zone
   from diff_time_zones_athena_cases.times
   union
   select
     with_timezone(dt, 'Africa/Lagos') as dt
     , concat(dt_text, '+01:00') as dt_text -- e.g. 2022-10-02T00:00:00+01:00
     , 'Africa/Lagos' as time_zone
   from diff_time_zones_athena_cases.times
   )
   select
     a.dt as a_dt_tz
     , a.dt_text as a_dt_tz_text
     , b.dt as b_dt_tz
     , b.dt_text as b_dt_tz_text
   from x a
   join x b on a.dt < b.dt and a.time_zone <> b.time_zone")

(deftest datetime-diff-time-zones-test
  ;; Athena needs special treatment. It supports the `timestamp with time zone` type in query expressions
  ;; but not at rest. Here we create a native query that returns a `timestamp with time zone` type and then
  ;; run another query with `datetime-diff` against it.
  (mt/test-driver :athena
    (mt/dataset diff-time-zones-athena-cases
      (mt/with-temp [:model/Card card (qp.test-util/card-with-source-metadata-for-query
                                       (mt/native-query {:query diff-time-zones-athena-cases-query}))]
        (let [diffs
              (fn [a-str b-str]
                (let [units   [:second :minute :hour :day :week :month :quarter :year]
                      results (mt/process-query
                               {:database (mt/id)
                                :type     :query
                                :query    {:filter [:and
                                                    [:= a-str [:field "a_dt_tz_text" {:base-type :type/DateTime}]]
                                                    [:= b-str [:field "b_dt_tz_text" {:base-type :type/DateTime}]]]
                                           :expressions  (into {}
                                                               (for [unit units]
                                                                 [(name unit) [:datetime-diff
                                                                               [:field "a_dt_tz" {:base-type :type/DateTime}]
                                                                               [:field "b_dt_tz" {:base-type :type/DateTime}]
                                                                               unit]]))
                                           :fields       (into [] (for [unit units]
                                                                    [:expression (name unit)]))
                                           :source-table (str "card__" (u/the-id card))}})]
                  (->> results
                       (mt/formatted-rows (repeat (count units) int))
                       first
                       (zipmap units))))]
          (qp-test.date-time-zone-functions-test/run-datetime-diff-time-zone-tests! diffs))))))
