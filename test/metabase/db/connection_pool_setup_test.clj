(ns metabase.db.connection-pool-setup-test
  (:require [clojure.test :refer :all]
            [metabase.connection-pool :as connection-pool]
            [metabase.db.connection-pool-setup :as mdb.connection-pool-setup]))

(deftest create-connection-pool!-test
  (testing "Should be able to create a connection pool"
    (letfn [(test* [spec]
              (let [{:keys [datasource]} (mdb.connection-pool-setup/create-connection-pool! :h2 spec)]
                (try
                  (is (instance? javax.sql.DataSource datasource))
                  (finally
                    (connection-pool/destroy-connection-pool! datasource)))))]
      (testing "from a jdbc-spec map"
        (test* {:subprotocol "h2"
                :subname     "mem:test-db"
                :classname   "org.h2.Driver"}))
      (testing "from a connection URL"
        (test* "jdbc:h2:mem:test-db-2")))))
