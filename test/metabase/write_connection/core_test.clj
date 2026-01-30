(ns metabase.write-connection.core-test
  "Tests for OSS stub functions for write connection feature (PRO-86).
   In OSS, these functions should always return the original database ID
   since the write connection feature is enterprise-only."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.write-connection.core :as write-connection]
   [toucan2.core :as t2]))

(deftest get-write-database-id-test
  (testing "get-write-database-id returns nil without :advanced-permissions feature even when write_database_id is configured"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Database parent-db {}
                     :model/Database write-db {}]
        (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
        (is (nil? (write-connection/get-write-database-id (:id parent-db)))
            "Should return nil for database ID even with write connection configured")
        (is (nil? (write-connection/get-write-database-id parent-db))
            "Should return nil for database map even with write connection configured")))))

(deftest get-effective-database-id-test
  (testing "get-effective-database-id returns original ID without :advanced-permissions feature even when write_database_id is configured"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Database parent-db {}
                     :model/Database write-db {}]
        (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
        (testing "with integer database ID"
          (is (= (:id parent-db) (write-connection/get-effective-database-id (:id parent-db)))
              "Should return original ID, not write database ID"))
        (testing "with database map"
          (is (= (:id parent-db) (write-connection/get-effective-database-id parent-db))
              "Should return original ID from map, not write database ID"))))))

(deftest feature-flag-gating-test
  (testing "Write connection functions are gated by :advanced-permissions"
    (mt/with-temp [:model/Database parent-db {}
                   :model/Database write-db {}]
      (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
      (testing "with only :transforms, write connection is NOT activated"
        (mt/with-premium-features #{:transforms}
          (is (nil? (write-connection/get-write-database-id (:id parent-db))))
          (is (= (:id parent-db) (write-connection/get-effective-database-id (:id parent-db)))))))))
