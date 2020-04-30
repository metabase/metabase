(ns metabase.driver.redshift-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.driver.sql-jdbc.execute :as execute]
            [metabase.plugins.jdbc-proxy :as jdbc-proxy]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.test.data.datasets :refer [expect-with-driver]]
            [metabase.test.data.redshift :as rstest]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

(use-fixtures :once (fixtures/initialize :plugins))

(expect-with-driver :redshift
  "UTC"
  (tu/db-timezone-id))

(deftest correct-driver-test
  (is (= "com.amazon.redshift.jdbc.Driver"
         (.getName (class (jdbc-proxy/wrapped-driver (java.sql.DriverManager/getDriver "jdbc:redshift://host:5432/testdb")))))
      "Make sure we're using the correct driver for Redshift"))

(defn- query->native [query]
  (let [native-query (atom nil)]
    (with-redefs [execute/prepared-statement (fn [_ _ sql _]
                                               (reset! native-query sql)
                                               (throw (Exception. "done")))]
      (u/ignore-exceptions
       (qp/process-query {:database (mt/id)
                          :type     :query
                          :query    {:source-table (mt/id :venues)
                                     :limit        1}
                          :info     {:executed-by 1000
                                     :query-hash  (byte-array [1 2 3 4])}}))
      @native-query)))

;; TODO: Add executed-by and card-id and such to this
(deftest remark-test
  (let [expected (str/replace
                  (str
                   "-- /* partner: \"metabase\", {\"dashboard_id\":null,\"chart_id\":null,\"optional_user_id\":1000,\"filter_values\":{}} */"
                   " Metabase:: userID: 1000 queryType: MBQL queryHash: 01020304\n"
                   "SELECT \"%schema%\".\"test_data_venues\".\"id\" AS \"id\","
                   " \"%schema%\".\"test_data_venues\".\"name\" AS \"name\","
                   " \"%schema%\".\"test_data_venues\".\"category_id\" AS \"category_id\","
                   " \"%schema%\".\"test_data_venues\".\"latitude\" AS \"latitude\","
                   " \"%schema%\".\"test_data_venues\".\"longitude\" AS \"longitude\","
                   " \"%schema%\".\"test_data_venues\".\"price\" AS \"price\""
                   " FROM \"%schema%\".\"test_data_venues\""
                   " LIMIT 1")
                  "%schema%" rstest/session-schema-name)]
   (mt/test-driver
    :redshift
    (is (= expected
           (query->native
            {:database (mt/id)
             :type     :query
             :query    {:source-table (mt/id :venues)
                        :limit        1}
             :info     {:executed-by 1000
                        :query-hash  (byte-array [1 2 3 4])}}))
        "if I run a Redshift query, does it get a remark added to it?"))))