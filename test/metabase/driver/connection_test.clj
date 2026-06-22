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
  (mt/when-ee-evailable
   (mt/with-premium-features #{:writable-connection}
     (let [details            {:host "read-host" :port 5432}
           write-data-details {:host "write-host" :port 5432}]
       (testing "effective-details returns write_data_details when :write-data and details exist"
         (testing "with kebab-case key (Lib metadata style)"
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
                       (driver.conn/effective-details database)))))))))))

(deftest effective-details-write-fallback-test
  (mt/with-premium-features #{:writable-connection}
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
                      (driver.conn/effective-details database))))))))))

(deftest effective-details-write-without-feature-test
  (testing "without :writable-connection feature, with-write-connection falls back to main connection details"
    (mt/with-premium-features #{}
      (let [details            {:host "read-host" :port 5432}
            write-data-details {:host "write-host" :port 5432}
            database           {:lib/type           :metadata/database
                                :details            details
                                :write-data-details write-data-details}]
        (driver.conn/with-write-connection
          (is (=? details
                  (driver.conn/effective-details database))))))))

(deftest effective-details-nil-test
  (testing "effective-details returns nil when database is nil"
    (is (nil? (driver.conn/effective-details nil)))
    (mt/with-premium-features #{:writable-connection}
      (driver.conn/with-write-connection
        (is (nil? (driver.conn/effective-details nil)))))))

(deftest connection-telemetry-info-test
  (testing "connection-telemetry-info describes the current connection context as prose, for logging only"
    (is (= "the default connection" (driver.conn/connection-telemetry-info)))
    (driver.conn/with-write-connection
      (is (= "the write-data connection" (driver.conn/connection-telemetry-info))))
    (driver.conn/with-admin-connection
      (is (= "the admin connection" (driver.conn/connection-telemetry-info))))
    (driver.conn/with-transform-connection
      (is (= "the transform connection" (driver.conn/connection-telemetry-info))))))

(deftest effective-details-default-with-admin-details-test
  (testing "effective-details returns :details when *connection-type* is :default, even when :admin-details present"
    (let [details       {:host "read-host" :port 5432}
          admin-details {:host "admin-host" :port 5432 :user "root"}
          database      {:lib/type      :metadata/database
                         :details       details
                         :admin-details admin-details}]
      (is (=? details
              (driver.conn/effective-details database))))))

(deftest effective-details-admin-with-admin-details-test
  (mt/when-ee-evailable
   (mt/with-premium-features #{:workspaces}
     (let [details       {:host "read-host" :port 5432}
           admin-details {:host "admin-host" :port 5432 :user "root"}]
       (testing "effective-details returns admin_details when :admin and details exist"
         (testing "with kebab-case key (Lib metadata style)"
           (let [database {:lib/type      :metadata/database
                           :details       details
                           :admin-details admin-details}]
             (driver.conn/with-admin-connection
               (is (=? admin-details
                       (driver.conn/effective-details database))))))
         (testing "with snake_case key (Toucan2 instance style)"
           (let [database (t2/instance :model/Database
                                       {:id            1
                                        :details       details
                                        :admin_details admin-details})]
             (driver.conn/with-admin-connection
               (is (=? admin-details
                       (driver.conn/effective-details database)))))))))))

(deftest effective-details-admin-fallback-test
  (mt/with-premium-features #{:workspaces}
    (let [details {:host "read-host" :port 5432}]
      (testing "effective-details falls back to :details when :admin but no admin details"
        (let [database {:lib/type      :metadata/database
                        :details       details
                        :admin-details nil}]
          (driver.conn/with-admin-connection
            (is (=? details
                    (driver.conn/effective-details database)))))
        (testing "also when :admin_details key is missing entirely"
          (let [database {:lib/type :metadata/database
                          :details  details}]
            (driver.conn/with-admin-connection
              (is (=? details
                      (driver.conn/effective-details database))))))))))

(deftest effective-details-admin-without-feature-test
  (testing "without :workspaces feature, with-admin-connection falls back to main connection details"
    (mt/with-premium-features #{}
      (let [details       {:host "read-host" :port 5432}
            admin-details {:host "admin-host" :port 5432 :user "root"}
            database      {:lib/type      :metadata/database
                           :details       details
                           :admin-details admin-details}]
        (driver.conn/with-admin-connection
          (is (=? details
                  (driver.conn/effective-details database))))))))

