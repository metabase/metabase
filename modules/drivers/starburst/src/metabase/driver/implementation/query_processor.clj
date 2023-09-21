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
  (:require [honey.sql :as sql]
            [honey.sql.helpers :as sql.helpers]
            [java-time :as t]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util :as sql.u]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.query-processor.store :as qp.store]
            [metabase.lib.metadata :as lib.metadata]
            [metabase.util.date-2 :as u.date]
            [metabase.util.honey-sql-2 :as h2x])
    (:import [java.time OffsetDateTime ZonedDateTime]))

(def ^:private ^:const timestamp-with-time-zone-db-type "timestamp with time zone")

(defmethod sql.qp/honey-sql-version :starburst
  [_driver]
  2)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Misc Implementations                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/->float :starburst
  [_ value]
  (h2x/cast :double value))


(defn- format-mod
  [_fn [x y]]
  (let [[x-sql & x-args] (sql/format-expr x {:nested true})
        [y-sql & y-args] (sql/format-expr y {:nested true})]
    (into [(format "mod(%s, %s)" x-sql y-sql)]
          cat
          [x-args y-args])))

(sql/register-fn! ::mod #'format-mod)


(defmethod sql.qp/add-interval-honeysql-form :starburst
  [_ hsql-form amount unit]
  (let [type-info   (h2x/type-info hsql-form)
        out-form [:date_add (h2x/literal unit) [:inline amount] hsql-form]]
  (if (some? type-info)
    (h2x/with-type-info out-form type-info)
    out-form)))

(defmethod sql.qp/apply-top-level-clause [:starburst :page]
  [_ _ honeysql-query {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can simply use limit
      (sql.helpers/limit honeysql-query items)
      ;; if we need to do an offset we have to do nesting to generate a row number and where on that
      (let [over-clause (format "row_number() OVER (%s)"
                                (first (sql/format (select-keys honeysql-query [:order-by])
                                                    :allow-dashed-names? true
                                                    :quoting :ansi)))]
        (-> (apply sql.helpers/select (map last (:select honeysql-query)))
            (sql.helpers/from (sql.helpers/select honeysql-query [[:raw over-clause] :__rownum__]))
            (sql.helpers/where [:> :__rownum__ offset])
            (sql.helpers/limit items))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Temporal Casting                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/cast-temporal-string [:starburst :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_ _coercion-strategy expr]
  [:date_parse expr (h2x/literal "%Y%m%d%H%i%s")])

(defmethod sql.qp/cast-temporal-byte [:starburst :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal
                               [:from_utf8 expr]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Date Truncation                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- in-report-zone
  "Returns a HoneySQL form to interpret the `expr` (a temporal value) in the current report time zone, via Trino's
  `AT TIME ZONE` operator. See https://trino.io/docs/current/functions/datetime.html#time-zone-conversion"
  [expr]
  (let [report-zone (qp.timezone/report-timezone-id-if-supported :starburst (lib.metadata/database (qp.store/metadata-provider)))
        ;; if the expression itself has type info, use that, or else use a parent expression's type info if defined
        type-info   (h2x/type-info expr)
        db-type     (h2x/type-info->db-type type-info)]
    (if (and ;; AT TIME ZONE is only valid on these Trino types; if applied to something else (ex: `date`), then
             ;; an error will be thrown by the query analyzer
         (and db-type (re-find #"(?i)^time(?:stamp)?(?:\(\d+\))?(?: with time zone)?$" db-type))
             ;; if one has already been set, don't do so again
         (not (::in-report-zone? (meta expr)))
         report-zone)
      (-> (h2x/with-database-type-info (h2x/at-time-zone expr report-zone) timestamp-with-time-zone-db-type)
          (vary-meta assoc ::in-report-zone? true))
      expr)))

;; most date extraction and bucketing functions need to account for report timezone

(defmethod sql.qp/date [:starburst :default]
  [_ _ expr]
  expr)

(defmethod sql.qp/date [:starburst :second-of-minute]
  [_ _ expr]
  [:second (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :minute]
  [_ _ expr]
  [:date_trunc (h2x/literal :minute) (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :minute-of-hour]
  [_ _ expr]
  [:minute (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :hour]
  [_ _ expr]
  [:date_trunc (h2x/literal :hour) (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :hour-of-day]
  [_ _ expr]
  [:hour (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :day]
  [_ _ expr]
  [:date (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :day-of-week]
  [_ _ expr]
  (sql.qp/adjust-day-of-week :starburst [:day_of_week (in-report-zone expr)]))

(defmethod sql.qp/date [:starburst :day-of-month]
  [_ _ expr]
  [:day (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :day-of-year]
  [_ _ expr]
  [:day_of_year (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :week]
  [_ _ expr]
  (sql.qp/adjust-start-of-week :starburst (fn [expr] [:date_trunc (h2x/literal :week) (in-report-zone expr)]) expr))

(defmethod sql.qp/date [:starburst :week-of-year-iso]
  [_ _ expr]
  [:week (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :month]
  [_ _ expr]
  [:date_trunc (h2x/literal :month) (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :month-of-year]
  [_ _ expr]
  [:month (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :quarter]
  [_ _ expr]
  [:date_trunc (h2x/literal :quarter) (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :quarter-of-year]
  [_ _ expr]
  [:quarter (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :year]
  [_ _ expr]
  [:date_trunc (h2x/literal :year) (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :year-of-era]
  [_ _ expr]
  [:year (in-report-zone expr)])

(defmethod sql.qp/current-datetime-honeysql-form :starburst
  [_]
  ;; the current_timestamp in Starburst returns a `timestamp with time zone`, so this needs to be overridden
  (h2x/with-type-info :%now {::h2x/database-type timestamp-with-time-zone-db-type}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Custom HoneySQL Clause Impls                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/->honeysql [:starburst Boolean]
  [_ bool]
  [:raw (if bool "TRUE" "FALSE")])

(defmethod sql.qp/->honeysql [:starburst :regex-match-first]
  [driver [_ arg pattern]]
  [:regexp_extract (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)])

(defmethod sql.qp/->honeysql [:starburst :median]
  [driver [_ arg]]
  [:approx_percentile (sql.qp/->honeysql driver arg) 0.5])

(defmethod sql.qp/->honeysql [:starburst :percentile]
  [driver [_ arg p]]
  [:approx_percentile (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver p)])

(defmethod sql.qp/->honeysql [:starburst :log]
  [driver [_ field]]
  ;; recent Trino versions have a `log10` function (not `log`)
  [:log10 (sql.qp/->honeysql driver field)])

(defmethod sql.qp/->honeysql [:starburst :count-where]
  [driver [_ pred]]
  ;; Starburst will use the precision given here in the final expression, which chops off digits
  ;; need to explicitly provide two digits after the decimal
  (sql.qp/->honeysql driver [:sum-where 1.00M pred]))

(defmethod sql.qp/->honeysql [:starburst :time]
  [_ [_ t]]
  ;; Convert t to locale time, then format as sql. Then add cast.
  (h2x/cast :time (u.date/format-sql (t/local-time t))))

(defmethod sql.qp/->honeysql [:starburst ZonedDateTime]
  [_ ^ZonedDateTime t]
  ;; use the Trino cast to `timestamp with time zone` operation to interpret in the correct TZ, regardless of
  ;; connection zone
  (h2x/cast timestamp-with-time-zone-db-type (u.date/format-sql t)))

(defmethod sql.qp/->honeysql [:starburst OffsetDateTime]
  [_ ^OffsetDateTime t]
  ;; use the Trino cast to `timestamp with time zone` operation to interpret in the correct TZ, regardless of
  ;; connection zone
  (h2x/cast timestamp-with-time-zone-db-type (u.date/format-sql t)))

(defmethod sql.qp/unix-timestamp->honeysql [:starburst :seconds]
  [_ _ expr]
  (let [report-zone (qp.timezone/report-timezone-id-if-supported :starburst (lib.metadata/database (qp.store/metadata-provider)))]
    [:from_unixtime expr (h2x/literal (or report-zone "UTC"))]))

(defn- timestamp-with-time-zone? [expr]
  (let [type (h2x/database-type expr)]
    (and type (re-find #"(?i)^timestamp(?:\(\d+\))? with time zone$" type))))

(defn- ->timestamp-with-time-zone [expr]
  (if (timestamp-with-time-zone? expr)
    expr
    (h2x/cast timestamp-with-time-zone-db-type expr)))

(defn- ->at-time-zone [expr]
  (h2x/at-time-zone (->timestamp-with-time-zone expr) (qp.timezone/results-timezone-id)))

(doseq [unit [:year :quarter :month :week :day]]
  (defmethod sql.qp/datetime-diff [:starburst unit] [_driver unit x y]
    [:date_diff (h2x/literal unit)
     (h2x/->date (->at-time-zone x))
     (h2x/->date (->at-time-zone y))]))

(doseq [unit [:hour :minute :second]]
  (defmethod sql.qp/datetime-diff [:starburst unit] [_driver unit x y]
    [:date_diff (h2x/literal unit)
     (->at-time-zone x)
     (->at-time-zone y)]))

(defmethod sql.qp/->honeysql [:starburst :convert-timezone]
  [driver [_ arg target-timezone source-timezone]]
  (let [expr         (sql.qp/->honeysql driver (cond-> arg
                                                 (string? arg) u.date/parse))
        with_timezone? (h2x/is-of-type? expr #"(?i)^timestamp(?:\(\d+\))? with time zone$")
        _ (sql.u/validate-convert-timezone-args with_timezone? target-timezone source-timezone)
        expr [:at_timezone
                        (if with_timezone?
                          expr
                          [:with_timezone expr (or source-timezone (qp.timezone/results-timezone-id))])
                        target-timezone]]
    (h2x/with-database-type-info (h2x/->timestamp expr) "timestamp")))
