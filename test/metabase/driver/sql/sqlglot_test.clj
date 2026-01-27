(ns
 ^{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
 metabase.driver.sql.sqlglot-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql.sqlglot :as sqlglot]
   [metabase.test :as mt]))

;; TODO: Figure out the cannonical way or remove dep on name.
(defn dbname [db]
  ((some-fn (comp :database-source-dataset-name :settings)
            :name)
   db))

(deftest referenced-tables-003-test
  (mt/test-driver
    :postgres
    (let [sql "with ahoj as (select * from orders ounou) select * from ahoj"
          db (driver.sql/default-schema :postgres)
          catalog (dbname (mt/db))]
      (is (=  #{["test-data" "public" "orders"]}
              (set (sqlglot/referenced-tables :postgres sql catalog db)))))))

(deftest referenced-tables-002-test
  (mt/test-driver
    :postgres
    (let [sql "select * from orders ounou"
          db (driver.sql/default-schema :postgres)
          catalog (dbname (mt/db))]
      (is (=  #{["test-data" "public" "orders"]}
              (set (sqlglot/referenced-tables :postgres sql catalog db)))))))

(deftest referenced-tables-001-test
  (mt/test-driver
    :postgres
    (let [sql "select * from orders"
          db (driver.sql/default-schema :postgres)
          catalog (dbname (mt/db))]
      (is (=  #{["test-data" "public" "orders"]}
              (set (sqlglot/referenced-tables :postgres sql catalog db)))))))
