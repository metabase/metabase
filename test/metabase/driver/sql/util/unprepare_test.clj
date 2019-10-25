(ns metabase.driver.sql.util.unprepare-test
  (:require [clojure.string :as str]
            [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.driver.sql.util.unprepare :as unprepare])
  (:import java.util.Date))

;; check simple unprepare with only one string arg
(expect
  "SELECT count(*) FROM venues WHERE venues.name = 'Barney''s Beanery'"
  (unprepare/unprepare :sql
    ["SELECT count(*) FROM venues WHERE venues.name = ?"
     "Barney's Beanery"]))

;; ok, thry to trip it up -- multiple args: string, boolean, and date; `??` which should not be replaced by a value
(expect
  "SELECT 'Cam''s Cool Toucan' FROM TRUE WHERE x ?? y AND z = timestamp('2017-01-01T00:00:00.000Z')"
  (unprepare/unprepare :sql
    ["SELECT ? FROM ? WHERE x ?? y AND z = ?"
     "Cam's Cool Toucan"
     true
     #inst "2017-01-01T00:00:00.000Z"]))

;; check that we can override methods for unpreparing values of specific classes
(driver/register! ::unprepare-test, :parent :sql, :abstract? true)

(defmethod unprepare/unprepare-value [::unprepare-test String] [_ value]
  (str \' (str/replace value "'" "\\\\'") \'))

(defmethod unprepare/unprepare-value [::unprepare-test Date] [_ value]
  (unprepare/unprepare-date-with-iso-8601-fn :from_iso8601_timestamp value))

(expect
  "SELECT 'Cam\\'s Cool Toucan' FROM TRUE WHERE x ?? y AND z = from_iso8601_timestamp('2017-01-01T00:00:00.000Z')"
  (unprepare/unprepare ::unprepare-test
    ["SELECT ? FROM ? WHERE x ?? y AND z = ?"
     "Cam's Cool Toucan"
     true
     #inst "2017-01-01T00:00:00.000Z"]))
