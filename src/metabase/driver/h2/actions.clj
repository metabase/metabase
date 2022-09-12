(ns metabase.driver.h2.actions
  "Method impls for [[metabase.driver.sql-jdbc.actions]] for `:h2`."
  (:require [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]))

(defmethod sql-jdbc.actions/base-type->sql-type-map :h2
  [_driver]
  {:type/BigInteger     "BIGINT"
   :type/Boolean        "BOOL"
   :type/Date           "DATE"
   :type/DateTime       "DATETIME"
   :type/DateTimeWithTZ "TIMESTAMP WITH TIME ZONE"
   :type/Decimal        "DECIMAL"
   :type/Float          "FLOAT"
   :type/Integer        "INTEGER"
   :type/Text           "VARCHAR"
   :type/Time           "TIME"})

;; H2 doesn't need to do anything special with nested transactions; the original transaction can proceed even if some
;; specific statement errored.
(defmethod sql-jdbc.actions/do-nested-transaction :h2
  [_driver _conn thunk]
  (thunk))
