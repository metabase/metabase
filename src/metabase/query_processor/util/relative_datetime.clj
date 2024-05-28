(ns metabase.query-processor.util.relative-datetime
  "Utility function for server side relative datetime computation."
  (:require
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.date-2 :as u.date]))

(defn- use-server-side-relative-datetime?
  "Check whether :relative-datetime clause could be computed server side. True for [[u.date/add-units]] greater than
   or equal to day."
  [unit]
  (contains? #{:day :week :month :quarter :year} unit))

(defn- relative-datetime-sql-str
  "Compute relative datetime from [[qp.timezone/now]] shifted by `unit` and `amount`. Format the resulting value
   to literal string compatible with most sql databases, to avoid possible jdbc driver timezone conversions."
  [unit amount]
  (-> (qp.timezone/now)
      (u.date/truncate unit)
      (u.date/add unit amount)
      (u.date/format-sql)))

;; NOTE: At the time of writing, we are supporting Snowflake and Redshift which could share the logic.
(defn maybe-cacheable-relative-datetime-honeysql
  "Return honeysql form for relative datetime clasue, that is cacheable -- values of `getdate` or `current_timestamp`
   are computed server side."
  [driver unit amount]
  (if (use-server-side-relative-datetime? unit)
    ;; In Snowflake, timestamp is user-specified alias to timestamp_ntz (default), timestamp_ltz or timestamp_tz.
    ;; For more info see the docs: https://docs.snowflake.com/en/sql-reference/data-types-datetime#timestamp
    ;; We do not have to care which timestamp is currently aliased, because [[relative-datetime-sql-str]]
    ;; generates the now timestamp in the same timezone as `current_timestamp` or `getdate` function would.
    [:cast (relative-datetime-sql-str unit amount) :timestamp]
    ((get-method sql.qp/->honeysql [:sql :relative-datetime]) driver [:relative-datetime amount unit])))
