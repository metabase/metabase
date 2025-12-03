(ns metabase.driver.druid-jdbc
  (:refer-clojure :exclude [mapv])
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common :as driver.common]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf :refer [mapv]])
  (:import
   (java.sql ResultSet Types)
   (java.time LocalDate LocalDateTime ZonedDateTime)))

(set! *warn-on-reflection* true)

(driver/register! :druid-jdbc :parent :sql-jdbc)

(doseq [[feature supported?] {:set-timezone            true
                              :expression-aggregations true
                              :expression-literals     true}]
  (defmethod driver/database-supports? [:druid-jdbc feature] [_driver _feature _db] supported?))

(defmethod sql-jdbc.conn/connection-details->spec :druid-jdbc
  [driver {:keys [host port auth-enabled auth-username] :as db-details}]
  (merge {:classname   "org.apache.calcite.avatica.remote.Driver"
          :subprotocol "avatica:remote"
          :subname     (str "url=" host ":" port "/druid/v2/sql/avatica/;transparent_reconnection=true")}
         (when auth-enabled
           {:user auth-username
            :password (driver-api/secret-value-as-string driver db-details "auth-password")})
         (when (some? (driver/report-timezone))
           {:sqlTimeZone (driver/report-timezone)
            :timeZone (driver/report-timezone)})))

(defmethod driver/db-default-timezone :druid-jdbc
  [_driver _database]
  "UTC")

(defmethod driver/db-start-of-week :druid-jdbc
  [_driver]
  :monday)

