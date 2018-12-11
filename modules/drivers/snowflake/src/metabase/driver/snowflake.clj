(ns metabase.driver.snowflake
  "Snowflake Driver."
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.java.jdbc :as jdbc]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver
             [common :as driver.common]
             [sql-jdbc :as sql-jdbc]]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [honeysql-extensions :as hx]
             [i18n :refer [tru]]]
            [toucan.db :as db])
  (:import java.sql.Time))

(driver/register! :snowflake, :parent :sql-jdbc)

(defmethod sql-jdbc.conn/connection-details->spec :snowflake [_ {:keys [account regionid], :as opts}]
  (let [host (if regionid
               (str account "." regionid)
               account)]
    ;; it appears to be the case that their JDBC driver ignores `db` -- see my bug report at
    ;; https://support.snowflake.net/s/question/0D50Z00008WTOMCSA5/
    (merge {:classname                                  "net.snowflake.client.jdbc.SnowflakeDriver"
            :subprotocol                                "snowflake"
            :subname                                    (str "//" host ".snowflakecomputing.com/")
            :client_metadata_request_use_connection_ctx true
            :ssl                                        true
            ;; other SESSION parameters
            ;; use the same week start we use for all the other drivers
            :week_start                                 7
            ;; not 100% sure why we need to do this but if we don't set the connection to UTC our report timezone
            ;; stuff doesn't work, even though we ultimately override this when we set the session timezone
            :timezone                                   "UTC"}
           (-> opts
               ;; original version of the Snowflake driver incorrectly used `dbname` in the details fields instead of
               ;; `db`. If we run across `dbname`, correct our behavior
               (set/rename-keys {:dbname :db})
               (dissoc :host :port :timezone)))))

