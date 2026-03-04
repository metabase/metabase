(ns metabase.driver.connection-test
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.connection.workspaces :as driver.w]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment =?/keep-me)

(deftest effective-details-default-test
  (testing "effective-details returns :details when *connection-type* is :default"
    (let [details            {:host "read-host" :port 5432}
          write-data-details {:host "write-host" :port 5432}
          database           {:lib/type           :metadata/database
                              :details            details
                              :write-data-details write-data-details}]
      (is (=? details
              (driver.conn/effective-details database))))))

(deftest effective-details-write-with-write-details-test
  (let [details            {:host "read-host" :port 5432}
        write-data-details {:host "write-host" :port 5432}]
    (testing "effective-details returns write_data_details when :write-data and details exist"
      (testing "with kebab-case key (MLv2 metadata style)"
        (let [database {:lib/type           :metadata/database
                        :details            details
                        :write-data-details write-data-details}]
          (driver.conn/with-write-connection
            (is (=? write-data-details
                    (driver.conn/effective-details database))))))
      (testing "with snake_case key (Toucan2 instance style)"
        (let [database (t2/instance :model/Database
                                    {:id                 1
                                     :details            details
                                     :write_data_details write-data-details})]
          (driver.conn/with-write-connection
            (is (=? write-data-details
                    (driver.conn/effective-details database)))))))))

(deftest effective-details-write-fallback-test
  (let [details {:host "read-host" :port 5432}]
    (testing "effective-details falls back to :details when :write-data but no write details"
      (let [database {:lib/type :metadata/database
                      :details details
                      :write-data-details nil}]
        (driver.conn/with-write-connection
          (is (=? details
                  (driver.conn/effective-details database)))))
      (testing "also when :write_data_details key is missing entirely"
        (let [database {:lib/type :metadata/database
                        :details details}]
          (driver.conn/with-write-connection
            (is (=? details
                    (driver.conn/effective-details database)))))))))

(deftest effective-details-nil-test
  (testing "effective-details returns nil when database is nil"
    (is (nil? (driver.conn/effective-details nil)))
    (driver.conn/with-write-connection
      (is (nil? (driver.conn/effective-details nil))))))

(deftest write-connection-requested?-test
  (testing "write-connection-requested? returns false by default"
    (is (false? (driver.conn/write-connection-requested?))))
  (testing "write-connection-requested? returns true inside with-write-connection"
    (driver.conn/with-write-connection
      (is (true? (driver.conn/write-connection-requested?))))))

(deftest effective-details-with-workspace-swap-test
  (testing "effective-details applies workspace swap in :default connection type"
    (let [database {:lib/type :metadata/database
                    :id       1
                    :details  {:host "read-host" :user "admin" :port 5432}}]
      (driver.w/with-swapped-connection-details 1 {:user "ws-user" :password "ws-pass"}
        (is (=? {:host "read-host" :user "ws-user" :password "ws-pass" :port 5432}
                (driver.conn/effective-details database))))))

  (testing "effective-details applies workspace swap AFTER write-data merge"
    (let [database {:lib/type           :metadata/database
                    :id                 1
                    :details            {:host "host" :user "admin" :port 5432}
                    :write-data-details {:user "writer" :password "write-pass" :write true}}]
      (driver.w/with-swapped-connection-details 1 {:user "ws-user" :password "ws-pass"}
        (driver.conn/with-write-connection
          (is (=? {:host "host" :user "ws-user" :password "ws-pass" :port 5432 :write true}
                  (driver.conn/effective-details database)))))))

  (testing "without workspace swap, effective-details is unchanged (regression)"
    (let [database {:lib/type           :metadata/database
                    :id                 1
                    :details            {:host "host" :user "admin"}
                    :write-data-details {:user "writer"}}]
      (is (=? {:host "host" :user "admin"}
              (driver.conn/effective-details database)))
      (driver.conn/with-write-connection
        (is (=? {:host "host" :user "writer"}
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
        (driver.w/with-swapped-connection-details 1 {:user "ws-user"}
          (driver.conn/with-write-connection
            (driver.conn/effective-details database)))
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
                                                        {:connection-type "write-data"})))))))
