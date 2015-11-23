(ns metabase.driver.sqlserver
  (:require [clojure.string :as s]
            (korma [core :as k]
                   [db :as kdb])
            [korma.sql.utils :as utils]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.util :refer [funcs]])
  (:import net.sourceforge.jtds.jdbc.Driver)) ; need to import this in order to load JDBC driver

(defn- column->base-type
  "See [this page](https://msdn.microsoft.com/en-us/library/ms187752.aspx) for details."
  [_ column-type]
  ({:bigint           :BigIntegerField
     :binary           :UnknownField
     :bit              :BooleanField ; actually this is 1 / 0 instead of true / false ...
     :char             :CharField
     :cursor           :UnknownField
     :date             :DateField
     :datetime         :DateTimeField
     :datetime2        :DateTimeField
     :datetimeoffset   :DateTimeField
     :decimal          :DecimalField
     :float            :FloatField
     :geography        :UnknownField
     :geometry         :UnknownField
     :hierarchyid      :UnknownField
     :image            :UnknownField
     :int              :IntegerField
     :money            :DecimalField
     :nchar            :CharField
     :ntext            :TextField
     :numeric          :DecimalField
     :nvarchar         :TextField
     :real             :FloatField
     :smalldatetime    :DateTimeField
     :smallint         :IntegerField
     :smallmoney       :DecimalField
     :sql_variant      :UnknownField
     :table            :UnknownField
     :text             :TextField
     :time             :TimeField
     :timestamp        :UnknownField ; not a standard SQL timestamp, see https://msdn.microsoft.com/en-us/library/ms182776.aspx
     :tinyint          :IntegerField
     :uniqueidentifier :UUIDField
     :varbinary        :UnknownField
     :varchar          :TextField
     :xml              :UnknownField
     (keyword "int identity") :IntegerField} column-type)) ; auto-incrementing integer (ie pk) field

(defn- connection-details->spec [_ {:keys [instance], :as details}]
  (-> (kdb/mssql details)
      ;; swap out Microsoft Driver details for jTDS ones
      (assoc :classname   "net.sourceforge.jtds.jdbc.Driver"
             :subprotocol "jtds:sqlserver")
      ;; adjust the connection URL to match up with the jTDS format (see http://jtds.sourceforge.net/faq.html#urlFormat)
      ;; and add the ;instance= option if applicable
      (update :subname #(cond-> (s/replace % #";database=" "/")
                          (seq instance) (str ";instance=" instance)))))

(defn- date
  "See also the [jTDS SQL <-> Java types table](http://jtds.sourceforge.net/typemap.html)"
  [_ unit field-or-value]
  (case unit
    :default         (utils/func "CAST(%s AS DATETIME)" [field-or-value])
    :minute          (utils/func "CAST(%s AS SMALLDATETIME)" [field-or-value])
    :minute-of-hour  (utils/func "DATEPART(minute, %s)" [field-or-value])
    :hour            (utils/func "CAST(FORMAT(%s, 'yyyy-MM-dd HH:00:00') AS DATETIME)" [field-or-value])
    :hour-of-day     (utils/func "DATEPART(hour, %s)" [field-or-value])
    ;; jTDS is retarded; I sense an ongoing theme here. It returns DATEs as strings instead of as java.sql.Dates
    ;; like every other SQL DB we support. Work around that by casting to DATE for truncation then back to DATETIME so we get the type we want
    :day             (utils/func "CAST(CAST(%s AS DATE) AS DATETIME)" [field-or-value])
    :day-of-week     (utils/func "DATEPART(weekday, %s)" [field-or-value])
    :day-of-month    (utils/func "DATEPART(day, %s)" [field-or-value])
    :day-of-year     (utils/func "DATEPART(dayofyear, %s)" [field-or-value])
    ;; Subtract the number of days needed to bring us to the first day of the week, then convert to date
    ;; The equivalent SQL looks like:
    ;;     CAST(DATEADD(day, 1 - DATEPART(weekday, %s), CAST(%s AS DATE)) AS DATETIME)
    ;; But we have to use this ridiculous 'funcs' function in order to generate the korma form we want (AFAIK)
    ;; utils/func only handles multiple arguments if they are comma separated and injected into a single `%s` format placeholder
    :week            (funcs "CAST(%s AS DATETIME)"
                            ["DATEADD(day, %s)"
                             ["1 - DATEPART(weekday, %s)" field-or-value]
                             ["CAST(%s AS DATE)" field-or-value]])
    :week-of-year    (utils/func "DATEPART(iso_week, %s)" [field-or-value])
    :month           (utils/func "CAST(FORMAT(%s, 'yyyy-MM-01') AS DATETIME)" [field-or-value])
    :month-of-year   (utils/func "DATEPART(month, %s)" [field-or-value])
    ;; Format date as yyyy-01-01 then add the appropriate number of quarter
    ;; Equivalent SQL:
    ;;     DATEADD(quarter, DATEPART(quarter, %s) - 1, FORMAT(%s, 'yyyy-01-01'))
    :quarter         (funcs "DATEADD(quarter, %s)"
                            ["DATEPART(quarter, %s) - 1" field-or-value]
                            ["FORMAT(%s, 'yyyy-01-01')" field-or-value])
    :quarter-of-year (utils/func "DATEPART(quarter, %s)" [field-or-value])
    :year            (utils/func "DATEPART(year, %s)" [field-or-value])))

