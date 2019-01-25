(ns metabase.driver.sql.util.unprepare-test
  (:require [expectations :refer [expect]]
            [metabase.driver.sql.util.unprepare :as unprepare]))

(expect
  "SELECT 'Cam\\'s Cool Toucan' FROM TRUE WHERE x ?? y AND z = timestamp('2017-01-01T00:00:00.000Z')"
  (unprepare/unprepare ["SELECT ? FROM ? WHERE x ?? y AND z = ?"
                        "Cam's Cool Toucan"
                        true
                        #inst "2017-01-01T00:00:00.000Z"]))

(expect
  "SELECT 'Cam''s Cool Toucan' FROM TRUE WHERE x ?? y AND z = from_iso8601_timestamp('2017-01-01T00:00:00.000Z')"
  (unprepare/unprepare ["SELECT ? FROM ? WHERE x ?? y AND z = ?"
                        "Cam's Cool Toucan"
                        true
                        #inst "2017-01-01T00:00:00.000Z"]
                       :quote-escape "'"
                       :iso-8601-fn  :from_iso8601_timestamp))