(defmethod sql-jdbc.sync/database-type->base-type :druid-jdbc
  [_driver database-type]
  ({:TIMESTAMP            :type/DateTime
    :VARCHAR              :type/Text
    :DECIMAL              :type/Decimal
    :FLOAT                :type/Float
    :REAL                 :type/Float
    :DOUBLE               :type/Float
    :BIGINT               :type/BigInteger
    :COMPLEX<json>        :type/JSON
    :COMPLEX<hyperUnique> :type/DruidHyperUnique}
   database-type
   :type/*))

(defmethod sql-jdbc.execute/read-column-thunk [:druid-jdbc Types/TIMESTAMP]
  [_driver ^ResultSet rs _rsmeta ^Long i]
  (fn []
    (t/instant (.getObject rs i))))

;; Druid's COMPLEX<...> types are encoded as JDBC's other -- 1111. Values are rendered as string.
(defmethod sql-jdbc.execute/read-column-thunk [:druid-jdbc Types/OTHER]
  [_driver ^ResultSet rs _rsmeta ^Long i]
  (fn []
    (let [o (.getObject rs i)]
      (cond-> o
        (string? o) (str/replace  #"^\"|\"$" "")))))

(defn- date-trunc [unit expr] [:date_trunc (h2x/literal unit) expr])

(defmethod sql.qp/date [:druid-jdbc :default] [_ _ expr] expr)
(defmethod sql.qp/date [:druid-jdbc :minute] [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:druid-jdbc :hour] [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:druid-jdbc :day] [_ _ expr] (date-trunc :day expr))
(defmethod sql.qp/date [:druid-jdbc :week] [_ _ expr] (date-trunc :week expr))
(defmethod sql.qp/date [:druid-jdbc :month] [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:druid-jdbc :quarter] [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:druid-jdbc :year] [_ _ expr] (date-trunc :year expr))

(defn- time-extract [unit expr] [:time_extract expr (h2x/literal unit)])

(defmethod sql.qp/date [:druid-jdbc :minute-of-hour] [_ _ expr] (time-extract :minute expr))
(defmethod sql.qp/date [:druid-jdbc :hour-of-day] [_ _ expr] (time-extract :hour expr))
(defmethod sql.qp/date [:druid-jdbc :day-of-week] [_ _ expr] (time-extract :dow expr))
(defmethod sql.qp/date [:druid-jdbc :day-of-month] [_ _ expr] (time-extract :day expr))
(defmethod sql.qp/date [:druid-jdbc :day-of-year] [_ _ expr] (time-extract :doy expr))
(defmethod sql.qp/date [:druid-jdbc :week-of-year] [_ _ expr] (time-extract :week expr))
(defmethod sql.qp/date [:druid-jdbc :month-of-year] [_ _ expr] (time-extract :month expr))
(defmethod sql.qp/date [:druid-jdbc :quarter-of-year] [_ _ expr] (time-extract :quarter expr))

(defmethod sql.qp/current-datetime-honeysql-form :druid-jdbc
  [_driver]
  [:raw "CURRENT_TIMESTAMP"])

(defmethod sql.qp/add-interval-honeysql-form :druid-jdbc
  [_driver hsql-form amount unit]
  [:TIMESTAMPADD (h2x/identifier :type-name unit) (h2x/->integer amount) hsql-form])

(defmethod sql-jdbc.conn/data-source-name :druid-jdbc
  [_driver {:keys [host port] :as _details}]
  (format "druid-%s-%s"
          ;; remove protocol
          (or (re-find #"(?<=\w://).*" host)
              host)
          port))

(defn- format-datetime [t] (t/format "yyyy-MM-dd HH:mm:ss.SSS" t))

(defmethod sql-jdbc.execute/set-parameter [:druid-jdbc ZonedDateTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (format-datetime t)))

(defmethod sql.qp/inline-value [:druid-jdbc ZonedDateTime]
  [_driver t]
  (format "'%s'" (format-datetime t)))

(defmethod sql-jdbc.execute/set-parameter [:druid-jdbc LocalDateTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (format-datetime t)))

(defmethod sql.qp/inline-value [:druid-jdbc LocalDateTime]
  [_driver t]
  (format "'%s'" (format-datetime t)))

(defn- format-date [d] (t/format "yyyy-MM-dd" d))

(defmethod sql-jdbc.execute/set-parameter [:druid-jdbc LocalDate]
  [driver ps i d]
  (sql-jdbc.execute/set-parameter driver ps i (format-date d)))

(defmethod sql.qp/inline-value [:druid-jdbc LocalDate]
  [_driver d]
  (format "'%s'" (format-date d)))

(defmethod sql.qp/json-query :druid-jdbc
  [_driver unwrapped-identifier nfc-field]
  (assert (h2x/identifier? unwrapped-identifier)
          (format "Invalid identifier: %s" (pr-str unwrapped-identifier)))
  (let [nfc-path          (:nfc-path nfc-field)
        parent-identifier (sql.qp.u/nfc-field->parent-identifier unwrapped-identifier nfc-field)
        ;; Druid json functions reference: https://druid.apache.org/docs/latest/querying/math-expr#json-functions
        operator (if (isa? (:base-type nfc-field) :type/Array)
                   ::json_query
                   ::json_value)]
    [operator parent-identifier (h2x/literal (str/join "." (cons "$" (rest nfc-path))))]))

(defmethod driver.sql/json-field-length :druid-jdbc
  [_driver json-field-identifier]
  [:length [:to_json_string json-field-identifier]])

(defmethod sql.qp/->honeysql [:druid-jdbc :field]
  [driver [_ id-or-name opts :as clause]]
  (let [stored-field  (when (integer? id-or-name)
                        (driver-api/field (driver-api/metadata-provider) id-or-name))
        parent-method (get-method sql.qp/->honeysql [:sql :field])
        identifier    (parent-method driver clause)]
    (if-not (driver-api/json-field? stored-field)
      identifier
      (if (or (::sql.qp/forced-alias opts)
              (= driver-api/qp.add.source (driver-api/qp.add.source-table opts)))
        (keyword (driver-api/qp.add.source-alias opts))
        (perf/postwalk #(if (h2x/identifier? %)
                          (sql.qp/json-query :druid-jdbc % stored-field)
                          %)
                       identifier)))))

(defmethod sql-jdbc.sync/column->semantic-type :druid-jdbc
  [_driver database-type _column-name]
  (case database-type
    "COMPLEX<json>" :type/SerializedJSON
    nil))

;; TODO: Make this dependent on database features only, not the application state. Issue #41216 tracks that.
(defmethod driver/database-supports? [:druid-jdbc :nested-field-columns]
  [_driver _feat db]
  (driver.common/json-unfolding-default db))

(defmethod driver/dbms-version :druid-jdbc
  [_driver database]
  (let [{:keys [host port]} (:details database)]
    (try (let [version (-> (http/get (format "%s:%s/status" host port))
                           :body
                           json/decode
                           (get "version"))
               [maj-min maj min] (re-find #"^(\d+)\.(\d+)" version)
               semantic (mapv #(Integer/parseInt %) [maj min])]
           {:version maj-min
            :semantic-version semantic})
         (catch Throwable _
           (log/warn "Unable to get dbms version. Using 0 fallback.")
           {:version "0.0"
            :semantic-version [0 0]
            :flavor "fallback"}))))
