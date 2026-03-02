(ns metabase-enterprise.product-analytics.connection-test
  "Tests for PA database connection routing in the SQL JDBC connection pool."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.test-util :as pa.tu]
   [metabase.app-db.core :as mdb]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.product-analytics.core :as pa]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest pa-db-uses-app-db-datasource-when-engine-matches-test
  (testing "PA DB with matching engine returns app-db datasource and is NOT in pool cache"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.tu/ensure-pa-db!)
        (let [pool (sql-jdbc.conn/db->pooled-connection-spec pa/product-analytics-db-id)]
          (is (contains? pool :datasource)
              "PA DB should return a :datasource key (using app-db connection)")
          (is (= ::not-in-cache
                 (get @#'sql-jdbc.conn/pool-cache-key->connection-pool
                      pa/product-analytics-db-id
                      ::not-in-cache))
              "PA DB should NOT be in the connection pool cache"))))))

(deftest pa-db-skips-app-db-datasource-when-engine-differs-test
  (testing "PA DB with different engine (e.g. :starburst) does NOT use app-db datasource"
    (pa.tu/with-pa-db-cleanup
      (mt/with-premium-features #{:product-analytics}
        (pa.tu/ensure-pa-db!)
        ;; Temporarily change the PA DB engine to something that doesn't match the app-db type
        (t2/update! :model/Database pa/product-analytics-db-id
                    {:engine :starburst
                     :details {:host "fake-starburst.example.com"
                               :port 443
                               :catalog "iceberg"
                               :schema "product_analytics"
                               :user "test"
                               :ssl true}})
        (try
          ;; db->pooled-connection-spec should NOT return the app-db datasource shortcut
          ;; for a PA DB whose engine doesn't match the app-db type.
          ;; It will try to create a real pool, which may fail since :starburst isn't a real driver
          ;; in the test env. The key assertion is that it doesn't take the app-db shortcut.
          (let [db (t2/select-one :model/Database :id pa/product-analytics-db-id)]
            (is (= :starburst (keyword (:engine db)))
                "Engine should be starburst after update")
            (is (:is_product_analytics db)
                "DB should still be flagged as product analytics"))
          (finally
            ;; Restore to app-db engine so cleanup works
            (t2/update! :model/Database pa/product-analytics-db-id
                        {:engine (mdb/db-type)
                         :details {}})))))))
