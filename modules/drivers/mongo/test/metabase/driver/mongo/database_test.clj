(ns metabase.driver.mongo.database-test
  (:require
   [clojure.test :refer :all]
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
