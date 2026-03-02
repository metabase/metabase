(ns metabase-enterprise.product-analytics.query-engine-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.query-engine :as query-engine]
   [metabase-enterprise.product-analytics.setup :as pa.setup]
   [metabase-enterprise.product-analytics.storage :as storage]
   [metabase-enterprise.product-analytics.storage.iceberg :as iceberg]
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase-enterprise.product-analytics.storage.iceberg.writer :as writer]
   [metabase-enterprise.product-analytics.test-util :as pa.tu]
   [metabase.app-db.core :as mdb]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.product-analytics.core :as pa]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest starburst-details-reads-settings-test
  (testing "starburst-details returns a map reflecting current settings"
    (mt/with-premium-features #{:product-analytics}
      (with-redefs [iceberg.settings/product-analytics-starburst-host    (constantly "trino.example.com")
                    iceberg.settings/product-analytics-starburst-port    (constantly 8443)
                    iceberg.settings/product-analytics-starburst-catalog (constantly "my_catalog")
                    iceberg.settings/product-analytics-starburst-schema  (constantly "my_schema")
                    iceberg.settings/product-analytics-starburst-user    (constantly "admin")
                    iceberg.settings/product-analytics-starburst-ssl     (constantly false)]
        (is (= {:host    "trino.example.com"
                :port    8443
                :catalog "my_catalog"
                :schema  "my_schema"
                :user    "admin"
                :ssl     false}
               (query-engine/starburst-details)))))))

(deftest use-starburst-false-with-app-db-backend-test
  (testing "use-starburst? returns false when storage backend is app-db"
    (mt/with-premium-features #{:product-analytics}
      (with-redefs [storage/active-backend (constantly ::storage/app-db)]
        (is (false? (query-engine/use-starburst?)))))))

(deftest use-starburst-true-with-iceberg-and-starburst-test
  (testing "use-starburst? returns true when backend is iceberg and engine is starburst"
    (mt/with-premium-features #{:product-analytics}
      (with-redefs [storage/active-backend                          (constantly ::storage/iceberg)
                    iceberg.settings/product-analytics-query-engine  (constantly :starburst)]
        (is (true? (query-engine/use-starburst?)))))))

(deftest reconfigure-switches-to-starburst-test
  (testing "reconfigure-pa-database! switches PA DB to starburst engine"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.tu/ensure-pa-db!)
        (with-redefs [storage/active-backend                              (constantly ::storage/iceberg)
                      iceberg.settings/product-analytics-query-engine      (constantly :starburst)
                      iceberg.settings/product-analytics-starburst-host    (constantly "trino.test.com")
                      iceberg.settings/product-analytics-starburst-port    (constantly 443)
                      iceberg.settings/product-analytics-starburst-catalog (constantly "iceberg")
                      iceberg.settings/product-analytics-starburst-schema  (constantly "product_analytics")
                      iceberg.settings/product-analytics-starburst-user    (constantly "test-user")
                      iceberg.settings/product-analytics-starburst-ssl     (constantly true)
                      ;; Stub out side effects — no real Starburst, Iceberg, or sync available
                      storage/ensure-backend-ready!         (constantly nil)
                      sql-jdbc.conn/invalidate-pool-for-db! (constantly nil)
                      sync/sync-database!                   (constantly nil)
                      pa.setup/enhance-pa-metadata!         (constantly nil)]
          (query-engine/reconfigure-pa-database!)
          (let [db (t2/select-one :model/Database :id pa/product-analytics-db-id)]
            (is (= :starburst (keyword (:engine db))))
            (is (= "trino.test.com" (get-in db [:details :host])))))))))

(deftest reconfigure-switches-back-to-app-db-test
  (testing "reconfigure-pa-database! switches PA DB back to app-db engine"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.tu/ensure-pa-db!)
        ;; First, simulate being on starburst
        (t2/update! :model/Database pa/product-analytics-db-id
                    {:engine  :starburst
                     :details {:host "trino.test.com"}})
        ;; Now switch back to app-db
        (with-redefs [storage/active-backend                          (constantly ::storage/app-db)
                      iceberg.settings/product-analytics-query-engine  (constantly :app-db)
                      sql-jdbc.conn/invalidate-pool-for-db! (constantly nil)
                      sync/sync-database!                   (constantly nil)
                      pa.setup/enhance-pa-metadata!         (constantly nil)]
          (query-engine/reconfigure-pa-database!)
          (let [db (t2/select-one :model/Database :id pa/product-analytics-db-id)]
            (is (= (mdb/db-type) (keyword (:engine db)))
                "Engine should be switched back to the app-db type")
            (is (= {} (:details db))
                "Details should be empty after switching to app-db")))))))

