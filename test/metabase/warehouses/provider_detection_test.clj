(ns metabase.warehouses.provider-detection-test
  (:require
   [clojure.test :refer :all]
   [metabase.warehouses.provider-detection :as provider-detection]))

(deftest detect-provider-test
  (testing "Providers with postgres engine"
    (is (= "Aiven" (#'provider-detection/detect-provider "mydb-project.aivencloud.com" :postgres)))
    (is (= "Amazon RDS" (#'provider-detection/detect-provider "czrs8kj4isg7.us-east-1.rds.amazonaws.com" :postgres)))
    (is (= "Azure" (#'provider-detection/detect-provider "production-flexible-server.postgres.database.azure.com" :postgres)))
    (is (= "Crunchy Data" (#'provider-detection/detect-provider "p.vbjrfujv5beutaoelw725gvi3i.db.postgresbridge.com" :postgres)))
    (is (= "DigitalOcean" (#'provider-detection/detect-provider "cluster-do-user-1234567-0.db.ondigitalocean.com" :postgres)))
    (is (= "Fly.io" (#'provider-detection/detect-provider "db.fly.dev" :postgres)))
    (is (= "Neon" (#'provider-detection/detect-provider "ep-autumn-frost-alwlmval-pooler.ap-southeast-1.aws.neon.tech" :postgres)))
    (is (= "PlanetScale" (#'provider-detection/detect-provider "my-db.horizon.psdb.cloud" :postgres)))
    (is (= "Railway" (#'provider-detection/detect-provider "nodejs-copy-production-7aa4.up.railway.app" :postgres)))
    (is (= "Render" (#'provider-detection/detect-provider "your_host_name.your_region-postgres.render.com" :postgres)))
    (is (= "Scaleway" (#'provider-detection/detect-provider "my-db.region-1.scw.cloud" :postgres)))
    (is (= "Supabase" (#'provider-detection/detect-provider "db.apbkobhfnmcqqzqeeqss.supabase.co" :postgres)))
    (is (= "Supabase" (#'provider-detection/detect-provider "aws-0-us-west-1.pooler.supabase.com" :postgres)))
    (is (= "Timescale" (#'provider-detection/detect-provider "service.project.tsdb.cloud.timescale.com" :postgres))))

  (testing "Engine filtering - unsupported engines"
    (is (nil? (#'provider-detection/detect-provider "mydb-project.aivencloud.com" :mysql)))
    (is (nil? (#'provider-detection/detect-provider "czrs8kj4isg7.us-east-1.rds.amazonaws.com" :h2))))

  (testing "No match"
    (is (nil? (#'provider-detection/detect-provider "localhost" :postgres)))
    (is (nil? (#'provider-detection/detect-provider "mycompany.com" :postgres)))
    (is (nil? (#'provider-detection/detect-provider nil :postgres)))
    (is (nil? (#'provider-detection/detect-provider "" :postgres)))
    (is (nil? (#'provider-detection/detect-provider "mydb-project.aivencloud.com" nil)))))

(deftest extract-host-from-details-test
  (testing "various host key formats"
    (is (= "test.host.com" (#'provider-detection/extract-host-from-details {:host "test.host.com"})))
    (is (= "test.host.com" (#'provider-detection/extract-host-from-details {"host" "test.host.com"})))))

(deftest detect-provider-from-database-test
  (testing "full database entity detection with postgres engine"
    (let [database {:details {:host "czrs8kj4isg7.us-east-1.rds.amazonaws.com"} :engine :postgres}]
      (is (= "Amazon RDS" (provider-detection/detect-provider-from-database database)))))

  (testing "database with string host key and postgres engine"
    (let [database {:details {"host" "czrs8kj4isg7.us-east-1.rds.amazonaws.com"} :engine :postgres}]
      (is (= "Amazon RDS" (provider-detection/detect-provider-from-database database)))))

  (testing "database with unsupported engine returns nil"
    (let [database {:details {:host "czrs8kj4isg7.us-east-1.rds.amazonaws.com"} :engine :mysql}]
      (is (nil? (provider-detection/detect-provider-from-database database)))))

  (testing "database without engine returns nil"
    (let [database {:details {:host "czrs8kj4isg7.us-east-1.rds.amazonaws.com"}}]
      (is (nil? (provider-detection/detect-provider-from-database database)))))

  (testing "database without host returns nil"
    (let [database {:details {} :engine :postgres}]
      (is (nil? (provider-detection/detect-provider-from-database database))))))
