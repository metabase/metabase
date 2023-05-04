;;
;; Licensed under the Apache License, Version 2.0 (the "License");
;; you may not use this file except in compliance with the License.
;; You may obtain a copy of the License at

;;     http://www.apache.org/licenses/LICENSE-2.0

;; Unless required by applicable law or agreed to in writing, software
;; distributed under the License is distributed on an "AS IS" BASIS,
;; WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
;; See the License for the specific language governing permissions and
;; limitations under the License.
;;
(ns metabase.driver.implementation.query-processor  "Query processor implementations for Starburst driver."
  (:require [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [honeysql.helpers :as hh]
            [java-time :as t]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util :as sql.u]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.i18n :refer [tru]])
    (:import [java.time OffsetDateTime ZonedDateTime]))

(def ^:private ^:const timestamp-with-time-zone-db-type "timestamp with time zone")

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Misc Implementations                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/->float :starburst
  [_ value]
  (hx/cast :double value))

(defmethod hformat/fn-handler (u/qualified-name ::mod)
  [_ x y]
  ;; Trino mod is a function like mod(x, y) rather than an operator like x mod y
  (format "mod(%s, %s)" (hformat/to-sql x) (hformat/to-sql y)))

(defmethod sql.qp/add-interval-honeysql-form :starburst
  [_ hsql-form amount unit]
  (hsql/call :date_add (hx/literal unit) amount hsql-form))