(deftest reconfigure-calls-ensure-backend-ready-test
  (testing "reconfigure-pa-database! calls ensure-backend-ready! when switching to Starburst"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.tu/ensure-pa-db!)
        (let [backend-ready-called? (atom false)]
          (with-redefs [storage/active-backend                              (constantly ::storage/iceberg)
                        iceberg.settings/product-analytics-query-engine      (constantly :starburst)
                        iceberg.settings/product-analytics-starburst-host    (constantly "trino.test.com")
                        iceberg.settings/product-analytics-starburst-port    (constantly 443)
                        iceberg.settings/product-analytics-starburst-catalog (constantly "iceberg")
                        iceberg.settings/product-analytics-starburst-schema  (constantly "product_analytics")
                        iceberg.settings/product-analytics-starburst-user    (constantly "test-user")
                        iceberg.settings/product-analytics-starburst-ssl     (constantly true)
                        storage/ensure-backend-ready!         (fn [_] (reset! backend-ready-called? true))
                        sql-jdbc.conn/invalidate-pool-for-db! (constantly nil)
                        sync/sync-database!                   (constantly nil)
                        pa.setup/enhance-pa-metadata!         (constantly nil)]
            (query-engine/reconfigure-pa-database!)
            (is (true? @backend-ready-called?)
                "ensure-backend-ready! should be called before syncing")))))))

(deftest reconfigure-does-not-call-ensure-backend-ready-for-app-db-test
  (testing "reconfigure-pa-database! does not call ensure-backend-ready! when switching to app-db"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.tu/ensure-pa-db!)
        (t2/update! :model/Database pa/product-analytics-db-id
                    {:engine  :starburst
                     :details {:host "trino.test.com"}})
        (let [backend-ready-called? (atom false)]
          (with-redefs [storage/active-backend                          (constantly ::storage/app-db)
                        iceberg.settings/product-analytics-query-engine  (constantly :app-db)
                        storage/ensure-backend-ready!         (fn [_] (reset! backend-ready-called? true))
                        sql-jdbc.conn/invalidate-pool-for-db! (constantly nil)
                        sync/sync-database!                   (constantly nil)
                        pa.setup/enhance-pa-metadata!         (constantly nil)]
            (query-engine/reconfigure-pa-database!)
            (is (false? @backend-ready-called?)
                "ensure-backend-ready! should not be called for app-db path")))))))

(deftest reconfigure-proceeds-when-ensure-backend-ready-throws-test
  (testing "reconfigure-pa-database! proceeds even when ensure-backend-ready! throws"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.tu/ensure-pa-db!)
        (with-redefs [storage/active-backend                              (constantly ::storage/iceberg)
                      iceberg.settings/product-analytics-query-engine      (constantly :starburst)
                      iceberg.settings/product-analytics-starburst-host    (constantly "trino.test.com")
                      iceberg.settings/product-analytics-starburst-port    (constantly 443)
                      iceberg.settings/product-analytics-starburst-catalog (constantly "iceberg")
                      iceberg.settings/product-analytics-starburst-schema  (constantly "product_analytics")
                      iceberg.settings/product-analytics-starburst-user    (constantly "test-user")
                      iceberg.settings/product-analytics-starburst-ssl     (constantly true)
                      storage/ensure-backend-ready!         (fn [_] (throw (Exception. "Catalog not configured")))
                      sql-jdbc.conn/invalidate-pool-for-db! (constantly nil)
                      sync/sync-database!                   (constantly nil)
                      pa.setup/enhance-pa-metadata!         (constantly nil)]
          (query-engine/reconfigure-pa-database!)
          (let [db (t2/select-one :model/Database :id pa/product-analytics-db-id)]
            (is (= :starburst (keyword (:engine db)))
                "PA DB should still be switched to Starburst despite ensure-backend-ready! failure")))))))

(deftest start-resets-started-on-failure-test
  (testing "Iceberg start! resets started? on failure so ensure-backend-ready! can retry"
    ;; Ensure clean state — stop any previous run
    (iceberg/stop!)
    (let [call-count (atom 0)]
      (with-redefs [writer/ensure-tables! (fn []
                                            (swap! call-count inc)
                                            (if (= 1 @call-count)
                                              (throw (Exception. "Catalog unavailable"))
                                              nil))
                    iceberg/reload-sites-cache!
                    (constantly nil)
                    iceberg.settings/product-analytics-iceberg-flush-interval-seconds
                    (constantly 60)]
        ;; First attempt: should throw
        (is (thrown? Exception (iceberg/start!)))
        ;; Second attempt: should succeed because started? was reset
        (iceberg/start!)
        (is (= 2 @call-count)
            "start! should have been called twice — first failure, then retry")))
    ;; Clean up
    (iceberg/stop!)))
