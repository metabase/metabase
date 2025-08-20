(ns metabase.warehouses.provider-detection-test
  (:require
   [clojure.test :refer :all]
   [metabase.warehouses.provider-detection :as provider-detection]))

(deftest detect-provider-test
  (testing "Other providers"
    (is (= "Aiven" (provider-detection/detect-provider "mydb-project.aivencloud.com")))
    (is (= "Amazon RDS" (provider-detection/detect-provider "czrs8kj4isg7.us-east-1.rds.amazonaws.com")))
    (is (= "Azure" (provider-detection/detect-provider "production-flexible-server.postgres.database.azure.com")))
    (is (= "Crunchy Data" (provider-detection/detect-provider "p.vbjrfujv5beutaoelw725gvi3i.db.postgresbridge.com")))
    (is (= "DigitalOcean" (provider-detection/detect-provider "cluster-do-user-1234567-0.db.ondigitalocean.com")))
    (is (= "Fly.io" (provider-detection/detect-provider "db.fly.dev")))
    (is (= "Neon" (provider-detection/detect-provider "ep-autumn-frost-alwlmval-pooler.ap-southeast-1 .aws.neon.tech")))
    (is (= "PlanetScale" (provider-detection/detect-provider "my-db.horizon.psdb.cloud")))
    (is (= "Railway" (provider-detection/detect-provider "nodejs-copy-production-7aa4.up.railway.app")))
    (is (= "Render" (provider-detection/detect-provider "your_host_name.your_region-postgres.render.com")))
    (is (= "Scaleway" (provider-detection/detect-provider "my-db.region-1.scw.cloud")))
    (is (= "Supabase" (provider-detection/detect-provider "db.apbkobhfnmcqqzqeeqss.supabase.co")))
    (is (= "Supabase" (provider-detection/detect-provider "aws-0-us-west-1.pooler.supabase.com")))
    (is (= "Timescale" (provider-detection/detect-provider "service.project.tsdb.cloud.timescale.com"))))

  (testing "No match"
    (is (nil? (provider-detection/detect-provider "localhost")))
    (is (nil? (provider-detection/detect-provider "mycompany.com")))
    (is (nil? (provider-detection/detect-provider nil)))
    (is (nil? (provider-detection/detect-provider "")))))

(deftest extract-host-from-details-test
  (testing "various host key formats"
    (is (= "test.host.com" (provider-detection/extract-host-from-details {:host "test.host.com"})))
    (is (= "test.host.com" (provider-detection/extract-host-from-details {"host" "test.host.com"})))))

(deftest detect-provider-from-database-test
  (testing "full database entity detection"
    (let [database {:details {:host "czrs8kj4isg7.us-east-1.rds.amazonaws.com"}}]
      (is (= "Amazon RDS" (provider-detection/detect-provider-from-database database)))))

  (testing "database with string host key"
    (let [database {:details {"host" "czrs8kj4isg7.us-east-1.rds.amazonaws.com"}}]
      (is (= "Amazon RDS" (provider-detection/detect-provider-from-database database))))))
