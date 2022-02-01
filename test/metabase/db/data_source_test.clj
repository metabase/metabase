(ns metabase.db.data-source-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase.db.data-source :as mdb.data-source]
            [metabase.test :as mt]))

(deftest broken-out-details-test
  (let [data-source (mdb.data-source/broken-out-details->DataSource
                     :h2
                     {:subprotocol "h2"
                      :db          (format "mem:%s" (mt/random-name))
                      :classname   "org.h2.Driver"})]
    (with-open [conn (.getConnection data-source)]
      (is (= [{:one 1}]
             (jdbc/query {:connection conn} "SELECT 1 AS one;"))))))

(deftest connection-string-test
  (let [data-source (mdb.data-source/raw-connection-string->DataSource
                     (format "jdbc:h2:mem:%s" (mt/random-name)))]
    (with-open [conn (.getConnection data-source)]
      (is (= [{:one 1}]
             (jdbc/query {:connection conn} "SELECT 1 AS one;")))))

  (testing "Without jdbc: at the beginning"
    (let [db-name     (mt/random-name)
          data-source (mdb.data-source/raw-connection-string->DataSource
                       (format "h2:mem:%s" db-name))]
      (is (= (mdb.data-source/raw-connection-string->DataSource (str "jdbc:h2:mem:" db-name))
             data-source))
      (with-open [conn (.getConnection data-source)]
        (is (= [{:one 1}]
               (jdbc/query {:connection conn} "SELECT 1 AS one;"))))))

  (testing "Accept `postgres` as a subprotocol (I think Heroku or whatever does this to screw with us)"
    (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:postgresql:localhost:5432/metabase")
           (mdb.data-source/raw-connection-string->DataSource "postgres:localhost:5432/metabase")))))

(deftest equality-test
  (testing "Two DataSources with the same URL should be equal"
    (is (= (mdb.data-source/raw-connection-string->DataSource "ABCD")
           (mdb.data-source/raw-connection-string->DataSource "ABCD"))))

  (testing "Two DataSources with the same URL and properties should be equal"
    (is (= (mdb.data-source/broken-out-details->DataSource :h2 {:db "wow", :x 1})
           (mdb.data-source/broken-out-details->DataSource :h2 {:db "wow", :x 1})))))
