(ns metabase.driver.redshift-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [metabase
             [public-settings :as pubset]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.driver.sql-jdbc.execute :as execute]
            [metabase.plugins.jdbc-proxy :as jdbc-proxy]
            [metabase.test.data.redshift :as rstest]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :plugins))
(use-fixtures :once (fixtures/initialize :db))

(deftest correct-driver-test
  (mt/test-driver
    :redshift
    (is (= "com.amazon.redshift.jdbc.Driver"
           (.getName (class (jdbc-proxy/wrapped-driver (java.sql.DriverManager/getDriver "jdbc:redshift://host:5432/testdb")))))
        "Make sure we're using the correct driver for Redshift")))

(defn- query->native [query]
  (let [native-query (atom nil)]
    (with-redefs [execute/prepared-statement (fn [_ _ sql _]
                                               (reset! native-query sql)
                                               (throw (Exception. "done")))]
      (u/ignore-exceptions
        (qp/process-query query))
      @native-query)))

(deftest remark-test
  (testing "single field user-specified value"
   (let [expected (str/replace
                   (str
                    "-- /* partner: \"metabase\", {\"dashboard_id\":null,\"chart_id\":1234,\"optional_user_id\":1000,"
                    "\"optional_account_id\":\"" (pubset/site-uuid) "\","
                    "\"filter_values\":{\"id\":[\"1\",\"2\",\"3\"]}} */"
                    " Metabase:: userID: 1000 queryType: MBQL queryHash: cb83d4f6eedc250edb0f2c16f8d9a21e5d42f322ccece1494c8ef3d634581fe2\n"
                    "SELECT \"%schema%\".\"test_data_users\".\"id\" AS \"id\","
                    " \"%schema%\".\"test_data_users\".\"name\" AS \"name\","
                    " \"%schema%\".\"test_data_users\".\"last_login\" AS \"last_login\""
                    " FROM \"%schema%\".\"test_data_users\""
                    " WHERE (\"%schema%\".\"test_data_users\".\"id\" = 1 OR \"%schema%\".\"test_data_users\".\"id\" = 2"
                    " OR \"%schema%\".\"test_data_users\".\"id\" = 3)"
                    " LIMIT 2000")
                   "%schema%" rstest/session-schema-name)]
     (mt/test-driver
      :redshift
      (is (= expected
             (query->native
              (assoc
               (mt/mbql-query users {:limit 2000})
               :parameters [{:type "id", :target ["dimension" ["field-id" (mt/id :users :id)]], :value ["1" "2" "3"]}]
               :info {:executed-by 1000
                      :card-id 1234
                      :context :ad-hoc
                      :nested? false
                      :query-hash (byte-array [-53, -125, -44, -10, -18, -36, 37, 14, -37, 15, 44, 22, -8, -39, -94, 30, 93, 66, -13, 34, -52, -20, -31, 73, 76, -114, -13, -42, 52, 88, 31, -30])})))
          "if I run a Redshift query, does it get a remark added to it?")))))

;; the extsales table is a Redshift Spectrum linked table, provided by AWS's sample data set for Redshift.
;; See https://docs.aws.amazon.com/redshift/latest/dg/c-getting-started-using-spectrum.html
;;
;; Data is loaded into S3 via:
;;
;; aws s3 cp s3://awssampledbuswest2/tickit/spectrum/sales/ s3://mb-rs-test/tickit/spectrum/sales/ --recursive
;;
;; And the Redshift table and schema is created via:
;;
;; create external schema spectrum
;; from data catalog
;; database 'spectrumdb'
;; iam_role ''
;; create external database if not exists;
;;
;; create external table spectrum.extsales(
;; salesid integer,
;; listid integer,
;; sellerid integer,
;; buyerid integer,
;; eventid integer,
;; dateid smallint,
;; qtysold smallint,
;; pricepaid decimal(8,2),
;; commission decimal(8,2),
;; saletime timestamp)
;; row format delimited
;; fields terminated by '\t'
;; stored as textfile
;; location 's3://mb-rs-test/tickit/spectrum/sales/'
;; table properties ('numRows'='172000');
;;
(deftest test-external-table
  (mt/test-driver :redshift
   (testing "expects spectrum schema to exist"
     (is (= [{:description     nil
              :table_id        (mt/id :extsales)
              :special_type    nil
              :name            "buyerid"
              :settings        nil
              :source          :fields
              :field_ref       [:field-id (mt/id :extsales :buyerid)]
              :parent_id       nil
              :id              (mt/id :extsales :buyerid)
              :visibility_type :normal
              :display_name    "Buyer ID"
              :base_type       :type/Integer}
             {:description     nil
              :table_id        (mt/id :extsales)
              :special_type    nil
              :name            "salesid"
              :settings        nil
              :source          :fields
              :field_ref       [:field-id (mt/id :extsales :salesid)]
              :parent_id       nil
              :id              (mt/id :extsales :salesid)
              :visibility_type :normal
              :display_name    "Sale Sid"
              :base_type       :type/Integer}]
            ; in different Redshift instances, the fingerprint on these
            ; columns is different.
            (map #(dissoc % :fingerprint)
                 (get-in (qp/process-query (mt/mbql-query
                                            :extsales
                                            {:limit    1
                                             :fields   [$buyerid $salesid]
                                             :order-by [[:asc $buyerid]
                                                        [:asc $salesid]]
                                             :filter   [:= [:field-id (mt/id :extsales :buyerid)] 11498]}))
                         [:data :cols])))))))

(deftest parameters-test
  (testing "Native query parameters should work with filters."
    (is (= [[693 "2015-12-29T00:00:00Z" 10 90]]
           (mt/rows
             (qp/process-query
              {:database   (mt/id)
               :type       :native
               :native     {:query         "select * from checkins where {{date}} order by date desc limit 1;"
                            :template-tags {"date" {:name         "date"
                                                    :display-name "date"
                                                    :type         :dimension
                                                    :dimension    [:field-id (mt/id :checkins :date)]}}}
               :parameters [{:type :date/all-options
                             :target [:dimension [:template-tag "date"]]
                             :value "past30years"}]}))))))
