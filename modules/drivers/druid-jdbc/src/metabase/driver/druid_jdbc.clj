(ns metabase.driver.druid-jdbc
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.util.honey-sql-2 :as h2x])
  (:import
   (java.sql ResultSet Types)
   (java.sql Types)))

(set! *warn-on-reflection* true)

(driver/register! :druid-jdbc :parent :sql-jdbc)

;; TODO: remove support of sql and sql-jdbc features for now!
(doseq [[feature supported?] {:set-timezone            true
                              :expression-aggregations true}]
  (defmethod driver/database-supports? [:druid feature] [_driver _feature _db] supported?))


;; TODO: Double check this driver does not have to implement the following method.
#_(defmethod driver/describe-database :druid-jdbc
    [_ database]
    #_{:tables #{{:name "checkins", :schema "druid", :description nil}}}
  ;; should be -- or is the druid schema correct? -- probably
    #_{:tables #{{:schema nil, :name "checkins"}}}
    (sql-jdbc.sync/describe-database :druid-jdbc database))

;; TODO: Verify we do not need `;transparent_reconnection=true` parameter! If parameter is left out it seems
;;       connections can not be acquired!
(defmethod sql-jdbc.conn/connection-details->spec :druid-jdbc
  [_driver {:keys [host port] :as _db-details}]
  {:classname   "org.apache.calcite.avatica.remote.Driver"
   :subprotocol "avatica:remote"
   :subname     (str "url=http://" host ":" port "/druid/v2/sql/avatica/;transparent_reconnection=true")})

;; TODO: Implement COMPLEX type handling!
(defmethod sql-jdbc.sync/database-type->base-type :druid-jdbc
  [_ database-type]
  ({:TIMESTAMP            :type/DateTime
    :VARCHAR              :type/Text
    :DECIMAL              :type/Decimal
    :FLOAT                :type/Float
    :REAL                 :type/Float
    :DOUBLE               :type/Float
    :BIGINT               :type/BigInteger}
   database-type
   :type/*))

;; TODO: Verify that use of local-date-time is correct here.
(defmethod sql-jdbc.execute/read-column-thunk [:druid-jdbc Types/TIMESTAMP]
  [_ ^ResultSet rs _ ^long i]
  (fn []
    (t/local-date-time (.getObject rs i))))

;; TODO: 1111, the OTHER, type should be handled more robustly. There should be more specific type info available
;;       _somewhere_, sync gets the COMPLEX<...> type value. It would make sense to use it here to decide on type
;;       handling.
;;       ...
;;      COMPLEX<...> is gathered from `DatabaseMetaData`, that's not available here.
(defmethod sql-jdbc.execute/read-column-thunk [:druid-jdbc 1111]
  [_ ^ResultSet rs _ ^long i]
  (fn []
    (let [o (.getObject rs i)]
      (cond-> o
        (string? o) (str/replace  #"^\"|\"$" "")))))

;; TODO: Following currently has no effect. Find a way how to set start of week for Druid JDBC!
(defmethod driver/db-start-of-week :druid
  [_]
  :sunday)

;; TODO: Verify literal use if fine here.
(defn- date-trunc [unit expr] [:date_trunc (h2x/literal unit) expr])

(defmethod sql.qp/date [:druid-jdbc :default] [_ _ expr] expr)
(defmethod sql.qp/date [:druid-jdbc :minute] [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:druid-jdbc :hour] [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:druid-jdbc :day] [_ _ expr] (date-trunc :day expr))
(defmethod sql.qp/date [:druid-jdbc :week] [_ _ expr] (date-trunc :week expr))
(defmethod sql.qp/date [:druid-jdbc :month] [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:druid-jdbc :quarter] [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:druid-jdbc :year] [_ _ expr] (date-trunc :year expr))

;; TODO: Verify literal use if fine here.
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
  [_]
  [:raw "CURRENT_TIMESTAMP"])

;; `identifier` is used here because for reasons unknown timestampadd requires "unit" quoting isntead of single quote.
(defmethod sql.qp/add-interval-honeysql-form :druid-jdbc
  [_ hsql-form amount unit]
  [:TIMESTAMPADD (h2x/identifier :type-name unit) (h2x/->integer amount) hsql-form])
