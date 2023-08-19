(ns metabase.driver.sql.mbql5
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql]
   [metabase.driver.sql.mbql5.query-processor :as sql.mbql5.qp]))

(comment metabase.driver.sql/keep-me)

(driver/register! :sql/mbql5 :parent :sql, :abstract? true)

(defmethod driver/mbql-version :sql/mbql5
  [_driver]
  5.0)

(defmethod driver/mbql->native :sql/mbql5
  [driver query]
  (sql.mbql5.qp/mbql->native driver query))
