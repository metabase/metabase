(ns metabase.driver.mongo.database-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.mongo.database :as mongo.db]))

(deftest ^:parallel fqdn?-test
  (testing "test hostname is fqdn"
    (is (true? (#'mongo.db/fqdn? "db.mongo.com")))
    (is (true? (#'mongo.db/fqdn? "replica-01.db.mongo.com")))
    (is (false? (#'mongo.db/fqdn? "localhost")))
    (is (false? (#'mongo.db/fqdn? "localhost.localdomain")))))

(deftest ^:parallel db-name-test
  (testing "`dbname` is in db-details"
    (is (= "some_db"
           (mongo.db/db-name {:dbname "some_db"}))))
  (testing "`dbname` is encoded in conn-uri"
    (is (= "some_db"
           (mongo.db/db-name {:conn-uri "mongodb://localhost/some_db"})))))

(deftest ^:parallel details-normalized-respects-connection-type-test
  (testing "Mongo's details-normalized uses effective-details for the Lib metadata of a database"
    (let [read-details  {:dbname "test-db" :host "read-host"}
          write-details {:dbname "test-db" :host "write-host"}
          database      {:lib/type           :metadata/database
                         :id                 1
                         :details            read-details
                         :write-data-details write-details}]
      (testing "default connection type uses :details"
        (let [result (mongo.db/details-normalized database)]
          (is (= "read-host" (:host result)))))
      (testing "write connection type uses :write_data_details"
        (driver.conn/with-write-connection
          (let [result (mongo.db/details-normalized database)]
            (is (= "write-host" (:host result))))))))
  (testing "Mongo's details-normalized falls back to :details when no write details"
    (let [read-details {:dbname "test-db" :host "read-host"}
          database     {:lib/type :metadata/database
                        :id       1
                        :details  read-details}]
      (driver.conn/with-write-connection
        (let [result (mongo.db/details-normalized database)]
          (is (= "read-host" (:host result))))))))

(deftest ^:parallel details-normalized-conn-uri-respects-connection-type-test
  (testing "Mongo's details-normalized uses effective-details for conn-uri databases"
    (let [read-details  {:conn-uri "mongodb://read-host:27017/test-db"}
          write-details {:conn-uri "mongodb://write-host:27017/test-db"}
          database      {:lib/type           :metadata/database
                         :id                 1
                         :details            read-details
                         :write-data-details write-details}]
      (testing "default connection type uses :details"
        (let [result (mongo.db/details-normalized database)]
          (is (= "mongodb://read-host:27017/test-db" (:conn-uri result)))))
      (testing "write connection type uses :write_data_details"
        (driver.conn/with-write-connection
          (let [result (mongo.db/details-normalized database)]
            (is (= "mongodb://write-host:27017/test-db" (:conn-uri result)))))))))
