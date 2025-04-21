(ns metabase.util.jdbc-exceptions-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.jdbc-exceptions :as sut])
  (:import
   (org.postgresql.util PSQLState)))

(set! *warn-on-reflection* true)

(deftest query-canceled?-test
  (testing "Looks throughout chain"
    (let [e (Exception. "bad" (Exception. "bad" (Exception. "bad" (java.sql.SQLTimeoutException. "timeout"))))]
      (is (sut/query-canceled? nil e))))
  (testing "recognizes snowflake exception"
    (let [e (java.sql.SQLException. "SQL execution canceled" "42S02")]
      (is (sut/query-canceled? :snowflake e))))
  (testing "recognizes postgres exception"
    (let [e (org.postgresql.util.PSQLException. "ERROR: canceling statement due to user request" PSQLState/QUERY_CANCELED)]
      (is (sut/query-canceled? :postgres e)))))