(defmethod sql.qp/apply-top-level-clause [:starburst :page]
  [_ _ honeysql-query {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can simply use limit
      (hh/limit honeysql-query items)
      ;; if we need to do an offset we have to do nesting to generate a row number and where on that
      (let [over-clause (format "row_number() OVER (%s)"
                                (first (hsql/format (select-keys honeysql-query [:order-by])
                                                    :allow-dashed-names? true
                                                    :quoting :ansi)))]
        (-> (apply hh/select (map last (:select honeysql-query)))
            (hh/from (hh/merge-select honeysql-query [(hsql/raw over-clause) :__rownum__]))
            (hh/where [:> :__rownum__ offset])
            (hh/limit items))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Temporal Casting                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/cast-temporal-string [:starburst :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_ _coercion-strategy expr]
  (hsql/call :date_parse expr (hx/literal "%Y%m%d%H%i%s")))

(defmethod sql.qp/cast-temporal-byte [:starburst :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal
                               (hsql/call :from_utf8 expr)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Date Truncation                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defrecord AtTimeZone
  ;; record type to support applying Starburst's `AT TIME ZONE` operator to an expression
           [expr zone]
  hformat/ToSql
  (to-sql [_]
    (format "%s AT TIME ZONE %s"
            (hformat/to-sql expr)
            (hformat/to-sql (hx/literal zone)))))

(defn- in-report-zone
  "Returns a HoneySQL form to interpret the `expr` (a temporal value) in the current report time zone, via Trino's
  `AT TIME ZONE` operator. See https://trino.io/docs/current/functions/datetime.html#time-zone-conversion"
  [expr]
  (let [report-zone (qp.timezone/report-timezone-id-if-supported :starburst)
        ;; if the expression itself has type info, use that, or else use a parent expression's type info if defined
        type-info   (hx/type-info expr)
        db-type     (hx/type-info->db-type type-info)]
    (if (and ;; AT TIME ZONE is only valid on these Trino types; if applied to something else (ex: `date`), then
             ;; an error will be thrown by the query analyzer
         (and db-type (re-find #"(?i)^time(?:stamp)?(?:\(\d+\))?(?: with time zone)?$" db-type))
             ;; if one has already been set, don't do so again
         (not (::in-report-zone? (meta expr)))
         report-zone)
      (-> (hx/with-database-type-info (->AtTimeZone expr report-zone) timestamp-with-time-zone-db-type)
          (vary-meta assoc ::in-report-zone? true))
      expr)))

;; most date extraction and bucketing functions need to account for report timezone

(defmethod sql.qp/date [:starburst :default]
  [_ _ expr]
  expr)

(defmethod sql.qp/date [:starburst :second-of-minute]
  [_ _ expr]
  (hsql/call :second (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :minute]
  [_ _ expr]
  (hsql/call :date_trunc (hx/literal :minute) (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :minute-of-hour]
  [_ _ expr]
  (hsql/call :minute (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :hour]
  [_ _ expr]
  (hsql/call :date_trunc (hx/literal :hour) (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :hour-of-day]
  [_ _ expr]
  (hsql/call :hour (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :day]
  [_ _ expr]
  (hsql/call :date (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :day-of-week]
  [_ _ expr]
  (sql.qp/adjust-day-of-week :starburst (hsql/call :day_of_week (in-report-zone expr))))

(defmethod sql.qp/date [:starburst :day-of-month]
  [_ _ expr]
  (hsql/call :day (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :day-of-year]
  [_ _ expr]
  (hsql/call :day_of_year (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :week]
  [_ _ expr]
  (sql.qp/adjust-start-of-week :starburst (partial hsql/call :date_trunc (hx/literal :week)) (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :week-of-year-iso]
  [_ _ expr]
  (hsql/call :week (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :month]
  [_ _ expr]
  (hsql/call :date_trunc (hx/literal :month) (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :month-of-year]
  [_ _ expr]
  (hsql/call :month (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :quarter]
  [_ _ expr]
  (hsql/call :date_trunc (hx/literal :quarter) (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :quarter-of-year]
  [_ _ expr]
  (hsql/call :quarter (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :year]
  [_ _ expr]
  (hsql/call :date_trunc (hx/literal :year) (in-report-zone expr)))

(defmethod sql.qp/date [:starburst :year-of-era]
  [_ _ expr]
  (hsql/call :year (in-report-zone expr)))

(defmethod sql.qp/current-datetime-honeysql-form :starburst
  [_]
  ;; the current_timestamp in Starburst returns a `timestamp with time zone`, so this needs to be overridden
  (hx/with-type-info :%now {::hx/database-type timestamp-with-time-zone-db-type}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Custom HoneySQL Clause Impls                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/->honeysql [:starburst Boolean]
  [_ bool]
  (hsql/raw (if bool "TRUE" "FALSE")))

(defmethod sql.qp/->honeysql [:starburst :regex-match-first]
  [driver [_ arg pattern]]
  (hsql/call :regexp_extract (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)))

(defmethod sql.qp/->honeysql [:starburst :median]
  [driver [_ arg]]
  (hsql/call :approx_percentile (sql.qp/->honeysql driver arg) 0.5))

(defmethod sql.qp/->honeysql [:starburst :percentile]
  [driver [_ arg p]]
  (hsql/call :approx_percentile (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver p)))

(defmethod sql.qp/->honeysql [:starburst :log]
  [driver [_ field]]
  ;; recent Trino versions have a `log10` function (not `log`)
  (hsql/call :log10 (sql.qp/->honeysql driver field)))

(defmethod sql.qp/->honeysql [:starburst :count-where]
  [driver [_ pred]]
  ;; Starburst will use the precision given here in the final expression, which chops off digits
  ;; need to explicitly provide two digits after the decimal
  (sql.qp/->honeysql driver [:sum-where 1.00M pred]))

(defmethod sql.qp/->honeysql [:starburst :time]
  [_ [_ t]]
  ;; Convert t to locale time, then format as sql. Then add cast.
  (hx/cast :time (u.date/format-sql (t/local-time t))))

(defmethod sql.qp/->honeysql [:starburst ZonedDateTime]
  [_ ^ZonedDateTime t]
  ;; use the Trino cast to `timestamp with time zone` operation to interpret in the correct TZ, regardless of
  ;; connection zone
  (hx/cast timestamp-with-time-zone-db-type (u.date/format-sql t)))

(defmethod sql.qp/->honeysql [:starburst OffsetDateTime]
  [_ ^OffsetDateTime t]
  ;; use the Trino cast to `timestamp with time zone` operation to interpret in the correct TZ, regardless of
  ;; connection zone
  (hx/cast timestamp-with-time-zone-db-type (u.date/format-sql t)))

(defmethod sql.qp/unix-timestamp->honeysql [:starburst :seconds]
  [_ _ expr]
  (let [report-zone (qp.timezone/report-timezone-id-if-supported :starburst)]
    (hsql/call :from_unixtime expr (hx/literal (or report-zone "UTC")))))

(defn- safe-datetime [x]
  (cond
    (nil? x) x
    (= (type x) java.time.LocalDate) (hx/->timestamp x)
    (= (keyword (hx/type-info->db-type (hx/type-info x))) :date) (hx/->timestamp x)
    :else x))

(defmethod sql.qp/->honeysql [:starburst :datetime-diff]
  [driver [_ x y unit]]
  (let [x (sql.qp/->honeysql driver x)
        y (sql.qp/->honeysql driver y)
        disallowed-types (keep
                          (fn [v]
                            (when-let [db-type (keyword (hx/type-info->db-type (hx/type-info v)))]
                              (let [base-type (sql-jdbc.sync/database-type->base-type driver db-type)]
                                (when-not (some #(isa? base-type %) [:type/Date :type/DateTime])
                                  (name db-type)))))
                          [x y])]
    (when (seq disallowed-types)
      (throw (ex-info (tru "Only datetime, timestamp, or date types allowed. Found {0}"
                           (pr-str disallowed-types))
                      {:found disallowed-types
                       :type  qp.error-type/invalid-query})))
    (case unit
      (:year :quarter :month :week :day)
      (let [x-date (hsql/call :date (->AtTimeZone (safe-datetime x) (qp.timezone/results-timezone-id)))
            y-date (hsql/call :date (->AtTimeZone (safe-datetime y) (qp.timezone/results-timezone-id)))]
        (hsql/call :date_diff (hx/literal unit) x-date y-date))

      (:hour :minute :second)
      (hsql/call :date_diff (hx/literal unit) x y))))

(defmethod sql.qp/->honeysql [:starburst :convert-timezone]
  [driver [_ arg target-timezone source-timezone]]
  (let [expr         (sql.qp/->honeysql driver (cond-> arg
                                                 (string? arg) u.date/parse))
        with_timezone? (hx/is-of-type? expr #"(?i)^timestamp(?:\(\d+\))? with time zone$")
        _ (sql.u/validate-convert-timezone-args with_timezone? target-timezone source-timezone)
        expr (hsql/call :at_timezone
                        (if with_timezone?
                          expr
                          (hsql/call :with_timezone expr (or source-timezone (qp.timezone/results-timezone-id))))
                        target-timezone)]
    (hx/with-database-type-info (hx/->timestamp expr) "timestamp")))