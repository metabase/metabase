(ns metabase.driver.athena-test
  (:require
   [clojure.test :refer :all]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [honeysql.format :as hformat]
   [metabase.driver :as driver]
   [metabase.driver.athena :as athena]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.util.honeysql-extensions :as hx]))

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

(deftest describe-table-fields-with-nested-fields-test
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

(deftest read-time-and-timestamp-with-time-zone-columns-test
  (mt/test-driver :athena
    (testing "We should return TIME and TIMESTAMP WITH TIME ZONE columns correctly"
      ;; these both come back as `java.sql.type/VARCHAR` for some wacko reason from the JDBC driver, so let's make sure
      ;; we have code in place to work around that.
      (let [timestamp-tz (hx/raw "timestamp '2022-11-16 04:21:00 US/Pacific'")
            time         (hx/raw "time '5:03:00'")
            [sql & args] (hformat/format {:select [[timestamp-tz :timestamp-tz]
                                                   [time :time]]})
            query        (-> (mt/native-query {:query sql, :params args})
                             (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [#t "2022-11-16T04:21:00.000-08:00[America/Los_Angeles]" #t "05:03"]
                 (mt/first-row (qp/process-query query)))))))))

(deftest set-time-and-timestamp-with-time-zone-test
  (mt/test-driver :athena
    (testing "We should be able to handle TIME and TIMESTAMP WITH TIME ZONE parameters correctly"
      (let [timestamp-tz #t "2022-11-16T04:21:00.000-08:00[America/Los_Angeles]"
            time         #t "05:03"
            [sql & args] (hformat/format {:select [[timestamp-tz :timestamp-tz]
                                                   [time :time]]})
            query        (-> (mt/native-query {:query sql, :params args})
                             (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [#t "2022-11-16T04:21:00.000-08:00[America/Los_Angeles]" #t "05:03"]
                 (mt/first-row (qp/process-query query)))))))))

(deftest add-interval-to-timestamp-with-time-zone-test
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

(deftest page-test
  (testing ":page clause places OFFSET *before* LIMIT"
    (is (= [(str "SELECT \"default\".\"categories\".\"id\" AS \"id\""
                 " FROM \"default\".\"categories\""
                 " ORDER BY \"default\".\"categories\".\"id\" ASC"
                 " OFFSET ? LIMIT ?") 10 5]
           (sql.qp/format-honeysql :athena
             (sql.qp/apply-top-level-clause :athena :page
                                            {:select   [[:default.categories.id "id"]]
                                             :from     [:default.categories]
                                             :order-by [[:default.categories.id :asc]]}
                                            {:page {:page  3
                                                    :items 5}}))))))
