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

(deftest dummy-wip-lineage-no-alias-test
  (mt/test-driver
    :postgres
    (let [sql "select subo.t + subo.st from (select total t, subtotal st from orders) subo"
          db (driver.sql/default-schema :postgres)
          catalog (dbname (mt/db))
          schema @(def ssx (sqlglot/schema (mt/id)))]
      (is (= {"summe" [["test-data" "public" "orders" "total"]
                       ["test-data" "public" "orders" "subtotal"]]}
             @(def gg (sqlglot/returned-columns-lineage :postgres sql catalog db schema)))))))

(deftest dummy-wip-lineage-test
  (mt/test-driver
    :postgres
    (let [sql "select subo.t + subo.st as summe from (select total t, subtotal st from orders) subo"
          db (driver.sql/default-schema :postgres)
          catalog (dbname (mt/db))
          schema @(def ssx (sqlglot/schema (mt/id)))]
      (is (= {"summe" [["test-data" "public" "orders" "total"]
                       ["test-data" "public" "orders" "subtotal"]]}
             @(def gg (sqlglot/returned-columns-lineage :postgres sql catalog db schema)))))))

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