(defmethod sql-jdbc.sync/database-type->base-type :snowflake [_ base-type]
  ({:NUMBER                     :type/Number
    :DECIMAL                    :type/Decimal
    :NUMERIC                    :type/Number
    :INT                        :type/Integer
    :INTEGER                    :type/Integer
    :BIGINT                     :type/BigInteger
    :SMALLINT                   :type/Integer
    :TINYINT                    :type/Integer
    :BYTEINT                    :type/Integer
    :FLOAT                      :type/Float
    :FLOAT4                     :type/Float
    :FLOAT8                     :type/Float
    :DOUBLE                     :type/Float
    (keyword "DOUBLE PRECISON") :type/Float
    :REAL                       :type/Float
    :VARCHAR                    :type/Text
    :CHAR                       :type/Text
    :CHARACTER                  :type/Text
    :STRING                     :type/Text
    :TEXT                       :type/Text
    :BINARY                     :type/*
    :VARBINARY                  :type/*
    :BOOLEAN                    :type/Boolean
    :DATE                       :type/Date
    :DATETIME                   :type/DateTime
    :TIME                       :type/Time
    :TIMESTAMP                  :type/DateTime
    :TIMESTAMPLTZ               :type/DateTime
    :TIMESTAMPNTZ               :type/DateTime
    :TIMESTAMPTZ                :type/DateTime
    :VARIANT                    :type/*
    ;; Maybe also type *
    :OBJECT                     :type/Dictionary
    :ARRAY                      :type/*} base-type))

(defmethod sql.qp/unix-timestamp->timestamp [:snowflake :seconds]      [_ _ expr] (hsql/call :to_timestamp expr))
(defmethod sql.qp/unix-timestamp->timestamp [:snowflake :milliseconds] [_ _ expr] (hsql/call :to_timestamp expr 3))

(defmethod driver/date-interval :snowflake [_ unit amount]
  (hsql/call :dateadd
    (hsql/raw (name unit))
    (hsql/raw (int amount))
    :%current_timestamp))

(defn- extract [unit expr] (hsql/call :date_part unit (hx/->timestamp expr)))
(defn- date-trunc [unit expr] (hsql/call :date_trunc unit (hx/->timestamp expr)))

(defmethod sql.qp/date [:snowflake :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:snowflake :minute]          [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:snowflake :minute-of-hour]  [_ _ expr] (extract :minute expr))
(defmethod sql.qp/date [:snowflake :hour]            [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:snowflake :hour-of-day]     [_ _ expr] (extract :hour expr))
(defmethod sql.qp/date [:snowflake :day]             [_ _ expr] (date-trunc :day expr))
(defmethod sql.qp/date [:snowflake :day-of-week]     [_ _ expr] (extract :dayofweek expr))
(defmethod sql.qp/date [:snowflake :day-of-month]    [_ _ expr] (extract :day expr))
(defmethod sql.qp/date [:snowflake :day-of-year]     [_ _ expr] (extract :dayofyear expr))
(defmethod sql.qp/date [:snowflake :week]            [_ _ expr] (date-trunc :week expr))
(defmethod sql.qp/date [:snowflake :week-of-year]    [_ _ expr] (extract :week expr))
(defmethod sql.qp/date [:snowflake :month]           [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:snowflake :month-of-year]   [_ _ expr] (extract :month expr))
(defmethod sql.qp/date [:snowflake :quarter]         [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:snowflake :quarter-of-year] [_ _ expr] (extract :quarter expr))
(defmethod sql.qp/date [:snowflake :year]            [_ _ expr] (extract :year expr))

(defn- db-name
  "As mentioned above, old versions of the Snowflake driver used `details.dbname` to specify the physical database, but
  tests (and Snowflake itself) expected `details.db`. This has since been fixed, but for legacy support we'll still
  accept either. Throw an Exception if neither key can be found."
  {:arglists '([database])}
  [{details :details}]
  (or (:db details)
      (:dbname details)
      (throw (Exception. (str (tru "Invalid Snowflake connection details: missing DB name."))))))

(defn- query-db-name []
  (or (-> (qp.store/database) db-name)
      (throw (Exception. "Missing DB name"))))

(defmethod sql.qp/->honeysql [:snowflake (class Field)]
  [driver field]
  (let [table            (qp.store/table (:table_id field))
        db-name          (when-not (:alias? table)
                           (query-db-name))
        field-identifier (keyword
                          (hx/qualify-and-escape-dots db-name (:schema table) (:name table) (:name field)))]
    (sql.qp/cast-unix-timestamp-field-if-needed driver field field-identifier)))

(defmethod sql.qp/->honeysql [:snowflake (class Table)]
  [_ table]
  (let [{table-name :name, schema :schema} table]
    (hx/qualify-and-escape-dots (query-db-name) schema table-name)))

(defmethod sql.qp/->honeysql [:snowflake :time]
  [driver [_ value unit]]
  (hx/->time (sql.qp/->honeysql driver value)))

(defmethod sql.qp/field->identifier :snowflake [driver {table-id :table_id, :as field}]
  ;; TODO - Making a DB call for each field to fetch its Table is inefficient and makes me cry, but this method is
  ;; currently only used for SQL params so it's not a huge deal at this point
  ;;
  ;; TODO - we should make sure these are in the QP store somewhere and then could at least batch the calls
  (qp.store/store-table! (db/select-one [Table :id :name :schema], :id (u/get-id table-id)))
  (sql.qp/->honeysql driver field))


(defmethod driver/table-rows-seq :snowflake [driver database table]
  (sql-jdbc/query driver database {:select [:*]
                                   :from   [(qp.store/with-store
                                              (qp.store/store-database! database)
                                              (sql.qp/->honeysql driver table))]}))

(defmethod driver/describe-database :snowflake [driver database]
  {:tables (jdbc/with-db-metadata [metadata (sql-jdbc.conn/db->pooled-connection-spec database)]
             (sql-jdbc.sync/fast-active-tables driver metadata (db-name database)))})

(defmethod driver/describe-table :snowflake [driver database table]
  (jdbc/with-db-metadata [metadata (sql-jdbc.conn/db->pooled-connection-spec database)]
    (->> (assoc (select-keys table [:name :schema])
           :fields (sql-jdbc.sync/describe-table-fields metadata driver table (db-name database)))
         ;; find PKs and mark them
         (sql-jdbc.sync/add-table-pks metadata))))

(defmethod driver/describe-table-fks :snowflake [driver database table]
  (sql-jdbc.sync/describe-table-fks driver database table (db-name database)))

(defmethod sql-jdbc.execute/set-timezone-sql :snowflake [_] "ALTER SESSION SET TIMEZONE = %s;")

(defmethod sql.qp/current-datetime-fn :snowflake [_] :%current_timestamp)

(defmethod driver/format-custom-field-name :snowflake [_ s]
  (str/lower-case s))

;; See https://docs.snowflake.net/manuals/sql-reference/data-types-datetime.html#timestamp.
(defmethod driver.common/current-db-time-date-formatters :snowflake [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSSSSSSSS Z"))

(defmethod driver.common/current-db-time-native-query :snowflake [_]
  "select to_char(current_timestamp, 'YYYY-MM-DD HH24:MI:SS.FF TZHTZM')")

(defmethod driver/current-db-time :snowflake [& args]
  (apply driver.common/current-db-time args))

(defmethod sql-jdbc.sync/excluded-schemas :snowflake [_]
  #{"INFORMATION_SCHEMA"})
