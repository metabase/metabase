(ns metabase.transforms-base.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms-base.db :as transforms-base.db]))

(set! *warn-on-reflection* true)

(deftest target-table-test
  (testing "GHY-4481: the database, schema, name, and extra conditions still select the Table"
    (mt/with-temp [:model/Database {db-id :id}       {}
                   :model/Table    {schema-table :id} {:db_id db-id :schema "PUBLIC" :name "orders" :active true}
                   :model/Table    {nil-table :id}    {:db_id db-id :schema nil :name "loose" :active false}]
      (is (= schema-table (:id (transforms-base.db/target-table db-id "PUBLIC" "orders"))))
      (testing "a nil schema matches a Table with no schema"
        (is (= nil-table (:id (transforms-base.db/target-table db-id nil "loose"))))
        (is (nil? (transforms-base.db/target-table db-id nil "orders"))))
      (testing "extra conditions"
        (is (= schema-table (:id (transforms-base.db/target-table db-id "PUBLIC" "orders" :active true))))
        (is (nil? (transforms-base.db/target-table db-id nil "loose" :active true))))
      (testing "SQL-looking schema and name strings match nothing"
        (is (nil? (transforms-base.db/target-table db-id "x' OR '1'='1" "orders")))
        (is (nil? (transforms-base.db/target-table db-id "PUBLIC" "x' OR '1'='1")))))))
