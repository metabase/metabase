(ns metabase.warehouses.provider-detection-test
  (:require
   [clojure.test :refer :all]
   [metabase.warehouses.provider-detection :as provider-detection]))

(deftest detect-provider-from-database-test
  (let [tests [["Aiven" "mydb-project.aivencloud.com"]
               ["Amazon RDS" "czrs8kj4isg7.us-east-1.rds.amazonaws.com"]
               ["Azure" "production-flexible-server.postgres.database.azure.com"]
               ["Crunchy Data" "p.vbjrfujv5beutaoelw725gvi3i.db.postgresbridge.com"]
               ["DigitalOcean" "cluster-do-user-1234567-0.db.ondigitalocean.com"]
               ["Fly.io" "db.fly.dev"]
               ["Neon" "ep-autumn-frost-alwlmval-pooler.ap-southeast-1.aws.neon.tech"]
               ["PlanetScale" "my-db.horizon.psdb.cloud"]
               ["Railway" "nodejs-copy-production-7aa4.up.railway.app"]
               ["Render" "your_host_name.your_region-postgres.render.com"]
               ["Scaleway" "my-db.region-1.scw.cloud"]
               ["Supabase" "db.apbkobhfnmcqqzqeeqss.supabase.co"]
               ["Supabase" "aws-0-us-west-1.pooler.supabase.com"]
               ["Timescale" "service.project.tsdb.cloud.timescale.com"]]]
    (testing "full database entity detection with postgres engine"
      (doseq [[provider host] tests]
        (let [database {:details {:host host} :engine :postgres}]
          (is (= provider (provider-detection/detect-provider-from-database database)))))))

  (testing "database with unsupported engine returns nil"
    (let [database {:details {:host "czrs8kj4isg7.us-east-1.rds.amazonaws.com"} :engine :mysql}]
      (is (nil? (provider-detection/detect-provider-from-database database)))))

  (testing "database without host returns nil"
    (let [database {:details {} :engine :postgres}]
      (is (nil? (provider-detection/detect-provider-from-database database))))))
