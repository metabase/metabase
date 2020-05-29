(ns metabase.driver.sql.util.unprepare-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.util.date-2 :as u.date])
  (:import java.time.OffsetDateTime))

(deftest unprepare-string-test
  (testing "check simple unprepare with only one string arg"
    (is (= "SELECT count(*) FROM venues WHERE venues.name = 'Barney''s Beanery'"
           (unprepare/unprepare :sql
                                ["SELECT count(*) FROM venues WHERE venues.name = ?"
                                 "Barney's Beanery"]))))

  (testing "ok, try to trip it up -- multiple args: string, boolean, and date; `??` which should not be replaced by a value"
    (is (= "SELECT 'Cam''s Cool Toucan' FROM TRUE WHERE x ?? y AND z = timestamp with time zone '2017-01-01 00:00:00.000Z'"
           (unprepare/unprepare :sql
                                ["SELECT ? FROM ? WHERE x ?? y AND z = ?"
                                 "Cam's Cool Toucan"
                                 true
                                 (t/offset-date-time "2017-01-01T00:00:00.000Z")])))))

(driver/register! ::unprepare-test, :parent :sql, :abstract? true)

(defmethod unprepare/unprepare-value [::unprepare-test String]
  [_ value]
  (str \' (str/replace value "'" "\\'") \'))

(defmethod unprepare/unprepare-value [::unprepare-test OffsetDateTime]
  [_ t]
  (format "from_iso8601_timestamp('%s')" (u.date/format t)))

(deftest override-unprepare-test
  (testing "check that we can override methods for unpreparing values of specific classes"
    (is (= "SELECT 'Cam\\'s Cool Toucan' FROM TRUE WHERE x ?? y AND z = from_iso8601_timestamp('2017-01-01T00:00:00Z')"
           (unprepare/unprepare ::unprepare-test
                                ["SELECT ? FROM ? WHERE x ?? y AND z = ?"
                                 "Cam's Cool Toucan"
                                 true
                                 (t/offset-date-time "2017-01-01T00:00:00.000Z")])))))
