(ns metabase.util.connection-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.connection :as u.connection])
  (:import
   (java.sql Connection DatabaseMetaData Statement)))

(set! *warn-on-reflection* true)

(defn- fake-metadata
  ^DatabaseMetaData [driver-name product-name major]
  (reify DatabaseMetaData
    (getDriverName [_] driver-name)
    (getDatabaseProductName [_] product-name)
    (getDatabaseMajorVersion [_] major)))

(defn- fake-connection
  ^Connection [driver-name product-name major]
  (reify Connection
    (getMetaData [_] (fake-metadata driver-name product-name major))))

(deftest server-rejects-query-timeout?-test
  (testing "MySQL 26+ trips the driver's version-only check and gets MariaDB syntax it cannot parse"
    (is (true? (u.connection/server-rejects-query-timeout?
                (fake-connection "MariaDB Connector/J" "MySQL" 26)))))
  (testing "a MariaDB server understands the syntax, however high its version"
    (is (false? (u.connection/server-rejects-query-timeout?
                 (fake-connection "MariaDB Connector/J" "MariaDB" 10))))
    (is (false? (u.connection/server-rejects-query-timeout?
                 (fake-connection "MariaDB Connector/J" "MariaDB" 11)))))
  (testing "MySQL below 26 stays under the driver's threshold"
    (is (false? (u.connection/server-rejects-query-timeout?
                 (fake-connection "MariaDB Connector/J" "MySQL" 8))))
    (is (false? (u.connection/server-rejects-query-timeout?
                 (fake-connection "MariaDB Connector/J" "MySQL" 9)))))
  (testing "only the MariaDB driver builds the timeout out of SQL"
    (is (false? (u.connection/server-rejects-query-timeout?
                 (fake-connection "PostgreSQL JDBC Driver" "PostgreSQL" 16)))))
  (testing "an unreadable server version is assumed to be fine"
    (is (false? (u.connection/server-rejects-query-timeout?
                 (reify Connection
                   (getMetaData [_] (throw (ex-info "no metadata" {})))))))))

(defn- recording-statement
  "A `Statement` over `conn` that records the timeouts set on it into `timeouts`."
  ^Statement [^Connection conn timeouts]
  (reify Statement
    (getConnection [_] conn)
    (setQueryTimeout [_ seconds] (swap! timeouts conj seconds))))

(deftest set-query-timeout!-test
  (testing "the timeout is set, and reported as set, when the server can take it"
    (let [timeouts (atom [])
          stmt     (recording-statement (fake-connection "MariaDB Connector/J" "MySQL" 8) timeouts)]
      (is (true? (u.connection/set-query-timeout! stmt 7)))
      (is (= [7] @timeouts))))
  (testing "on MySQL 26 the call is skipped entirely, so the caller can bound the statement itself"
    (let [timeouts (atom [])
          stmt     (recording-statement (fake-connection "MariaDB Connector/J" "MySQL" 26) timeouts)]
      (is (false? (u.connection/set-query-timeout! stmt 7)))
      (is (= [] @timeouts)))))
