(ns metabase.driver.hive-like-test
  (:require [expectations :refer [expect]]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]))

;; make sure the various types we use for running tests are actually mapped to the correct DB type
(expect :type/Text     (sql-jdbc.sync/database-type->base-type :hive-like :string))
(expect :type/Integer  (sql-jdbc.sync/database-type->base-type :hive-like :int))
(expect :type/Date     (sql-jdbc.sync/database-type->base-type :hive-like :date))
(expect :type/DateTime (sql-jdbc.sync/database-type->base-type :hive-like :timestamp))
(expect :type/Float    (sql-jdbc.sync/database-type->base-type :hive-like :double))
