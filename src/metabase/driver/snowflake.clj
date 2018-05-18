(ns metabase.driver.snowflake
  "Snowflake Driver."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver
             [generic-sql :as sql]]
            ;; TODO delete
            [metabase.models
             [field :as field]
             [table :as table]]
            [metabase.util
             [honeysql-extensions :as hx]
             [ssh :as ssh]]))

(defn connection-details->spec
  "Create a database specification for a snowflake database."
  [{:keys [account regionid dbname] :as opts}]
  (let [host (if regionid
               (str account "." regionid)
               account)]
    (merge {:subprotocol                                "snowflake"
            :classname                                  "net.snowflake.client.jdbc.SnowflakeDriver"
            :subname                                    (str "//" host ".snowflakecomputing.com/")
            :db                                         dbname
            :client_metadata_request_use_connection_ctx true
            :ssl                                        true}
           (dissoc opts :host :port :dbname))))

(defrecord SnowflakeDriver []
  clojure.lang.Named
  (getName [_] "Snowflake"))

(def ^:private snowflake-date-formatter
  "The default timestamp format for Snowflake.
  See https://docs.snowflake.net/manuals/sql-reference/data-types-datetime.html#timestamp."
  (driver/create-db-time-formatters "EEE, dd MMM yyyy HH:mm:ss Z"))

(def ^:private snowflake-db-time-query
  "Snowflake current database time, with hour and minute timezone offset."
  "select to_char(current_timestamp, 'YYYY-MM-DD HH24:MI:SS.FF TZHTZM')")

(def ^:private column->base-type
    "Map of the default Snowflake column types -> Field base types. Add more
  mappings here as you come across them."
  {:NUMBER                     :type/Decimal
   :DECIMAL                    :type/Decimal
   :NUMERIC                    :type/Decimal
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
   :ARRAY                      :type/Array})

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :to_timestamp expr)
    :milliseconds (hsql/call :to_timestamp expr 3)))

(defn- date-interval [unit amount]
  (hsql/raw (format "dateadd(%s, %d, current_timestamp())" (name unit) (int amount))))

(defn- extract [unit expr] (hsql/call :date_part unit (hx/->timestamp expr)))
(defn- date-trunc [unit expr] (hsql/call :date_trunc unit (hx/->timestamp expr)))

(defn- date [unit expr]
  (case unit
    :default         expr
    :minute          (date-trunc :minute expr)
    :minute-of-hour  (extract :minute expr)
    :hour            (date-trunc :hour expr)
    :hour-of-day     (extract :hour expr)
    :day             (date-trunc :day expr)
    :day-of-week     (extract :dayofweek expr)
    :day-of-month    (extract :day expr)
    :day-of-year     (extract :dayofyear expr)
    :week            (date-trunc :week expr)
    :week-of-year    (extract :week expr)
    :month           (date-trunc :month expr)
    :month-of-year   (extract :month expr)
    :quarter         (date-trunc :quarter expr)
    :quarter-of-year (extract :quarter expr)
    :year            (extract :year expr)))

(defn- string-length-fn [field-key]
  (hsql/call :length (hx/cast :VARCHAR field-key)))

(u/strict-extend SnowflakeDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval            (u/drop-first-arg date-interval)
          :details-fields           (constantly (ssh/with-tunnel-config
                                                  [{:name         "account"
                                                    :display-name "Account"
                                                    :placeholder  "Your snowflake account name."
                                                    :required     true}
                                                   {:name         "user"
                                                    :display-name "Database username"
                                                    :placeholder  "ken bier"
                                                    :required     true}
                                                   {:name         "password"
                                                    :display-name "Database user password"
                                                    :type         :password
                                                    :placeholder  "*******"
                                                    :required     true}
                                                   {:name         "warehouse"
                                                    :display-name "Warehouse"
                                                    :placeholder  "my_warehouse"}
                                                   {:name         "dbname"
                                                    :display-name "Database name"
                                                    :required     true
                                                    :placeholder  "cockerel"}
                                                   {:name         "regionid"
                                                    :display-name "Region Id"
                                                    :placeholder  "my_region"}
                                                   {:name         "schema"
                                                    :display-name "Schema"
                                                    :placeholder  "my_schema"}
                                                   {:name         "role"
                                                    :display-name "Role"
                                                    :placeholder  "my_role"}]))
          :format-custom-field-name (u/drop-first-arg str/lower-case)
          :current-db-time          (driver/make-current-db-time-fn
                                     snowflake-date-formatter
                                     snowflake-db-time-query)})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:connection-details->spec  (u/drop-first-arg connection-details->spec)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :excluded-schemas          (constantly #{"information_schema"})
          :date                      (u/drop-first-arg date)
          :current-datetime-fn       (constantly :%current_timestamp)
          :set-timezone-sql          (constantly "alter session set time_zone = %s")
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)
          :column->base-type         (u/drop-first-arg column->base-type)}))



(defn -init-driver
  "Register the Snowflake driver"
  []
  (driver/register-driver! :snowflake (SnowflakeDriver.)))
