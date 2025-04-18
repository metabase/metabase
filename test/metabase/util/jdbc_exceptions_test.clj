(ns metabase.util.jdbc-exceptions-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.jdbc-exceptions :as sut])
  (:import
   (org.postgresql.util PSQLState)))

(set! *warn-on-reflection* true)

(defmacro ^:private when-class
  ^{:clj-kondo/lint-as :when}
  [k & body]
  (let [resolved? (try (Class/forName (str k))
                       true
                       (catch ClassNotFoundException _ false))]
    (when resolved?
      `(do ~@body))))

(deftest query-canceled?-test
  (testing "Looks throughout chain"
    (let [e (Exception. "bad" (Exception. "bad" (Exception. "bad" (java.sql.SQLTimeoutException. "timeout"))))]
      (is (sut/query-canceled? nil e))))
  (when-class net.snowflake.client.jdbc.SnowflakeSQLException
              (testing "recognizes snowflake exception"
                (let [e (net.snowflake.client.jdbc.SnowflakeSQLException. "SQL execution canceled" "200003")]
                  (is (sut/query-canceled? :snowflake e)))
                (let [e (net.snowflake.client.jdbc.SnowflakeSQLException. "SQL execution canceled" "200005")]
                  (is (sut/query-canceled? :snowflake e)))))
  (when-class org.postgresql.util.PSQLException
              (testing "recognizes postgres exception"
                (let [e (org.postgresql.util.PSQLException. "ERROR: canceling statement due to user request" PSQLState/QUERY_CANCELED)]
                  (is (sut/query-canceled? :postgres e))))))
