(ns metabase.db.connection-pool-setup-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase
             [connection-pool :as connection-pool]
             [test :as mt]]
            [metabase.db.connection-pool-setup :as mdb.connection-pool-setup])
  (:import com.mchange.v2.c3p0.PoolBackedDataSource))

(deftest connection-pool-spec-test
  (testing "Should be able to create a connection pool"
    (letfn [(test* [db-type spec]
              (let [conn-pool-spec (#'mdb.connection-pool-setup/connection-pool-spec db-type spec)
                    {:keys [^PoolBackedDataSource datasource], :as spec} conn-pool-spec]
                (try
                  (is (instance? javax.sql.DataSource datasource))
                  (is (= (format "metabase-%s-app-db" (name db-type))
                         (.getDataSourceName datasource)))
                  (is (= [{:one 1}]
                         (jdbc/query spec ["SELECT 1 AS one;"])))
                  (finally
                    (connection-pool/destroy-connection-pool! datasource)))))]
      (testing "from a jdbc-spec map"
        (test* :h2 {:subprotocol "h2"
                    :subname     (format "mem:%s;DB_CLOSE_DELAY=10" (mt/random-name))
                    :classname   "org.h2.Driver"}))
      (testing "from a connection URL"
        (test* :h2 (format "jdbc:h2:mem:%s;DB_CLOSE_DELAY=10" (mt/random-name)))))))
