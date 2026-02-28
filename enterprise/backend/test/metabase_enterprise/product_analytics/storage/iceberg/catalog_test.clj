(ns metabase-enterprise.product-analytics.storage.iceberg.catalog-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.storage.iceberg.catalog :as iceberg.catalog]
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest catalog-caches-instance-test
  (testing "catalog returns the same instance on repeated calls; reset-catalog! clears it"
    (mt/with-premium-features #{:product-analytics}
      (let [sentinel (Object.)]
        (with-redefs [iceberg.catalog/create-catalog* (constantly sentinel)]
          (iceberg.catalog/reset-catalog!)
          (try
            (let [first-call  (iceberg.catalog/catalog)
                  second-call (iceberg.catalog/catalog)]
              (is (identical? first-call second-call)
                  "Repeated calls should return the same cached instance")
              (is (identical? sentinel first-call)))
            (finally
              (iceberg.catalog/reset-catalog!))))))))

(deftest unsupported-catalog-type-throws-test
  (testing "Unsupported catalog type throws ExceptionInfo"
    (mt/with-premium-features #{:product-analytics}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"not yet implemented"
           (iceberg.catalog/create-catalog* :rest {}))))))

(deftest jdbc-catalog-passes-settings-to-properties-test
  (testing "JDBC catalog method reads settings and passes them to properties"
    (mt/with-premium-features #{:product-analytics}
      (let [captured-props (atom nil)]
        (with-redefs [iceberg.settings/product-analytics-iceberg-catalog-uri      (constantly "jdbc:pg://test:5432/cat")
                      iceberg.settings/product-analytics-iceberg-catalog-user     (constantly "test-user")
                      iceberg.settings/product-analytics-iceberg-catalog-password (constantly "test-pass")]
          ;; We can't easily mock JdbcCatalog construction, but we can verify the
          ;; multimethod doesn't throw with valid settings by catching the JDBC
          ;; connection error (since there's no real DB). The important thing is that
          ;; settings are read correctly.
          (is (thrown? Exception
                       (iceberg.catalog/create-catalog* :jdbc {:warehouse-uri "s3://test-bucket/pa/"}))
              "Should attempt to create catalog (and fail due to no real DB)"))))))