(defn- date-interval [_ unit amount]
  (utils/generated (format "DATEADD(%s, %d, GETUTCDATE())" (name unit) amount)))

(defn- unix-timestamp->timestamp [_ field-or-value seconds-or-milliseconds]
  (utils/func (case seconds-or-milliseconds
                ;; The second argument to DATEADD() gets casted to a 32-bit integer. BIGINT is 64 bites, so we tend to run into
                ;; integer overflow errors (especially for millisecond timestamps).
                ;; Work around this by converting the timestamps to minutes instead before calling DATEADD().
                :seconds      "DATEADD(minute, (%s / 60), '1970-01-01')"
                :milliseconds "DATEADD(minute, (%s / 60000), '1970-01-01')")
              [field-or-value]))

(defn- apply-limit [_ korma-query {value :limit}]
  (k/modifier korma-query (format "TOP %d" value)))

(defn- apply-page [_ korma-query {{:keys [items page]} :page}]
  (k/offset korma-query (format "%d ROWS FETCH NEXT %d ROWS ONLY"
                                (* items (dec page))
                                items)))

(defrecord SQLServerDriver []
  clojure.lang.Named
  (getName [_] "SQL Server"))

(extend SQLServerDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval  date-interval
          :details-fields (constantly [{:name         "host"
                                        :display-name "Host"
                                        :default      "localhost"}
                                       {:name         "port"
                                        :display-name "Port"
                                        :type         :integer
                                        :default      1433}
                                       {:name         "db"
                                        :display-name "Database name"
                                        :placeholder  "BirdsOfTheWorld"
                                        :required     true}
                                       {:name         "instance"
                                        :display-name "Database instance name"
                                        :placeholder  "N/A"}
                                       {:name         "user"
                                        :display-name "Database username"
                                        :placeholder  "What username do you use to login to the database?"
                                        :required     true}
                                       {:name         "password"
                                        :display-name "Database password"
                                        :type         :password
                                        :placeholder  "*******"}])})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-limit               apply-limit
          :apply-page                apply-page
          :column->base-type         column->base-type
          :connection-details->spec  connection-details->spec
          :current-datetime-fn       (constantly (k/sqlfn* :GETUTCDATE))
          :date                      date
          :excluded-schemas          (constantly #{"sys" "INFORMATION_SCHEMA"})
          :stddev-fn                 (constantly :STDEV)
          :string-length-fn          (constantly :LEN)
          :unix-timestamp->timestamp unix-timestamp->timestamp}))

(driver/register-driver! :sqlserver (SQLServerDriver.))
