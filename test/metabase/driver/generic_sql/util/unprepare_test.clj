(ns metabase.driver.generic-sql.util.unprepare-test
  (:require [expectations :refer :all]
            [metabase.driver.generic-sql.util.unprepare :as unprepare]))

(expect
  "SELECT 'Cam\\'s Cool Toucan' FROM TRUE WHERE x ?? y AND z = timestamp('2017-01-01T00:00:00.000Z')"
  (unprepare/unprepare ["SELECT ? FROM ? WHERE x ?? y AND z = ?"
                        "Cam's Cool Toucan"
                        true
                        #inst "2017-01-01T00:00:00.000Z"]))
