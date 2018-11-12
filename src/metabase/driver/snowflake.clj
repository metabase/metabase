(ns metabase.driver.snowflake
  "Snowflake Driver."
  (:require [clojure
             [set :as set]
             [string :as str]]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sql.qp]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [honeysql-extensions :as hx]
             [i18n :refer [tru]]
             [ssh :as ssh]]
            [toucan.db :as db])
  (:import java.sql.Time))

(defn- connection-details->spec
  "Create a database specification for a snowflake database."
  [{:keys [account regionid] :as opts}]
  (let [host (if regionid
               (str account "." regionid)
               account)]
    ;; it appears to be the case that their JDBC driver ignores `db` -- see my bug report at
    ;; https://support.snowflake.net/s/question/0D50Z00008WTOMCSA5/
    (merge {:subprotocol                                "snowflake"
            :classname                                  "net.snowflake.client.jdbc.SnowflakeDriver"
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

(defrecord SnowflakeDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "Snowflake"))

(def ^:private snowflake-date-formatters
  "The default timestamp format for Snowflake.
  See https://docs.snowflake.net/manuals/sql-reference/data-types-datetime.html#timestamp."
  (driver/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSSSSSSSS Z"))

(def ^:private snowflake-db-time-query
  "Snowflake current database time, with hour and minute timezone offset."
  "select to_char(current_timestamp, 'YYYY-MM-DD HH24:MI:SS.FF TZHTZM')")

(def ^:private column->base-type
  "Map of the default Snowflake column types -> Field base types. Add more
  mappings here as you come across them."
  {:NUMBER                     :type/Number
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
   :ARRAY                      :type/*})

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :to_timestamp expr)
    :milliseconds (hsql/call :to_timestamp expr 3)))

(defn- date-interval [unit amount]
  (hsql/call :dateadd
    (hsql/raw (name unit))
    (hsql/raw (int amount))
    :%current_timestamp))

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

(defn- query-db-name []
  (or (-> (qp.store/database) :details :db)
      (throw (Exception. "Missing DB name"))))

(defmethod sql.qp/->honeysql [SnowflakeDriver (class Field)]
  [driver field]
  (let [table            (qp.store/table (:table_id field))
        db-name          (when-not (:alias? table)
                           (query-db-name))
        field-identifier (keyword
                          (hx/qualify-and-escape-dots db-name (:schema table) (:name table) (:name field)))]
    (sql.qp/cast-unix-timestamp-field-if-needed driver field field-identifier)))

(defmethod sql.qp/->honeysql [SnowflakeDriver (class Table)]
  [_ table]
  (let [{table-name :name, schema :schema} table]
    (hx/qualify-and-escape-dots (query-db-name) schema table-name)))

(defmethod sql.qp/->honeysql [SnowflakeDriver :time]
  [driver [_ value unit]]
  (hx/->time (sql.qp/->honeysql driver value)))

(defn- field->identifier
  "Generate appropriate identifier for a Field for SQL parameters. (NOTE: THIS IS ONLY USED FOR SQL PARAMETERS!)"
  ;; TODO - Making a DB call for each field to fetch its Table is inefficient and makes me cry, but this method is
  ;; currently only used for SQL params so it's not a huge deal at this point
  ;;
  ;; TODO - we should make sure these are in the QP store somewhere and then could at least batch the calls
  [driver {table-id :table_id, :as field}]
  (qp.store/store-table! (db/select-one [Table :id :name :schema], :id (u/get-id table-id)))
  (sql.qp/->honeysql driver field))


(defn- table-rows-seq [driver database table]

  (sql/query driver database {:select [:*]
                              :from   [(qp.store/with-store
                                         (qp.store/store-database! database)
                                         (sql.qp/->honeysql driver table))]}))

(defn- string-length-fn [field-key]
  (hsql/call :length (hx/cast :VARCHAR field-key)))

(defn- db-name
  "As mentioned above, old versions of the Snowflake driver used `details.dbname` to specify the physical database, but
  tests (and Snowflake itself) expected `db`. This has since been fixed, but for legacy support we'll still accept
  either. Throw an Exception if neither key can be found."
  {:arglists '([database])}
  [{details :details}]
  (or (:db details)
      (:dbname details)
      (throw (Exception. (str (tru "Invalid Snowflake connection details: missing DB name."))))))

(defn- describe-database [driver database]
  (sql/with-metadata [metadata driver database]
    {:tables (sql/fast-active-tables driver metadata (db-name database))}))

(defn- describe-table [driver database table]
  (sql/with-metadata [metadata driver database]
    (->> (assoc (select-keys table [:name :schema])
           :fields (sql/describe-table-fields metadata driver table (db-name database)))
         ;; find PKs and mark them
         (sql/add-table-pks metadata))))

(defn- describe-table-fks [driver database table]
  (sql/describe-table-fks driver database table (db-name database)))

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
                                     snowflake-db-time-query
                                     snowflake-date-formatters)
          :table-rows-seq           table-rows-seq
          :describe-database        describe-database
          :describe-table           describe-table
          :describe-table-fks       describe-table-fks})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:connection-details->spec  (u/drop-first-arg connection-details->spec)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :excluded-schemas          (constantly #{"INFORMATION_SCHEMA"})
          :date                      (u/drop-first-arg date)
          :field->identifier         field->identifier
          :current-datetime-fn       (constantly :%current_timestamp)
          :set-timezone-sql          (constantly "ALTER SESSION SET TIMEZONE = %s;")
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)
          :column->base-type         (u/drop-first-arg column->base-type)}))


(defn -init-driver
  "Register the Snowflake driver"
  []
  (driver/register-driver! :snowflake (SnowflakeDriver.)))
