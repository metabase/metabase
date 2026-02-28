(ns metabase-enterprise.product-analytics.storage.iceberg.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.query-engine :as query-engine]
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest catalog-settings-dev-defaults-test
  (testing "Catalog settings have expected dev defaults"
    (mt/with-premium-features #{:product-analytics}
      (is (= "jdbc" (iceberg.settings/product-analytics-iceberg-catalog-type)))
      (is (= "jdbc:postgresql://localhost:5434/iceberg_catalog"
             (iceberg.settings/product-analytics-iceberg-catalog-uri)))
      (is (= "iceberg" (iceberg.settings/product-analytics-iceberg-catalog-user)))
      (is (= "iceberg" (iceberg.settings/product-analytics-iceberg-catalog-password))))))

(deftest s3-settings-dev-defaults-test
  (testing "S3 settings have expected dev defaults"
    (mt/with-premium-features #{:product-analytics}
      (is (= "metabase-product-analytics" (iceberg.settings/product-analytics-iceberg-s3-bucket)))
      (is (= "http://localhost:3900" (iceberg.settings/product-analytics-iceberg-s3-endpoint)))
      (is (= "us-east-1" (iceberg.settings/product-analytics-iceberg-s3-region)))
      (is (some? (iceberg.settings/product-analytics-iceberg-s3-access-key)))
      (is (some? (iceberg.settings/product-analytics-iceberg-s3-secret-key)))
      (is (true? (iceberg.settings/product-analytics-iceberg-s3-path-style-access))))))

(deftest flush-settings-defaults-test
  (testing "Flush settings have expected defaults"
    (mt/with-premium-features #{:product-analytics}
      (is (= 30 (iceberg.settings/product-analytics-iceberg-flush-interval-seconds)))
      (is (= 1000 (iceberg.settings/product-analytics-iceberg-flush-batch-size))))))

(deftest query-engine-default-test
  (testing "Default query engine is :app-db"
    (mt/with-premium-features #{:product-analytics}
      (is (= :app-db (iceberg.settings/product-analytics-query-engine))))))

(deftest starburst-settings-defaults-test
  (testing "Starburst settings have expected defaults"
    (mt/with-premium-features #{:product-analytics}
      (is (= 443 (iceberg.settings/product-analytics-starburst-port)))
      (is (= "iceberg" (iceberg.settings/product-analytics-starburst-catalog)))
      (is (= "product_analytics" (iceberg.settings/product-analytics-starburst-schema)))
      (is (true? (iceberg.settings/product-analytics-starburst-ssl))))))

(deftest query-engine-setter-triggers-reconfigure-test
  (testing "Setting query-engine triggers reconfigure-pa-database!"
    (mt/with-premium-features #{:product-analytics}
      (let [reconfigure-called? (atom false)]
        ;; The setter calls (resolve 'metabase-enterprise...query-engine/reconfigure-pa-database!)
        ;; which resolves to the public var in query-engine ns. Mock that.
        (with-redefs [query-engine/reconfigure-pa-database! (fn [] (reset! reconfigure-called? true))]
          (mt/with-temporary-setting-values [product-analytics-query-engine :starburst]
            (is (true? @reconfigure-called?)
                "Setting the query engine should trigger reconfiguration")))))))
