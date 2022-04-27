(ns metabase.driver.sql-jdbc.execute.old-impl
  "Deprecated [[metabase.driver.sql-jdbc.execute]] methods."
  (:require [metabase.driver :as driver]))



(defmethod set-timezone-sql :sql-jdbc [_] nil)
