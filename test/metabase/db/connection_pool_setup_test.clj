(ns metabase.db.connection-pool-setup-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase
             [connection-pool :as connection-pool]
             [test :as mt]]
            [metabase.db.connection-pool-setup :as mdb.connection-pool-setup]))

(deftest connection-pool-spec-test
  (testing "Should be able to create a connection pool"
    (letfn [(test* [spec]
              (let [{:keys [datasource], :as spec} (#'mdb.connection-pool-setup/connection-pool-spec spec)]
                (try
                  (is (instance? javax.sql.DataSource datasource))
                  (is (= [{:one 1}]
                         (jdbc/query spec ["SELECT 1 AS one;"])))
                  (finally
                    (connection-pool/destroy-connection-pool! datasource)))))]
      (testing "from a jdbc-spec map"
        (test* {:subprotocol "h2"
                :subname     (format "mem:%s;DB_CLOSE_DELAY=10" (mt/random-name))
                :classname   "org.h2.Driver"}))
      (testing "from a connection URL"
        (test* (format "jdbc:h2:mem:%s;DB_CLOSE_DELAY=10" (mt/random-name)))))))
