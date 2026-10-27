(ns metabase.driver.connection-test
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.driver.connection :as driver.conn]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment =?/keep-me)

(deftest effective-details-default-test
  (testing "effective-details returns :details when *connection-type* is :default"
    (let [details            {:host "read-host" :port 5432}
          write-data-details {:host "write-host" :port 5432}
          database           {:lib/type           :metadata/database
                              :id                 1
                              :details            details
                              :write-data-details write-data-details}]
      (is (=? details
              (driver.conn/effective-details database))))))

(deftest effective-details-write-with-write-details-test
  (mt/when-ee-evailable
   (mt/with-premium-features #{:writable-connection}
     (let [details            {:host "read-host" :port 5432}
           write-data-details {:host "write-host" :port 5432}]
       (testing "effective-details returns write_data_details when :write-data and details exist"
         (testing "with kebab-case key (Lib metadata style)"
           (let [database {:lib/type           :metadata/database
                           :id                 1
                           :details            details
                           :write-data-details write-data-details}]
             (driver.conn/with-write-connection
               (is (=? write-data-details
                       (driver.conn/effective-details database)))))))))))

(deftest effective-details-write-fallback-test
  (mt/with-premium-features #{:writable-connection}
    (let [details {:host "read-host" :port 5432}]
      (testing "effective-details falls back to :details when :write-data but no write details"
        (let [database {:lib/type :metadata/database
                        :id 1
                        :details details
                        :write-data-details nil}]
          (driver.conn/with-write-connection
            (is (=? details
                    (driver.conn/effective-details database)))))
        (testing "also when :write_data_details key is missing entirely"
          (let [database {:lib/type :metadata/database
                          :id 1
                          :details details}]
            (driver.conn/with-write-connection
              (is (=? details
                      (driver.conn/effective-details database))))))))))

(deftest effective-details-write-without-feature-test
  (testing "without :writable-connection feature, with-write-connection falls back to main connection details"
    (mt/with-premium-features #{}
      (let [details            {:host "read-host" :port 5432}
            write-data-details {:host "write-host" :port 5432}
            database           {:lib/type           :metadata/database
                                :id                 1
                                :details            details
                                :write-data-details write-data-details}]
        (driver.conn/with-write-connection
          (is (=? details
                  (driver.conn/effective-details database))))))))

(deftest effective-details-refuses-database-instance-test
  (testing "effective-details takes only the Lib metadata of a Database, so a Database instance fails fast"
    (is (thrown? clojure.lang.ExceptionInfo
                 (driver.conn/effective-details (t2/select-one :model/Database (mt/id)))))))

(deftest connection-telemetry-info-test
  (testing "connection-telemetry-info describes the current connection context as prose, for logging only"
    (is (= "the default connection" (driver.conn/connection-telemetry-info)))
    (driver.conn/with-write-connection
      (is (= "the write-data connection" (driver.conn/connection-telemetry-info))))
    (driver.conn/with-transform-connection
      (is (= "the transform connection" (driver.conn/connection-telemetry-info))))))

(deftest type-resolved-metric-test
  (mt/when-ee-evailable
   (mt/with-premium-features #{:writable-connection}
     (testing "type-resolved counter increments when write-data-details are genuinely used"
       (mt/with-prometheus-system! [_ system]
         (let [database {:lib/type           :metadata/database
                         :id                 1
                         :details            {:host "read-host" :port 5432}
                         :write-data-details {:host "write-host"}}]
           (driver.conn/with-write-connection
             (driver.conn/effective-details database))
           (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-db-connection/type-resolved
                                                           {:connection-type "write-data"}))))))
     (testing "type-resolved counter does NOT increment on fallback (no write-data-details)"
       (mt/with-prometheus-system! [_ system]
         (let [database {:lib/type :metadata/database
                         :id       1
                         :details  {:host "read-host" :port 5432}}]
           (driver.conn/with-write-connection
             (driver.conn/effective-details database))
           (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-db-connection/type-resolved
                                                           {:connection-type "write-data"}))))))
     (testing "type-resolved counter does NOT increment for default connection type"
       (mt/with-prometheus-system! [_ system]
         (let [database {:lib/type           :metadata/database
                         :id                 1
                         :details            {:host "read-host" :port 5432}
                         :write-data-details {:host "write-host"}}]
           (driver.conn/effective-details database)
           (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-db-connection/type-resolved
                                                           {:connection-type "write-data"}))))))
     (testing "type-resolved counter does NOT increment inside without-resolution-telemetry"
       (mt/with-prometheus-system! [_ system]
         (let [database {:lib/type           :metadata/database
                         :id                 1
                         :details            {:host "read-host" :port 5432}
                         :write-data-details {:host "write-host"}}]
           (driver.conn/without-resolution-telemetry
            (driver.conn/with-write-connection
              (is (=? {:host "write-host" :port 5432}
                      (driver.conn/effective-details database)))))
           (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-db-connection/type-resolved
                                                           {:connection-type "write-data"})))))))))
