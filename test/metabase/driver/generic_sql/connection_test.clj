(ns metabase.driver.generic-sql.connection-test
  (:require [expectations :refer :all]
            [metabase.db :refer [sel]]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql.connection :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.test-data :refer :all]))

;; ## TESTS FOR CAN-CONNECT?

;; Check that we can connect to the Test DB
(expect true
  (driver/can-connect? @test-db))

;; Lie and say Test DB is Postgres. CAN-CONNECT? should fail
(expect false
  (driver/can-connect? (assoc @test-db :engine :postgres)))

;; Random made-up DBs should fail
(expect false
  (driver/can-connect? {:engine :postgres
                 :details {:conn_str "host=localhost port=5432 dbname=ABCDEFGHIJKLMNOP user=rasta"}}))

;; Things that you can connect to, but are not DBs, should fail
(expect false
  (driver/can-connect? {:engine :postgres
                 :details {:conn_str "host=google.com port=80"}}))