(deftest connection-pool-type-admin-test
  (mt/when-ee-evailable
   (mt/with-premium-features #{:workspaces}
     (let [details       {:host "read-host"}
           admin-details {:host "admin-host"}
           configured    {:lib/type :metadata/database :id 1
                          :details details :admin-details admin-details}
           unconfigured  {:lib/type :metadata/database :id 1 :details details}]
       (testing "returns :admin when both requested and configured"
         (driver.conn/with-admin-connection
           (is (= :admin (driver.conn/connection-pool-type configured)))))
       (testing "returns :default when requested but not configured (avoids duplicate pool)"
         (driver.conn/with-admin-connection
           (is (= :default (driver.conn/connection-pool-type unconfigured)))))
       (testing "returns :default when not requested even if configured"
         (is (= :default (driver.conn/connection-pool-type configured))))))))

(deftest effective-details-admin-with-workspace-swap-test
  (mt/when-ee-evailable
   (mt/with-premium-features #{:workspaces}
     (testing "effective-details applies workspace swap AFTER admin-details merge"
       (let [database {:lib/type      :metadata/database
                       :id            1
                       :details       {:host "host" :user "reader" :port 5432}
                       :admin-details {:user "root" :password "admin-pass" :admin true}}]
         (driver.w/with-swapped-connection-details 1 {:user "ws-user" :password "ws-pass"}
           (driver.conn/with-admin-connection
             (is (=? {:host "host" :user "ws-user" :password "ws-pass" :port 5432 :admin true}
                     (driver.conn/effective-details database))))))))))

(deftest type-resolved-metric-admin-test
  (mt/when-ee-evailable
   (mt/with-premium-features #{:workspaces}
     (testing "type-resolved counter increments when admin-details are genuinely used"
       (mt/with-prometheus-system! [_ system]
         (let [database {:lib/type      :metadata/database
                         :id            1
                         :details       {:host "read-host" :port 5432}
                         :admin-details {:host "admin-host"}}]
           (driver.conn/with-admin-connection
             (driver.conn/effective-details database))
           (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-db-connection/type-resolved
                                                           {:connection-type "admin"}))))))
     (testing "type-resolved counter does NOT increment on fallback (no admin-details)"
       (mt/with-prometheus-system! [_ system]
         (let [database {:lib/type :metadata/database
                         :id       1
                         :details  {:host "read-host" :port 5432}}]
           (driver.conn/with-admin-connection
             (driver.conn/effective-details database))
           (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-db-connection/type-resolved
                                                           {:connection-type "admin"}))))))
     (testing "type-resolved counter does NOT increment when workspace swap is active"
       (mt/with-prometheus-system! [_ system]
         (let [database {:lib/type      :metadata/database
                         :id            1
                         :details       {:host "read-host" :port 5432}
                         :admin-details {:host "admin-host"}}]
           (driver.w/with-swapped-connection-details 1 {:user "ws-user"}
             (driver.conn/with-admin-connection
               (driver.conn/effective-details database)))
           (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-db-connection/type-resolved
                                                           {:connection-type "admin"}))))))
     (testing "type-resolved counter does NOT increment inside without-resolution-telemetry"
       (mt/with-prometheus-system! [_ system]
         (let [database {:lib/type      :metadata/database
                         :id            1
                         :details       {:host "read-host" :port 5432}
                         :admin-details {:host "admin-host"}}]
           (driver.conn/without-resolution-telemetry
            (driver.conn/with-admin-connection
              (is (=? {:host "admin-host" :port 5432}
                      (driver.conn/effective-details database)))))
           (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-db-connection/type-resolved
                                                           {:connection-type "admin"})))))))))

(deftest effective-details-with-workspace-swap-test
  (testing "effective-details applies workspace swap in :default connection type"
    (let [database {:lib/type :metadata/database
                    :id       1
                    :details  {:host "read-host" :user "admin" :port 5432}}]
      (driver.w/with-swapped-connection-details 1 {:user "ws-user" :password "ws-pass"}
        (is (=? {:host "read-host" :user "ws-user" :password "ws-pass" :port 5432}
                (driver.conn/effective-details database))))))
  (mt/when-ee-evailable
   (mt/with-premium-features #{:writable-connection}
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
                   (driver.conn/effective-details database)))))))))

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
                                                           {:connection-type "write-data"})))))))))
