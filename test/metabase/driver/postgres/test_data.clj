(ns metabase.driver.postgres.test-data
  (:require [metabase.driver.sql.test-data :as sql.test-data]))

(defmethod sql.test-data/primary-key-sql-type :postgres
  [_driver]
  "SERIAL")
