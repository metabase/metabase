(ns metabase.query-processor.util.relative-datetime
  "Utility function for server side relative datetime computation."
  (:require
   [java-time.api :as t]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]))

(defn- use-server-side-relative-datetime?
  "Check whether :relative-datetime clause could be computed server side. True for [[u.date/add-units]] greater than
   or equal to day."
  [unit]
  (contains? #{:day :week :month :quarter :year} unit))

(defn- maybe-truncate-dt-value
  [dt col-base-type]
  (condp #(isa? %2 %1) col-base-type
    :type/DateTimeWithTZ dt
    :type/DateTime       (t/local-date-time dt)
    :type/Date           (t/local-date dt)))

(defn- relative-datetime-sql-str
  "Compute relative datetime from [[qp.timezone/now]] shifted by `unit` and `amount`. Format the resulting value
   to literal string compatible with most sql databases, to avoid possible jdbc driver timezone conversions."
  [unit amount base-type]
  (-> (qp.timezone/now)
      (u.date/truncate unit)
      (u.date/add unit amount)
      (maybe-truncate-dt-value base-type)
      (u.date/format-sql)))

(defn maybe-cacheable-relative-datetime-honeysql
  "Return honeysql form for relative datetime clasue, that is cacheable -- values of `getdate` or `current_timestamp`
   are computed server side.

  Adjust the values to type of the column that is used in comparison to relative-datetime using `database-type` and
  `base-type`. When values are not present, use sane defaults."
  [driver unit amount
   & {:keys [base-type database-type]
      :or {base-type     :type/DateTimeWithTZ
           database-type "timestamp"}}]
  (if (use-server-side-relative-datetime? unit)
    (h2x/cast database-type (relative-datetime-sql-str unit amount base-type))
    ((get-method sql.qp/->honeysql [:sql :relative-datetime]) driver [:relative-datetime amount unit])))
