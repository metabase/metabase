(ns metabase-enterprise.product-analytics.storage.iceberg.s3-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.storage.iceberg.s3 :as iceberg.s3]
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest s3-file-io-properties-has-required-keys-test
  (testing "s3-file-io-properties returns a map with all required S3 FileIO keys"
    (mt/with-premium-features #{:product-analytics}
      (let [props (into {} (iceberg.s3/s3-file-io-properties))]
        (is (contains? props "s3.endpoint"))
        (is (contains? props "s3.region"))
        (is (contains? props "s3.access-key-id"))
        (is (contains? props "s3.secret-access-key"))
        (is (contains? props "s3.path-style-access"))
        (is (= "org.apache.iceberg.aws.s3.S3FileIO" (get props "io-impl")))))))

(deftest s3-file-io-properties-reflects-settings-test
  (testing "s3-file-io-properties reflects overridden setting values"
    (mt/with-premium-features #{:product-analytics}
      (with-redefs [iceberg.settings/product-analytics-iceberg-s3-endpoint   (constantly "https://custom.s3.example.com")
                    iceberg.settings/product-analytics-iceberg-s3-region     (constantly "eu-west-1")
                    iceberg.settings/product-analytics-iceberg-s3-access-key (constantly "CUSTOM_ACCESS_KEY")
                    iceberg.settings/product-analytics-iceberg-s3-secret-key (constantly "CUSTOM_SECRET_KEY")
                    iceberg.settings/product-analytics-iceberg-s3-path-style-access (constantly false)]
        (let [props (into {} (iceberg.s3/s3-file-io-properties))]
          (is (= "https://custom.s3.example.com" (get props "s3.endpoint")))
          (is (= "eu-west-1" (get props "s3.region")))
          (is (= "CUSTOM_ACCESS_KEY" (get props "s3.access-key-id")))
          (is (= "CUSTOM_SECRET_KEY" (get props "s3.secret-access-key")))
          (is (nil? (get props "s3.path-style-access"))
              "path-style-access should not be set when false"))))))
