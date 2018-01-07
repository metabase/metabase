(ns metabase.driver.snowflake
  "Snowflake Driver."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [honeysql.core :as hsql]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver
             [generic-sql :as sql]
             [postgres :as postgres]]
            [metabase.util
             [honeysql-extensions :as hx]
             [ssh :as ssh]]))

(defn connection-details->spec
  "Create a database specification for a snowflake database."
  [{:keys [account regionid] :as opts}]
  (let [host (if regionid
               (str account "." regionid)
               account)]
    (merge {:subprotocol "snowflake"
            :classname   "net.snowflake.client.jdbc.SnowflakeDriver"
            :subname     (str "//" host ".snowflakecomputing.com/")
            :ssl         true}
           (dissoc opts :host :port))))

(defrecord SnowflakeDriver []
  clojure.lang.Named
  (getName [_] "Snowflake"))

(def ^:private snowflake-date-formatter
  "The default timestamp format for Snowflake.
  See https://docs.snowflake.net/manuals/sql-reference/data-types-datetime.html#timestamp."
  (driver/create-db-time-formatter "EEE, dd MMM yyyy HH:mm:ss Z"))

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
    :milliseconds (recur (hx// expr 1000) :seconds)))

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
          ;; :describe-table-fks       (u/drop-first-arg describe-table-fks)
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
                                                   {:name         "db"
                                                    :display-name "Database name"
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
          :date                      (u/drop-first-arg date)
          :current-datetime-fn       (constantly :%current_timestamp)
          :set-timezone-sql          (constantly "alter session set time_zone = %s")
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)
          :column->base-type         (u/drop-first-arg column->base-type)}
         ;; HACK ! When we test against Redshift we use a session-unique schema so we can run simultaneous tests
         ;; against a single remote host; when running tests tell the sync process to ignore all the other schemas
         #_(when config/is-test?
             {:excluded-schemas (memoize
                                 (fn [_]
                                   (require 'metabase.test.data.redshift)
                                   (let [session-schema-number @(resolve 'metabase.test.data.redshift/session-schema-number)]
                                     (set (conj (for [i     (range 240)
                                                      :when (not= i session-schema-number)]
                                                  (str "schema_" i))
                                                "public")))))})))



(defn -init-driver
  "Register the Snowflake driver"
  []
  (driver/register-driver! :Snowflake (SnowflakeDriver.)))


(comment

  )
