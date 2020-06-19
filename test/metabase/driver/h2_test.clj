(ns metabase.driver.h2-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [models :refer [Database]]
             [query-processor :as qp]
             [test :as mt]]
            [metabase.db.spec :as db.spec]
            [metabase.driver.h2 :as h2]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.test.util :as tu]
            [metabase.util.honeysql-extensions :as hx]))

(deftest parse-connection-string-test
  (testing "Check that the functions for exploding a connection string's options work as expected"
    (is (= ["file:my-file" {"OPTION_1" "TRUE", "OPTION_2" "100", "LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON" "NICE_TRY"}]
           (#'h2/connection-string->file+options "file:my-file;OPTION_1=TRUE;OPTION_2=100;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY")))))

(deftest build-connection-string-test
  (testing "Check that we can build connection string out of parsed results"
    (is (= "file:my-file;OPTION_1=TRUE;OPTION_2=100;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY"
           (#'h2/file+options->connection-string "file:my-file" {"OPTION_1" "TRUE", "OPTION_2" "100", "LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON" "NICE_TRY"})))))

(deftest set-safe-options-test
  (testing "Check that we add safe connection options to connection strings"
    (is (= "file:my-file;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=TRUE;ACCESS_MODE_DATA=r"
           (#'h2/connection-string-set-safe-options "file:my-file;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY"))))

  (testing "Check that we override shady connection string options set by shady admins with safe ones"
    (is (= "file:my-file;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=TRUE;ACCESS_MODE_DATA=r"
           (#'h2/connection-string-set-safe-options "file:my-file;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=FALSE;ACCESS_MODE_DATA=rws")))))

(deftest db-details->user-test
  (testing "make sure we return the USER from db details if it is a keyword key in details..."
    (is (= "cam"
           (#'h2/db-details->user {:db "file:my_db.db", :USER "cam"}))))

  (testing "or a string key..."
    (is (= "cam"
           (#'h2/db-details->user {:db "file:my_db.db", "USER" "cam"}))))

  (testing "or part of the `db` connection string itself"
    (is (= "cam"
           (#'h2/db-details->user {:db "file:my_db.db;USER=cam"})))))

(deftest only-connect-to-existing-dbs-test
  (testing "Make sure we *cannot* connect to a non-existent database by default"
    (is (= ::exception-thrown
           (try (driver/can-connect? :h2 {:db (str (System/getProperty "user.dir") "/toucan_sightings")})
                (catch org.h2.jdbc.JdbcSQLException e
                  (and (re-matches #"Database .+ not found .+" (.getMessage e))
                       ::exception-thrown))))))

  (testing (str "Check that we can connect to a non-existent Database when we enable potentailly unsafe connections "
                "(e.g. to the Metabase database)")
    (binding [mdb/*allow-potentailly-unsafe-connections* true]
      (is (= true
             (boolean (driver/can-connect? :h2 {:db (str (System/getProperty "user.dir") "/pigeon_sightings")})))))))

(deftest db-timezone-id-test
  (mt/test-driver :h2
    (is (= "UTC"
           (tu/db-timezone-id)))))

(deftest disallow-admin-accounts-test
  (testing "Check that we're not allowed to run SQL against an H2 database with a non-admin account"
    (mt/with-temp Database [db {:name "Fake-H2-DB", :engine "h2", :details {:db "mem:fake-h2-db"}}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"^Running SQL queries against H2 databases using the default \(admin\) database user is forbidden\.$"
           (qp/process-query {:database (:id db)
                              :type     :native
                              :native   {:query "SELECT 1"}}))))))

(deftest add-interval-honeysql-form-test
  (testing "Should convert fractional seconds to milliseconds"
    (is (= (hsql/call :dateadd (hx/literal "millisecond") 100500 :%now)
           (sql.qp/add-interval-honeysql-form :h2 :%now 100.5 :second))))

  (testing "Non-fractional seconds should remain seconds, but be cast to longs"
    (is (= (hsql/call :dateadd (hx/literal "second") 100 :%now)
           (sql.qp/add-interval-honeysql-form :h2 :%now 100.0 :second)))))

(deftest clob-test
  (mt/test-driver :h2
    (testing "Make sure we properly handle rows that come back as `org.h2.jdbc.JdbcClob`"
      (let [results (qp/process-query (mt/native-query {:query "SELECT cast('Conchúr Tihomir' AS clob) AS name;"}))]
        (testing "rows"
          (is (= [["Conchúr Tihomir"]]
                 (mt/rows results))))
        (testing "cols"
          (is (= [{:display_name "NAME"
                   :base_type    :type/Text
                   :source       :native
                   :field_ref    [:field-literal "NAME" :type/Text]
                   :name         "NAME"}]
                 (mt/cols results))))))))

(deftest native-query-date-trunc-test
  (mt/test-driver :h2
    (testing "A native query that doesn't return a column class name metadata should work correctly (#12150)"
      (is (= [{:display_name "D"
               :base_type    :type/DateTime
               :source       :native
               :field_ref    [:field-literal "D" :type/DateTime]
               :name         "D"}]
             (mt/cols (qp/process-query (mt/native-query {:query "SELECT date_trunc('day', DATE) AS D FROM CHECKINS LIMIT 5;"}))))))))

(deftest timestamp-with-timezone-test
  (testing "Make sure TIMESTAMP WITH TIME ZONEs come back as OffsetDateTimes."
    (is (= [{:t #t "2020-05-28T18:06-07:00"}]
           (jdbc/query (db.spec/h2 {:db "mem:test_db"})
                       "SELECT TIMESTAMP WITH TIME ZONE '2020-05-28 18:06:00.000 America/Los_Angeles' AS t")))))
