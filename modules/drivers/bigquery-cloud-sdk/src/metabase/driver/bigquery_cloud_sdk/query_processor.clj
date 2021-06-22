(ns metabase.driver.bigquery-cloud-sdk.query-processor
  (:require [buddy.core.codecs :as codecs]
            [buddy.core.hash :as hash]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [honeysql.helpers :as h]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql :as sql]
            [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.field :refer [Field]]
            [metabase.models.setting :as setting]
            [metabase.models.table :as table]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import [com.google.cloud.bigquery Field$Mode FieldValue]
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           metabase.driver.common.parameters.FieldFilter
           metabase.util.honeysql_extensions.Identifier))

;; TODO -- I think this only applied to Fields now -- see
;; https://cloud.google.com/bigquery/docs/reference/standard-sql/data-definition-language. It definitely doesn't apply
;; to Tables. Not sure about project/dataset identifiers.
(defn- valid-bigquery-identifier?
  "Is String `s` a valid BigQuery identifier? Identifiers are only allowed to contain letters, numbers, and underscores;
  cannot start with a number; and can be at most 128 characters long."
  [s]
  (boolean
   (and (string? s)
        (re-matches #"^([a-zA-Z_][a-zA-Z_0-9]*){1,128}$" s))))

(def ^:private BigQueryIdentifierString
  (s/pred valid-bigquery-identifier? "Valid BigQuery identifier"))

(s/defn ^:private dataset-name-for-current-query :- BigQueryIdentifierString
  "Fetch the dataset name for the database associated with this query, needed because BigQuery requires you to qualify
  identifiers with it. This is primarily called automatically for the `to-sql` implementation of the
  `BigQueryIdentifier` record type; see its definition for more details."
  []
  (when (qp.store/initialized?)
    (some-> (qp.store/database) :details :dataset-id)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Running Queries & Parsing Results                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti parse-result-of-type
  "Parse the values that come back in results of a BigQuery query based on their column type."
  {:arglists '([column-type column-mode timezone-id v])}
  (fn [column-type _ _ _] column-type))

(defn- parse-value
  [column-mode v parse-fn]
  ;; For results from a query like `SELECT [1,2]`, BigQuery sets the column-mode to `REPEATED` and wraps the column in an ArrayList,
  ;; with ArrayMap entries, like: `ArrayList(ArrayMap("v", 1), ArrayMap("v", 2))`
  (cond
    (= "REPEATED" column-mode) ; legacy API
    (for [result v
          ^java.util.Map$Entry entry result]
      (parse-fn (.getValue entry)))

    (= Field$Mode/REPEATED column-mode) ; newer API
    (for [^FieldValue arr-v v]
      (parse-fn (.getValue arr-v)))

    :else
    (parse-fn v)))

(defmethod parse-result-of-type :default
  [_ column-mode _ v]
  (parse-value column-mode v identity))

(defmethod parse-result-of-type "BOOLEAN"
  [_ column-mode _ v]
  (parse-value column-mode v #(Boolean/parseBoolean %)))

(defmethod parse-result-of-type "FLOAT"
  [_ column-mode _ v]
  (parse-value column-mode v #(Double/parseDouble %)))

(defmethod parse-result-of-type "INTEGER"
  [_ column-mode _ v]
  (parse-value column-mode v #(Long/parseLong %)))

(defmethod parse-result-of-type "NUMERIC"
  [_ column-mode _ v]
  (parse-value column-mode v bigdec))

(defn- parse-timestamp-str [timezone-id s]
  ;; Timestamp strings either come back as ISO-8601 strings or Unix timestamps in µs, e.g. "1.3963104E9"
  (log/tracef "Parse timestamp string '%s' (default timezone ID = %s)" s timezone-id)
  (if-let [seconds (u/ignore-exceptions (Double/parseDouble s))]
    (t/zoned-date-time (t/instant (* seconds 1000)) (t/zone-id timezone-id))
    (u.date/parse s timezone-id)))

(defmethod parse-result-of-type "DATE"
  [_ column-mode timezone-id v]
  (parse-value column-mode v (partial parse-timestamp-str timezone-id)))

(defmethod parse-result-of-type "DATETIME"
  [_ column-mode timezone-id v]
  (parse-value column-mode v (partial parse-timestamp-str timezone-id)))

(defmethod parse-result-of-type "TIMESTAMP"
  [_ column-mode timezone-id v]
  (parse-value column-mode v (partial parse-timestamp-str timezone-id)))

(defmethod parse-result-of-type "TIME"
  [_ column-mode timezone-id v]
  (parse-value column-mode v (fn [v] (u.date/parse v timezone-id))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               SQL Driver Methods                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private temporal-type-hierarchy
  (-> (make-hierarchy)
      (derive :date :temporal-type)
      (derive :time :temporal-type)
      (derive :datetime :temporal-type)
      ;; timestamp = datetime with a timezone
      (derive :timestamp :temporal-type)))

(defmulti ^:private temporal-type
  {:arglists '([x])}
  mbql.u/dispatch-by-clause-name-or-class
  :hierarchy #'temporal-type-hierarchy)

(defmethod temporal-type LocalDate      [_] :date)
(defmethod temporal-type LocalTime      [_] :time)
(defmethod temporal-type OffsetTime     [_] :time)
(defmethod temporal-type LocalDateTime  [_] :datetime)
(defmethod temporal-type OffsetDateTime [_] :timestamp)
(defmethod temporal-type ZonedDateTime  [_] :timestamp)

(defn- base-type->temporal-type [base-type]
  (condp #(isa? %2 %1) base-type
    :type/Date           :date
    :type/Time           :time
    :type/DateTimeWithTZ :timestamp
    :type/DateTime       :datetime
    nil))

(defmethod temporal-type (class Field)
  [{base-type :base_type, effective-type :effective_type, database-type :database_type}]
  (case database-type
    "TIMESTAMP" :timestamp
    "DATETIME"  :datetime
    "DATE"      :date
    "TIME"      :time
    (base-type->temporal-type (or effective-type base-type))))

(defmethod temporal-type :absolute-datetime
  [[_ t _]]
  (temporal-type t))

(defmethod temporal-type :time
  [_]
  :time)

(defmethod temporal-type :field
  [[_ id-or-name {:keys [base-type temporal-unit], :as opts} :as clause]]
  (cond
    (contains? (meta clause) :bigquery-cloud-sdk/temporal-type)
    (:bigquery-cloud-sdk/temporal-type (meta clause))

    ;; date extraction operations result in integers, so the type of the expression shouldn't be a temporal type
    ;;
    ;; `:year` is both an extract unit and a truncate unit in terms of `u.date` capabilities, but in MBQL it should be a
    ;; truncation operation
    ((disj u.date/extract-units :year) temporal-unit)
    nil

    (integer? id-or-name)
    (temporal-type (qp.store/field id-or-name))

    base-type
    (base-type->temporal-type base-type)))

(defmethod temporal-type :default
  [x]
  (:bigquery-cloud-sdk/temporal-type (meta x)))

(defn- with-temporal-type {:style/indent 0} [x new-type]
  (if (= (temporal-type x) new-type)
    x
    (vary-meta x assoc :bigquery-cloud-sdk/temporal-type new-type)))

(defmulti ^:private ->temporal-type
  "Coerce `x` to target temporal type."
  {:arglists '([target-type x])}
  (fn [target-type x]
    [target-type (mbql.u/dispatch-by-clause-name-or-class x)])
  :hierarchy #'temporal-type-hierarchy)

(defn- throw-unsupported-conversion [from to]
  (throw (ex-info (tru "Cannot convert a {0} to a {1}" from to)
           {:type error-type/invalid-query})))

(defmethod ->temporal-type [:date LocalTime]           [_ t] (throw-unsupported-conversion "time" "date"))
(defmethod ->temporal-type [:date OffsetTime]          [_ t] (throw-unsupported-conversion "time" "date"))
(defmethod ->temporal-type [:date LocalDate]           [_ t] t)
(defmethod ->temporal-type [:date LocalDateTime]       [_ t] (t/local-date t))
(defmethod ->temporal-type [:date OffsetDateTime]      [_ t] (t/local-date t))
(defmethod ->temporal-type [:date ZonedDateTime]       [_ t] (t/local-date t))

(defmethod ->temporal-type [:time LocalTime]           [_ t] t)
(defmethod ->temporal-type [:time OffsetTime]          [_ t] (t/local-time t))
(defmethod ->temporal-type [:time LocalDate]           [_ t] (throw-unsupported-conversion "date" "time"))
(defmethod ->temporal-type [:time LocalDateTime]       [_ t] (t/local-time t))
(defmethod ->temporal-type [:time OffsetDateTime]      [_ t] (t/local-time t))
(defmethod ->temporal-type [:time ZonedDateTime]       [_ t] (t/local-time t))

(defmethod ->temporal-type [:datetime LocalTime]       [_ t] (throw-unsupported-conversion "time" "datetime"))
(defmethod ->temporal-type [:datetime OffsetTime]      [_ t] (throw-unsupported-conversion "time" "datetime"))
(defmethod ->temporal-type [:datetime LocalDate]       [_ t] (t/local-date-time t (t/local-time 0)))
(defmethod ->temporal-type [:datetime LocalDateTime]   [_ t] t)
(defmethod ->temporal-type [:datetime OffsetDateTime]  [_ t] (t/local-date-time t))
(defmethod ->temporal-type [:datetime ZonedDateTime]   [_ t] (t/local-date-time t))

;; Not sure whether we should be converting local dates/datetimes to ones with UTC timezone or with the report timezone?
(defmethod ->temporal-type [:timestamp LocalTime]      [_ t] (throw-unsupported-conversion "time" "timestamp"))
(defmethod ->temporal-type [:timestamp OffsetTime]     [_ t] (throw-unsupported-conversion "time" "timestamp"))
(defmethod ->temporal-type [:timestamp LocalDate]      [_ t] (t/zoned-date-time t (t/local-time 0) (t/zone-id "UTC")))
(defmethod ->temporal-type [:timestamp LocalDateTime]  [_ t] (t/zoned-date-time t (t/zone-id "UTC")))
(defmethod ->temporal-type [:timestamp OffsetDateTime] [_ t] t)
(defmethod ->temporal-type [:timestamp ZonedDateTime]  [_ t] t)

(defmethod ->temporal-type :default
  [target-type x]
  (cond
    (nil? x)
    nil

    (= (temporal-type x) target-type)
    (with-temporal-type x target-type)

    :else
    (let [hsql-form     (sql.qp/->honeysql :bigquery-cloud-sdk x)
          bigquery-type (case target-type
                          :date      :date
                          :time      :time
                          :datetime  :datetime
                          :timestamp :timestamp
                          nil)]
      (cond
        (nil? hsql-form)
        nil

        (= (temporal-type hsql-form) target-type)
        (with-temporal-type hsql-form target-type)

        bigquery-type
        (do
          (log/tracef "Coercing %s (temporal type = %s) to %s" (binding [*print-meta* true] (pr-str x)) (pr-str (temporal-type x)) bigquery-type)
          (with-temporal-type (hsql/call :cast (sql.qp/->honeysql :bigquery-cloud-sdk x) (hsql/raw (name bigquery-type))) target-type))

        :else
        x))))

(defmethod ->temporal-type [:temporal-type :absolute-datetime]
  [target-type [_ t unit]]
  [:absolute-datetime (->temporal-type target-type t) unit])

(def ^:private temporal-type->supported-units
  {:timestamp #{:microsecond :millisecond :second :minute :hour :day}
   :datetime  #{:microsecond :millisecond :second :minute :hour :day :week :month :quarter :year}
   :date      #{:day :week :month :quarter :year}
   :time      #{:microsecond :millisecond :second :minute :hour}})

(defmethod ->temporal-type [:temporal-type :relative-datetime]
  [target-type [_ _ unit :as clause]]
  {:post [(= target-type (temporal-type %))]}
  (with-temporal-type
    ;; check and see whether we need to do a conversion. If so, use the parent method which will just wrap this in a
    ;; cast statement.
    (if ((temporal-type->supported-units target-type) unit)
      clause
      ((get-method ->temporal-type :default) target-type clause))
    target-type))

(defrecord ^:private TruncForm [hsql-form unit]
  hformat/ToSql
  (to-sql [_]
    (let [t (or (temporal-type hsql-form) :datetime)
          f (case t
              :date      :date_trunc
              :time      :time_trunc
              :datetime  :datetime_trunc
              :timestamp :timestamp_trunc)]
      (hformat/to-sql (hsql/call f (->temporal-type t hsql-form) (hsql/raw (name unit)))))))

(defmethod temporal-type TruncForm
  [trunc-form]
  (temporal-type (:hsql-form trunc-form)))

(defmethod ->temporal-type [:temporal-type TruncForm]
  [target-type trunc-form]
  (map->TruncForm (update trunc-form :hsql-form (partial ->temporal-type target-type))))

(defn- trunc
  "Generate a SQL call an appropriate truncation function, depending on the temporal type of `expr`."
  [unit hsql-form]
  (TruncForm. hsql-form unit))

(def ^:private valid-date-extract-units
  #{:dayofweek :day :dayofyear :week :isoweek :month :quarter :year :isoyear})

(def ^:private valid-time-extract-units
  #{:microsecond :millisecond :second :minute :hour})

(defn- extract [unit expr]
  (condp = (temporal-type expr)
    :time
    (do
      (assert (valid-time-extract-units unit)
              (tru "Cannot extract {0} from a TIME field" unit))
      (recur unit (with-temporal-type (hsql/call :timestamp (hsql/call :datetime "1970-01-01" expr))
                                      :timestamp)))

    ;; timestamp and date both support extract()
    :date
    (do
      (assert (valid-date-extract-units unit)
              (tru "Cannot extract {0} from a DATE field" unit))
      (with-temporal-type (hsql/call :extract unit expr) nil))

    :timestamp
    (do
      (assert (or (valid-date-extract-units unit)
                  (valid-time-extract-units unit))
              (tru "Cannot extract {0} from a DATETIME or TIMESTAMP" unit))
      (with-temporal-type (hsql/call :extract unit expr) nil))

    ;; for datetimes or anything without a known temporal type, cast to timestamp and go from there
    (recur unit (->temporal-type :timestamp expr))))

(defmethod sql.qp/date [:bigquery-cloud-sdk :minute]          [_ _ expr] (trunc   :minute    expr))
(defmethod sql.qp/date [:bigquery-cloud-sdk :minute-of-hour]  [_ _ expr] (extract :minute    expr))
(defmethod sql.qp/date [:bigquery-cloud-sdk :hour]            [_ _ expr] (trunc   :hour      expr))
(defmethod sql.qp/date [:bigquery-cloud-sdk :hour-of-day]     [_ _ expr] (extract :hour      expr))
(defmethod sql.qp/date [:bigquery-cloud-sdk :day]             [_ _ expr] (trunc   :day       expr))
(defmethod sql.qp/date [:bigquery-cloud-sdk :day-of-month]    [_ _ expr] (extract :day       expr))
(defmethod sql.qp/date [:bigquery-cloud-sdk :day-of-year]     [_ _ expr] (extract :dayofyear expr))
(defmethod sql.qp/date [:bigquery-cloud-sdk :month]           [_ _ expr] (trunc   :month     expr))
(defmethod sql.qp/date [:bigquery-cloud-sdk :month-of-year]   [_ _ expr] (extract :month     expr))
(defmethod sql.qp/date [:bigquery-cloud-sdk :quarter]         [_ _ expr] (trunc   :quarter   expr))
(defmethod sql.qp/date [:bigquery-cloud-sdk :quarter-of-year] [_ _ expr] (extract :quarter   expr))
(defmethod sql.qp/date [:bigquery-cloud-sdk :year]            [_ _ expr] (trunc   :year      expr))

;; BigQuery mod is a function like mod(x, y) rather than an operator like x mod y
(defmethod hformat/fn-handler (u/qualified-name ::mod)
  [_ x y]
  (format "mod(%s, %s)" (hformat/to-sql x) (hformat/to-sql y)))

(defmethod sql.qp/date [:bigquery-cloud-sdk :day-of-week]
  [driver _ expr]
  (sql.qp/adjust-day-of-week
   driver
   (extract :dayofweek expr)
   (driver.common/start-of-week-offset driver)
   (partial hsql/call (u/qualified-name ::mod))))

(defmethod sql.qp/date [:bigquery-cloud-sdk :week]
  [_ _ expr]
  (trunc (keyword (format "week(%s)" (name (setting/get-keyword :start-of-week)))) expr))

(doseq [[unix-timestamp-type bigquery-fn] {:seconds      :timestamp_seconds
                                           :milliseconds :timestamp_millis
                                           :microseconds :timestamp_micros}]
  (defmethod sql.qp/unix-timestamp->honeysql [:bigquery-cloud-sdk unix-timestamp-type]
    [_ _ expr]
    (with-temporal-type (hsql/call bigquery-fn expr) :timestamp)))

(defmethod sql.qp/->float :bigquery-cloud-sdk
  [_ value]
  (hx/cast :float64 value))

(defmethod sql.qp/->honeysql [:bigquery-cloud-sdk :regex-match-first]
  [driver [_ arg pattern]]
  (hsql/call :regexp_extract (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)))

(defn- percentile->quantile
  [x]
  (loop [x     (double x)
         power (int 0)]
    (if (zero? (- x (Math/floor x)))
      [(Math/round x) (Math/round (Math/pow 10 power))]
      (recur (* 10 x) (inc power)))))

(defmethod sql.qp/->honeysql [:bigquery-cloud-sdk :percentile]
  [driver [_ arg p]]
  (let [[offset quantiles] (percentile->quantile p)]
    (hsql/raw (format "APPROX_QUANTILES(%s, %s)[OFFSET(%s)]"
                      (hformat/to-sql (sql.qp/->honeysql driver arg))
                      quantiles
                      offset))))

(defmethod sql.qp/->honeysql [:bigquery-cloud-sdk :median]
  [driver [_ arg]]
  (sql.qp/->honeysql driver [:percentile arg 0.5]))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Query Processor                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- should-qualify-identifier?
  "Should we qualify an Identifier with the dataset name?

  Table & Field identifiers (usually) need to be qualified with the current dataset name; this needs to be part of the
  table e.g.

    `table`.`field` -> `dataset.table`.`field`"
  [{:keys [identifier-type components] :as identifier}]
  (cond
    (::already-qualified? (meta identifier))
    false

    ;; If we're currently using a Table alias, don't qualify the alias with the dataset name
    sql.qp/*table-alias*
    false

    ;; otherwise always qualify Table identifiers
    (= identifier-type :table)
    true

    ;; Only qualify Field identifiers that are qualified by a Table. (e.g. don't qualify stuff inside `CREATE TABLE`
    ;; DDL statements)
    (and (= identifier-type :field)
         (>= (count components) 2))
    true))

(defmethod sql.qp/cast-temporal-string [:bigquery-cloud-sdk :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  (hsql/call :parse_datetime (hx/literal "%Y%m%d%H%M%S") expr))

(defmethod sql.qp/->honeysql [:bigquery-cloud-sdk (class Field)]
  [driver field]
  (let [parent-method (get-method sql.qp/->honeysql [:sql (class Field)])
        identifier    (parent-method driver field)]
    (with-temporal-type identifier (temporal-type field))))

(defmethod sql.qp/->honeysql [:bigquery-cloud-sdk Identifier]
  [_ identifier]
  (if-not (should-qualify-identifier? identifier)
    identifier
    (-> identifier
        (update :components (fn [[table & more]]
                              (cons (str (dataset-name-for-current-query) \. table)
                                    more)))
        (vary-meta assoc ::already-qualified? true))))

(defmethod sql.qp/->honeysql [:bigquery-cloud-sdk :field]
  [driver clause]
  (let [hsql-form ((get-method sql.qp/->honeysql [:sql :field]) driver clause)]
    (with-temporal-type hsql-form (temporal-type clause))))

(defmethod sql.qp/->honeysql [:bigquery-cloud-sdk :relative-datetime]
  [driver clause]
  ;; wrap the parent method, converting the result if `clause` itself is typed
  (let [t (temporal-type clause)]
    (cond->> ((get-method sql.qp/->honeysql [:sql :relative-datetime]) driver clause)
      t (->temporal-type t))))

(defn- short-string-hash
  "Create a 8-character hash of string `s` to be used as a unique suffix for Field identifiers that could otherwise be
  ambiguous. For example, `résumé` and `resume` are both valid *table* names, but after converting these to valid
  *field* identifiers for use as field aliases, we'd end up with `resume_id` for `id` regardless of which table it
  came from. By appending a unique hash to the generated identifier, we can distinguish the two."
  [s]
  (str/join (take 8 (codecs/bytes->hex (hash/md5 s)))))

(defn- substring-first-n-characters
  "Return substring of `s` with just the first `n` characters."
  [s n]
  (subs s 0 (min n (count s))))

(defn- ->valid-field-identifier
  "Convert field alias `s` to a valid BigQuery field identifier. From the dox: Fields must contain only letters,
  numbers, and underscores, start with a letter or underscore, and be at most 128 characters long."
  [s]
  (let [replaced-str (-> (str/trim s)
                         u/remove-diacritical-marks
                         (str/replace #"[^\w\d_]" "_")
                         (str/replace #"(^\d)" "_$1")
                         (substring-first-n-characters 128))]
    (if (= s replaced-str)
      s
      ;; if we've done any sort of transformations to the string, append a short hash to the string so it's unique
      ;; when compared to other strings that may have normalized to the same thing.
      (str (substring-first-n-characters replaced-str 119) \_ (short-string-hash s)))))

(defmethod driver/format-custom-field-name :bigquery-cloud-sdk
  [_ custom-field-name]
  (->valid-field-identifier custom-field-name))

(defmethod sql.qp/field->alias :bigquery-cloud-sdk
  [driver field]
  (->valid-field-identifier ((get-method sql.qp/field->alias :sql) driver field)))

(defmethod sql.qp/prefix-field-alias :bigquery-cloud-sdk
  [driver prefix field-alias]
  (let [s ((get-method sql.qp/prefix-field-alias :sql) driver prefix field-alias)]
    (->valid-field-identifier s)))

;; See:
;;
;; *  https://cloud.google.com/bigquery/docs/reference/standard-sql/timestamp_functions
;; *  https://cloud.google.com/bigquery/docs/reference/standard-sql/time_functions
;; *  https://cloud.google.com/bigquery/docs/reference/standard-sql/date_functions
;; *  https://cloud.google.com/bigquery/docs/reference/standard-sql/datetime_functions

(defmethod unprepare/unprepare-value [:bigquery-cloud-sdk String]
  [_ s]
  ;; escape single-quotes like Cam's String -> Cam\'s String
  (str \' (str/replace s "'" "\\\\'") \'))

(defmethod unprepare/unprepare-value [:bigquery-cloud-sdk LocalTime]
  [_ t]
  (format "time \"%s\"" (u.date/format-sql t)))

(defmethod unprepare/unprepare-value [:bigquery-cloud-sdk LocalDate]
  [_ t]
  (format "date \"%s\"" (u.date/format-sql t)))

(defmethod unprepare/unprepare-value [:bigquery-cloud-sdk LocalDateTime]
  [_ t]
  (format "datetime \"%s\"" (u.date/format-sql t)))

(defmethod unprepare/unprepare-value [:bigquery-cloud-sdk OffsetTime]
  [_ t]
  ;; convert to a LocalTime in UTC
  (let [local-time (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))]
    (format "time \"%s\"" (u.date/format-sql local-time))))

(defmethod unprepare/unprepare-value [:bigquery-cloud-sdk OffsetDateTime]
  [_ t]
  (format "timestamp \"%s\"" (u.date/format-sql t)))

(defmethod unprepare/unprepare-value [:bigquery-cloud-sdk ZonedDateTime]
  [_ t]
  (format "timestamp \"%s %s\"" (u.date/format-sql (t/local-date-time t)) (.getId (t/zone-id t))))

(defmethod sql.qp/field->identifier :bigquery-cloud-sdk
  [_ {table-id :table_id, field-name :name, :as field}]
  ;; TODO - Making a DB call for each field to fetch its Table is inefficient and makes me cry, but this method is
  ;; currently only used for SQL params so it's not a huge deal at this point
  ;;
  ;; TODO - we should make sure these are in the QP store somewhere and then could at least batch the calls
  (let [table-name (db/select-one-field :name table/Table :id (u/the-id table-id))]
    (with-temporal-type (hx/identifier :field table-name field-name) (temporal-type field))))

(defmethod sql.qp/apply-top-level-clause [:bigquery-cloud-sdk :breakout]
  [driver _ honeysql-form {breakouts :breakout, fields :fields, :as query}]
  (-> honeysql-form
      ;; Group by all the breakout fields.
      ;;
      ;; Unlike other SQL drivers, BigQuery requires that we refer to Fields using the alias we gave them in the
      ;; `SELECT` clause, rather than repeating their definitions.
      ((partial apply h/group) (for [breakout breakouts
                                     :let     [alias (or (sql.qp/field-clause->alias driver breakout)
                                                         (throw (ex-info (tru "Error compiling SQL: breakout does not have an alias")
                                                                         {:type     error-type/qp
                                                                          :breakout breakout
                                                                          :query    query})))]]
                                 alias))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it
      ;; twice, or HoneySQL will barf
      ((partial apply h/merge-select) (for [field-clause breakouts
                                            :when        (not (contains? (set fields) field-clause))]
                                        (sql.qp/as driver field-clause)))))

;; as with breakouts BigQuery requires that you use the Field aliases in order by clauses, so override the methods for
;; compiling `:asc` and `:desc` and alias the Fields if applicable
(defn- alias-order-by-field [driver [direction field-clause]]
  (let [field-clause (if (mbql.u/is-clause? :aggregation field-clause)
                       field-clause
                       (sql.qp/field-clause->alias driver field-clause))]
    ((get-method sql.qp/->honeysql [:sql direction]) driver [direction field-clause])))

(defmethod sql.qp/->honeysql [:bigquery-cloud-sdk :asc]  [driver clause] (alias-order-by-field driver clause))
(defmethod sql.qp/->honeysql [:bigquery-cloud-sdk :desc] [driver clause] (alias-order-by-field driver clause))

(defn- reconcile-temporal-types
  "Make sure the temporal types of fields and values in filter clauses line up."
  [[clause-type f & args :as clause]]
  (if-let [target-type (or (temporal-type f) (some temporal-type args))]
    (do
      (log/tracef "Coercing args in %s to temporal type %s" (binding [*print-meta* true] (pr-str clause)) target-type)
      (u/prog1 (into [clause-type] (map (partial ->temporal-type target-type)
                                        (cons f args)))
        (when (not= [clause (meta clause)] [<> (meta <>)])
          (log/tracef "Coerced -> %s" (binding [*print-meta* true] (pr-str <>))))))
    clause))

(doseq [filter-type [:between := :!= :> :>= :< :<=]]
  (defmethod sql.qp/->honeysql [:bigquery-cloud-sdk filter-type]
    [driver clause]
    ((get-method sql.qp/->honeysql [:sql filter-type])
     driver
     (reconcile-temporal-types clause))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Other Driver / SQLDriver Method Implementations                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- interval [amount unit]
  (hsql/raw (format "INTERVAL %d %s" (int amount) (name unit))))

(defn- assert-addable-unit [t-type unit]
  (when-not (contains? (temporal-type->supported-units t-type) unit)
    ;; trying to add an `hour` to a `date` or a `year` to a `time` is something we shouldn't be allowing in the UI in
    ;; the first place
    (throw (ex-info (tru "Invalid query: you cannot add a {0} to a {1} column."
                         (name unit) (name t-type))
             {:type error-type/invalid-query}))))

;; We can coerce the HoneySQL form this wraps to whatever we want and generate the appropriate SQL.
;; Thus for something like filtering against a relative datetime
;;
;; [:time-interval <datetime field> -1 :day]
;;
;;
(defrecord AddIntervalForm [hsql-form amount unit]
  hformat/ToSql
  (to-sql [_]
    (loop [hsql-form hsql-form]
      (let [t      (temporal-type hsql-form)
            add-fn (case t
                     :timestamp :timestamp_add
                     :datetime  :datetime_add
                     :date      :date_add
                     :time      :time_add
                     nil)]
        (if-not add-fn
          (recur (->temporal-type :datetime hsql-form))
          (do
            (assert-addable-unit t unit)
            (hformat/to-sql (hsql/call add-fn hsql-form (interval amount unit)))))))))

(defmethod temporal-type AddIntervalForm
  [add-interval]
  (temporal-type (:hsql-form add-interval)))

(defmethod ->temporal-type [:temporal-type AddIntervalForm]
  [target-type add-interval-form]
  (let [current-type (temporal-type (:hsql-form add-interval-form))]
    (when (#{[:date :time] [:time :date]} [current-type target-type])
      (throw (ex-info (tru "It doesn''t make sense to convert between DATEs and TIMEs!")
               {:type error-type/invalid-query}))))
  (map->AddIntervalForm (update add-interval-form :hsql-form (partial ->temporal-type target-type))))

(defmethod sql.qp/add-interval-honeysql-form :bigquery-cloud-sdk
  [_ hsql-form amount unit]
  (AddIntervalForm. hsql-form amount unit))

(defmethod driver/mbql->native :bigquery-cloud-sdk
  [driver
   {database-id                                                 :database
    {source-table-id :source-table, source-query :source-query} :query
    :as                                                         outer-query}]
  (let [dataset-id         (-> (qp.store/database) :details :dataset-id)
        {table-name :name} (some-> source-table-id qp.store/table)]
    (assert (seq dataset-id))
    (binding [sql.qp/*query* (assoc outer-query :dataset-id dataset-id)]
      (let [[sql & params] (->> outer-query
                                (sql.qp/mbql->honeysql driver)
                                (sql.qp/format-honeysql driver))]
        {:query      sql
         :params     params
         :table-name (or table-name
                         (when source-query
                           sql.qp/source-query-alias))
         :mbql?      true}))))

(defrecord ^:private CurrentMomentForm [t]
  hformat/ToSql
  (to-sql [_]
    (hformat/to-sql
     (case (or t :timestamp)
       :time      :%current_time
       :date      :%current_date
       :datetime  :%current_datetime
       :timestamp :%current_timestamp))))

(defmethod temporal-type CurrentMomentForm
  [^CurrentMomentForm current-moment]
  (.t current-moment))

(defmethod ->temporal-type [:temporal-type CurrentMomentForm]
  [t _]
  (CurrentMomentForm. t))

(defmethod sql.qp/current-datetime-honeysql-form :bigquery-cloud-sdk
  [_]
  (CurrentMomentForm. nil))

(defmethod sql.qp/quote-style :bigquery-cloud-sdk
  [_]
  :mysql)

;; convert LocalDate to an OffsetDateTime in UTC since BigQuery doesn't handle LocalDates as we'd like
(defmethod sql/->prepared-substitution [:bigquery-cloud-sdk LocalDate]
  [driver t]
  (sql/->prepared-substitution driver (t/offset-date-time t (t/local-time 0) (t/zone-offset 0))))

(defmethod sql.params.substitution/->replacement-snippet-info [:bigquery-cloud-sdk FieldFilter]
  [driver {:keys [field], :as field-filter}]
  (let [field-temporal-type (temporal-type field)
        parent-method       (get-method sql.params.substitution/->replacement-snippet-info [:sql FieldFilter])
        result              (parent-method driver field-filter)]
    (cond-> result
      field-temporal-type (update :prepared-statement-args (fn [args]
                                                             (for [arg args]
                                                               (if (instance? java.time.temporal.Temporal arg)
                                                                 (->temporal-type field-temporal-type arg)
                                                                 arg)))))))
