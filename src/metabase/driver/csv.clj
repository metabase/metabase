(ns metabase.driver.csv
  (:require  [clojure
             [set :as set]
             [string :as s]]
            [honeysql.core :as hsql]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [util :as u]]
            [metabase.db.spec :as dbspec]
            [metabase.driver.generic-sql :as sql]
            [metabase.models.database :refer [Database]]
            [metabase.util.honeysql-extensions :as hx]
            [puppetlabs.i18n.core :refer [tru]]
            [toucan.db :as db]))

(def ^:private ^:const column->base-type
  {:ARRAY                       :type/*
   :BIGINT                      :type/BigInteger
   :BINARY                      :type/*
   :BIT                         :type/Boolean
   :BLOB                        :type/*
   :BOOL                        :type/Boolean
   :BOOLEAN                     :type/Boolean
   :BYTEA                       :type/*
   :CHAR                        :type/Text
   :CHARACTER                   :type/Text
   :CLOB                        :type/Text
   :DATE                        :type/Date
   :DATETIME                    :type/DateTime
   :DEC                         :type/Decimal
   :DECIMAL                     :type/Decimal
   :DOUBLE                      :type/Float
   :FLOAT                       :type/Float
   :FLOAT4                      :type/Float
   :FLOAT8                      :type/Float
   :GEOMETRY                    :type/*
   :IDENTITY                    :type/Integer
   :IMAGE                       :type/*
   :INT                         :type/Integer
   :INT2                        :type/Integer
   :INT4                        :type/Integer
   :INT8                        :type/BigInteger
   :INTEGER                     :type/Integer
   :LONGBLOB                    :type/*
   :LONGTEXT                    :type/Text
   :LONGVARBINARY               :type/*
   :LONGVARCHAR                 :type/Text
   :MEDIUMBLOB                  :type/*
   :MEDIUMINT                   :type/Integer
   :MEDIUMTEXT                  :type/Text
   :NCHAR                       :type/Text
   :NCLOB                       :type/Text
   :NTEXT                       :type/Text
   :NUMBER                      :type/Decimal
   :NUMERIC                     :type/Decimal
   :NVARCHAR                    :type/Text
   :NVARCHAR2                   :type/Text
   :OID                         :type/*
   :OTHER                       :type/*
   :RAW                         :type/*
   :REAL                        :type/Float
   :SIGNED                      :type/Integer
   :SMALLDATETIME               :type/DateTime
   :SMALLINT                    :type/Integer
   :TEXT                        :type/Text
   :TIME                        :type/Time
   :TIMESTAMP                   :type/DateTime
   :TINYBLOB                    :type/*
   :TINYINT                     :type/Integer
   :TINYTEXT                    :type/Text
   :UUID                        :type/Text
   :VARBINARY                   :type/*
   :VARCHAR                     :type/Text
   :VARCHAR2                    :type/Text
   :VARCHAR_CASESENSITIVE       :type/Text
   :VARCHAR_IGNORECASE          :type/Text
   :YEAR                        :type/Integer
   (keyword "DOUBLE PRECISION") :type/Float})


(defn- connection-details->spec [details]
  (-> details
      (set/rename-keys {:dbname :db})
      dbspec/csv
      (sql/handle-additional-options details)))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (hsql/call :timestampadd
             (hx/literal (case seconds-or-milliseconds
                           :seconds      "second"
                           :milliseconds "millisecond"))
             expr
             (hsql/raw "timestamp '1970-01-01T00:00:00Z'")))


;; H2 doesn't have date_trunc() we fake it by formatting a date to an appropriate string
;; and then converting back to a date.
;; Format strings are the same as those of SimpleDateFormat.
(defn- format-datetime   [format-str expr] (hsql/call :formatdatetime expr (hx/literal format-str)))
(defn- parse-datetime    [format-str expr] (hsql/call :parsedatetime expr  (hx/literal format-str)))
(defn- trunc-with-format [format-str expr] (parse-datetime format-str (format-datetime format-str expr)))

(defn- date [unit expr]
  (case unit
    :default         expr
    :minute          (trunc-with-format "yyyyMMddHHmm" expr)
    :minute-of-hour  (hx/minute expr)
    :hour            (trunc-with-format "yyyyMMddHH" expr)
    :hour-of-day     (hx/hour expr)
    :day             (hx/->date expr)
    :day-of-week     (hsql/call :day_of_week expr)
    :day-of-month    (hsql/call :day_of_month expr)
    :day-of-year     (hsql/call :day_of_year expr)
    :week            (trunc-with-format "YYYYww" expr) ; Y = week year; w = week in year
    :week-of-year    (hx/week expr)
    :month           (trunc-with-format "yyyyMM" expr)
    :month-of-year   (hx/month expr)
    ;; Rounding dates to quarters is a bit involved but still doable. Here's the plan:
    ;; *  extract the year and quarter from the date;
    ;; *  convert the quarter (1 - 4) to the corresponding starting month (1, 4, 7, or 10).
    ;;    (do this by multiplying by 3, giving us [3 6 9 12]. Then subtract 2 to get [1 4 7 10])
    ;; *  Concatenate the year and quarter start month together to create a yyyyMM date string;
    ;; *  Parse the string as a date. :sunglasses:
    ;;
    ;; Postgres DATE_TRUNC('quarter', x)
    ;; becomes  PARSEDATETIME(CONCAT(YEAR(x), ((QUARTER(x) * 3) - 2)), 'yyyyMM')
    :quarter         (parse-datetime "yyyyMM"
                                     (hx/concat (hx/year expr) (hx/- (hx/* (hx/quarter expr)
                                                                           3)
                                                                     2)))
    :quarter-of-year (hx/quarter expr)
    :year            (hx/year expr)))

;; TODO - maybe rename this relative-date ?
(defn- date-interval [unit amount]
  (if (= unit :quarter)
    (recur :month (hx/* amount 3))
    (hsql/call :dateadd (hx/literal unit) amount :%now)))


(defn- humanize-connection-error-message [message]
  (condp re-matches message
    #"^A file path that is implicitly relative to the current working directory is not allowed in the database URL .*$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^Database .* not found .*$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^Wrong user name or password .*$"
    (driver/connection-error-messages :username-or-password-incorrect)

    #".*" ; default
    message))

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))

(def ^:private date-format-str   "yyyy-MM-dd HH:mm:ss.SSS zzz")
(def ^:private h2-date-formatters (driver/create-db-time-formatters date-format-str))
(def ^:private h2-db-time-query  (format "select formatdatetime(current_timestamp(),'%s') AS VARCHAR" date-format-str))

(defrecord CSVDriver []
  clojure.lang.Named
  (getName [_] "CSV"))

(u/strict-extend CSVDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval                     (u/drop-first-arg date-interval)
          :details-fields                    (constantly [{:name         "db"
                                                           :display-name "Path to CSV file."
                                                           :placeholder  "file path to folder containing csv file"
                                                           :required     true}
                                                          {:name         "separator"
                                                           :display-name "separator"
                                                           :placeholder  ","
                                                           :required     false
                                                           }
                                                          {:name         "quotechar"
                                                           :display-name "quotechar"
                                                           :placeholder  "\""
                                                           :required     false
                                                           }
                                                           {:name         "indexedFiles"
                                                            :display-name "indexedFiles"
                                                            :placeholder  "true"
                                                            :type         :boolean
                                                            :required     false
                                                           }
                                                           {:name         "fileTailPattern"
                                                            :display-name "fileTailPattern"
                                                            :placeholder  "_(.*)"
                                                            :required     false
                                                           }
                                                           {:name         "fileTailParts"
                                                            :display-name "fileTailParts"
                                                            :placeholder  "junk"
                                                            :required     false
                                                           }
                                                           {:name         "fileTailPrepend"
                                                            :display-name "fileTailPrepend"
                                                            :placeholder  "true"
                                                            :type         :boolean
                                                            :required     false
                                                           }
                                                           {:name         "fileExtension"
                                                            :display-name "fileExtension"
                                                            :placeholder  ".csv"
                                                            :required     true
                                                           }                                                           ])
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)
          :current-db-time                   (driver/make-current-db-time-fn h2-db-time-query h2-date-formatters)})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:active-tables             sql/post-filtered-active-tables
          :column->base-type         (u/drop-first-arg column->base-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(defn -init-driver
  "Register the CSV driver"
  []
  (driver/register-driver! :csv (CSVDriver.)))
