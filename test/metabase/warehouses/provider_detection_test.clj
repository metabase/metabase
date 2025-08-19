(ns metabase.warehouses.provider-detection-test
  (:require
   [clojure.test :refer :all]
   [metabase.warehouses.provider-detection :as provider-detection]))

(deftest detect-provider-test
  (testing "Amazon RDS detection"
    (is (= "Amazon RDS" (provider-detection/detect-provider "czrs8kj4isg7.us-east-1.rds.amazonaws.com")))
    (is (= "Amazon RDS" (provider-detection/detect-provider "mydb.rds.amazonaws.com"))))

  (testing "Other providers"
    (is (= "Supabase" (provider-detection/detect-provider "aws-0-us-west-1.pooler.supabase.com")))
    (is (= "Neon" (provider-detection/detect-provider "ep-aged-meadow-123456.us-east-2.aws.neon.tech")))
    (is (= "Aiven" (provider-detection/detect-provider "mydb-project.aivencloud.com"))))

  (testing "No match"
    (is (nil? (provider-detection/detect-provider "localhost")))
    (is (nil? (provider-detection/detect-provider "mycompany.com")))
    (is (nil? (provider-detection/detect-provider nil)))
    (is (nil? (provider-detection/detect-provider "")))))

(deftest extract-host-from-details-test
  (testing "various host key formats"
    (is (= "test.host.com" (provider-detection/extract-host-from-details {:host "test.host.com"})))
    (is (= "test.host.com" (provider-detection/extract-host-from-details {"host" "test.host.com"})))
    (is (= "test.host.com" (provider-detection/extract-host-from-details {:hostname "test.host.com"})))
    (is (= "test.host.com" (provider-detection/extract-host-from-details {"hostname" "test.host.com"})))
    (is (nil? (provider-detection/extract-host-from-details nil)))
    (is (nil? (provider-detection/extract-host-from-details {})))))

(deftest detect-provider-from-database-test
  (testing "full database entity detection"
    (let [database {:details {:host "czrs8kj4isg7.us-east-1.rds.amazonaws.com"}}]
      (is (= "Amazon RDS" (provider-detection/detect-provider-from-database database)))))

  (testing "database with string host key"
    (let [database {:details {"host" "czrs8kj4isg7.us-east-1.rds.amazonaws.com"}}]
      (is (= "Amazon RDS" (provider-detection/detect-provider-from-database database))))))
