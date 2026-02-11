(ns metabase.driver.connection-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.connection :as driver.conn]))

(deftest effective-details-default-test
  (testing "effective-details returns :details when *connection-type* is :default"
    (let [database {:details {:host "read-host" :port 5432}
                    :write-data-details {:host "write-host" :port 5432}}]
      (is (= {:host "read-host" :port 5432}
             (driver.conn/effective-details database))))))

(deftest effective-details-write-with-write-details-test
  (testing "effective-details returns write_data_details when :write-data and details exist"
    (testing "with kebab-case key (API/SnakeHatingMap style)"
      (let [database {:details {:host "read-host" :port 5432}
                      :write-data-details {:host "write-host" :port 5432}}]
        (driver.conn/with-write-connection
          (is (= {:host "write-host" :port 5432}
                 (driver.conn/effective-details database))))))
    (testing "with snake_case key (toucan2 instance style)"
      (let [database {:details {:host "read-host" :port 5432}
                      :write_data_details {:host "write-host" :port 5432}}]
        (driver.conn/with-write-connection
          (is (= {:host "write-host" :port 5432}
                 (driver.conn/effective-details database))))))))

(deftest effective-details-write-fallback-test
  (testing "effective-details falls back to :details when :write-data but no write details"
    (let [database {:details {:host "read-host" :port 5432}
                    :write-data-details nil}]
      (driver.conn/with-write-connection
        (is (= {:host "read-host" :port 5432}
               (driver.conn/effective-details database)))))
    (testing "also when :write_data_details key is missing entirely"
      (let [database {:details {:host "read-host" :port 5432}}]
        (driver.conn/with-write-connection
          (is (= {:host "read-host" :port 5432}
                 (driver.conn/effective-details database))))))))

(deftest with-write-connection-binding-test
  (testing "with-write-connection binds *connection-type* to :write-data"
    (is (= :default driver.conn/*connection-type*))
    (driver.conn/with-write-connection
      (is (= :write-data driver.conn/*connection-type*)))
    (is (= :default driver.conn/*connection-type*))))

(deftest write-connection?-test
  (testing "write-connection? returns false by default"
    (is (false? (driver.conn/write-connection?))))
  (testing "write-connection? returns true inside with-write-connection"
    (driver.conn/with-write-connection
      (is (true? (driver.conn/write-connection?))))))

(deftest nested-binding-test
  (testing "nested with-write-connection works correctly"
    (is (= :default driver.conn/*connection-type*))
    (driver.conn/with-write-connection
      (is (= :write-data driver.conn/*connection-type*))
      ;; nested binding (unusual but should work)
      (binding [driver.conn/*connection-type* :default]
        (is (= :default driver.conn/*connection-type*)))
      (is (= :write-data driver.conn/*connection-type*)))
    (is (= :default driver.conn/*connection-type*))))


