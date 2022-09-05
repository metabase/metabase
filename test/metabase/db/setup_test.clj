(ns metabase.db.setup-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase.db.data-source :as mdb.data-source]
            [metabase.db.setup :as mdb.setup]
            [metabase.test :as mt]))

(deftest verify-db-connection-test
  (testing "Should be able to verify a DB connection"
    (testing "from a jdbc-spec map"
      (#'mdb.setup/verify-db-connection :h2 (mdb.data-source/broken-out-details->DataSource
                                             :h2
                                             {:subprotocol "h2"
                                              :subname     (format "mem:%s" (mt/random-name))
                                              :classname   "org.h2.Driver"})))
    (testing "from a connection URL"
      (#'mdb.setup/verify-db-connection :h2 (mdb.data-source/raw-connection-string->DataSource
                                             (format "jdbc:h2:mem:%s" (mt/random-name)))))))

(deftest setup-db-test
  (testing "Should be able to set up an arbitrary application DB"
    (letfn [(test* [data-source]
              (is (= :done
                     (mdb.setup/setup-db! :h2 data-source true)))
              (is (= ["Administrators" "All Users"]
                     (mapv :name (jdbc/query {:datasource data-source}
                                             "SELECT name FROM permissions_group ORDER BY name ASC;")))))]
      (let [subname (format "mem:%s;DB_CLOSE_DELAY=10" (mt/random-name))]
        (testing "from a jdbc-spec map"
          (test* (mdb.data-source/broken-out-details->DataSource
                  :h2
                  {:subprotocol "h2"
                   :subname     subname
                   :classname   "org.h2.Driver"})))
        (testing "from a connection URL"
          (test* (mdb.data-source/raw-connection-string->DataSource
                  (str "jdbc:h2:" subname))))))))
