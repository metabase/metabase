(ns metabase.driver.connection-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest effective-details-default-test
  (testing "effective-details returns :details when *connection-type* is :default"
    (let [database {:lib/type :metadata/database
                    :details {:host "read-host" :port 5432}
                    :write-data-details {:host "write-host" :port 5432}}]
      (is (= {:host "read-host" :port 5432}
             (driver.conn/effective-details database))))))

(deftest effective-details-write-with-write-details-test
  (testing "effective-details returns write_data_details when :write-data and details exist"
    (testing "with kebab-case key (MLv2 metadata style)"
      (let [database {:lib/type :metadata/database
                      :details {:host "read-host" :port 5432}
                      :write-data-details {:host "write-host" :port 5432}}]
        (driver.conn/with-write-connection
          (is (= {:host "write-host" :port 5432}
                 (driver.conn/effective-details database))))))
    (testing "with snake_case key (Toucan2 instance style)"
      (let [database (t2/instance :model/Database
                                  {:id 1
                                   :details {:host "read-host" :port 5432}
                                   :write_data_details {:host "write-host" :port 5432}})]
        (driver.conn/with-write-connection
          (is (= {:host "write-host" :port 5432}
                 (driver.conn/effective-details database))))))))

(deftest effective-details-write-fallback-test
  (testing "effective-details falls back to :details when :write-data but no write details"
    (let [database {:lib/type :metadata/database
                    :details {:host "read-host" :port 5432}
                    :write-data-details nil}]
      (driver.conn/with-write-connection
        (is (= {:host "read-host" :port 5432}
               (driver.conn/effective-details database)))))
    (testing "also when :write_data_details key is missing entirely"
      (let [database {:lib/type :metadata/database
                      :details {:host "read-host" :port 5432}}]
        (driver.conn/with-write-connection
          (is (= {:host "read-host" :port 5432}
                 (driver.conn/effective-details database))))))))

(deftest effective-details-nil-test
  (testing "effective-details returns nil when database is nil"
    (is (nil? (driver.conn/effective-details nil)))
    (driver.conn/with-write-connection
      (is (nil? (driver.conn/effective-details nil))))))

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

(deftest effective-details-with-workspace-swap-test
  (testing "effective-details applies workspace swap in :default connection type"
    (let [database {:lib/type :metadata/database
                    :id 1
                    :details {:host "read-host" :user "admin" :port 5432}}]
      (driver/with-swapped-connection-details 1 {:user "ws-user" :password "ws-pass"}
        (is (= {:host "read-host" :user "ws-user" :password "ws-pass" :port 5432}
               (driver.conn/effective-details database))))))

  (testing "effective-details applies workspace swap AFTER write-data merge"
    (let [database {:lib/type :metadata/database
                    :id 1
                    :details {:host "read-host" :user "admin" :port 5432}
                    :write-data-details {:user "writer" :password "write-pass"}}]
      (driver/with-swapped-connection-details 1 {:user "ws-user" :password "ws-pass"}
        (driver.conn/with-write-connection
          (is (= {:host "read-host" :user "ws-user" :password "ws-pass" :port 5432}
                 (driver.conn/effective-details database)))))))

  (testing "without workspace swap, effective-details is unchanged (regression)"
    (let [database {:lib/type :metadata/database
                    :id 1
                    :details {:host "read-host" :user "admin"}
                    :write-data-details {:user "writer"}}]
      (is (= {:host "read-host" :user "admin"}
             (driver.conn/effective-details database)))
      (driver.conn/with-write-connection
        (is (= {:host "read-host" :user "writer"}
               (driver.conn/effective-details database)))))))

(deftest type-resolved-metric-test
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
  (testing "type-resolved counter does NOT increment when workspace swap is active"
    (mt/with-prometheus-system! [_ system]
      (let [database {:lib/type           :metadata/database
                      :id                 1
                      :details            {:host "read-host" :port 5432}
                      :write-data-details {:host "write-host"}}]
        (driver/with-swapped-connection-details 1 {:user "ws-user"}
          (driver.conn/with-write-connection
            (driver.conn/effective-details database)))
        (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-db-connection/type-resolved
                                                        {:connection-type "write-data"})))))))
