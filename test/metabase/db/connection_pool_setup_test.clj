(ns metabase.db.connection-pool-setup-test
  (:require [clojure.test :refer :all]
            [metabase
             [connection-pool :as connection-pool]
             [test :as mt]]
            [metabase.db.connection-pool-setup :as mdb.connection-pool-setup]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest connection-pool-spec-test
  (testing "Should be able to create a connection pool"
    (letfn [(test* [spec]
              (let [{:keys [datasource], :as spec} (#'mdb.connection-pool-setup/connection-pool-spec spec)]
                (try
                  (is (instance? javax.sql.DataSource datasource))
                  (finally
                    (connection-pool/destroy-connection-pool! datasource)))))]
      (testing "from a jdbc-spec map"
        (test* {:subprotocol "h2"
                :subname     (format "mem:%s" (mt/random-name))
                :classname   "org.h2.Driver"}))
      (testing "from a connection URL"
        (test* (format "jdbc:h2:mem:%s" (mt/random-name)))))))
