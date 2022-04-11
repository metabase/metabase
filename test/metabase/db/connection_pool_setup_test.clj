(ns metabase.db.connection-pool-setup-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase.connection-pool :as connection-pool]
            [metabase.db.connection-pool-setup :as mdb.connection-pool-setup]
            [metabase.db.data-source :as mdb.data-source]
            [metabase.test :as mt])
  (:import com.mchange.v2.c3p0.PoolBackedDataSource))

(deftest connection-pool-spec-test
  (testing "Should be able to create a connection pool"
    (letfn [(test* [db-type data-source]
              (let [^PoolBackedDataSource data-source (mdb.connection-pool-setup/connection-pool-data-source db-type data-source)]
                (try
                  (is (instance? javax.sql.DataSource data-source))
                  (is (= (format "metabase-%s-app-db" (name db-type))
                         (.getDataSourceName data-source)))
                  (is (= [{:one 1}]
                         (jdbc/query {:datasource data-source} ["SELECT 1 AS one;"])))
                  (finally
                    (connection-pool/destroy-connection-pool! data-source)))))]
      (testing "from a jdbc-spec map"
        (test* :h2 (mdb.data-source/broken-out-details->DataSource
                    :h2
                    {:subprotocol "h2"
                     :subname     (format "mem:%s;DB_CLOSE_DELAY=10" (mt/random-name))
                     :classname   "org.h2.Driver"})))
      (testing "from a connection URL"
        (test* :h2 (mdb.data-source/raw-connection-string->DataSource
                    (format "jdbc:h2:mem:%s;DB_CLOSE_DELAY=10" (mt/random-name))))))))
