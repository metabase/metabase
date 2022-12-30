(ns metabase.driver.sql.query-processor.empty-string-is-null
  "In Oracle and some other databases, empty strings are considered to be `NULL`, so `WHERE field = ''` is effectively
  the same as writing `WHERE field = NULL`, which of course is never true. This impl replaces empty-string values with
  `nil` so we generate correct SQL e.g. `WHERE field IS NOT NULL`. (See #13158)

  Drivers can derive from this abstract driver to use an alternate implementation(s) of SQL QP method(s) that treat
  empty strings as `nil`."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]))

(driver/register! ::empty-string-is-null, :abstract? true)

(defmethod sql.qp/->honeysql [::empty-string-is-null :value]
  [driver [_ value info]]
  (let [value (when-not (= value "")
                value)]
    ((get-method sql.qp/->honeysql [:sql :value]) driver [:value value info])))

(prefer-method sql.qp/->honeysql [::empty-string-is-null :value] [:sql :value])
