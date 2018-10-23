(ns metabase.driver.generic-sql.connection-test
  (:require [expectations :refer :all]
            [metabase.driver :as driver]
            [metabase.test.data :refer :all]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.util :as tu]))

;; ## TESTS FOR CAN-CONNECT?

;; Check that we can connect to the Test DB
(expect
  true
  (driver/can-connect-with-details? :h2 (:details (db))))

;; Ehe following tests only run for Postgres. Maybe we should rewrite them so they work with H2.

;; Lie and say Test DB is Postgres. CAN-CONNECT? should fail
(datasets/expect-with-engine :postgres
  false
  (tu/suppress-output
    (driver/can-connect-with-details? :postgres (:details (db)))))

;; Random made-up DBs should fail
(datasets/expect-with-engine :postgres
  false
  (tu/suppress-output
    (driver/can-connect-with-details? :postgres {:host "localhost", :port 5432, :dbname "ABCDEFGHIJKLMNOP", :user "rasta"})))

;; Things that you can connect to, but are not DBs, should fail
(datasets/expect-with-engine :postgres
  false
  (tu/suppress-output
    (driver/can-connect-with-details? :postgres {:host "google.com", :port 80})))
