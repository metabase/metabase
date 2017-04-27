(ns metabase.driver.mysql
  (:require [clojure
             [set :as set]
             [string :as s]]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.db.spec :as dbspec]
            [metabase.driver.generic-sql :as sql]
            [metabase.util
             [honeysql-extensions :as hx]
             [ssh :as ssh]]))


;;; # IMPLEMENTATION

(defn- column->base-type [column-type]
  ({:BIGINT     :type/BigInteger
    :BINARY     :type/*
    :BIT        :type/Boolean
    :BLOB       :type/*
    :CHAR       :type/Text
    :DATE       :type/Date
    :DATETIME   :type/DateTime
    :DECIMAL    :type/Decimal
    :DOUBLE     :type/Float
    :ENUM       :type/*
    :FLOAT      :type/Float
    :INT        :type/Integer
    :INTEGER    :type/Integer
    :LONGBLOB   :type/*
    :LONGTEXT   :type/Text
    :MEDIUMBLOB :type/*
    :MEDIUMINT  :type/Integer
    :MEDIUMTEXT :type/Text
    :NUMERIC    :type/Decimal
    :REAL       :type/Float
    :SET        :type/*
    :SMALLINT   :type/Integer
    :TEXT       :type/Text
    :TIME       :type/Time
    :TIMESTAMP  :type/DateTime
    :TINYBLOB   :type/*
    :TINYINT    :type/Integer
    :TINYTEXT   :type/Text
    :VARBINARY  :type/*
    :VARCHAR    :type/Text
    :YEAR       :type/Integer} (keyword (s/replace (name column-type) #"\sUNSIGNED$" "")))) ; strip off " UNSIGNED" from end if present

(def ^:private ^:const default-connection-args
  "Map of args for the MySQL JDBC connection string.
   Full list of is options is available here: http://dev.mysql.com/doc/connector-j/6.0/en/connector-j-reference-configuration-properties.html"
  {:zeroDateTimeBehavior :convertToNull ; 0000-00-00 dates are valid in MySQL; convert these to `null` when they come back because they're illegal in Java
   :useUnicode           :true          ; Force UTF-8 encoding of results
   :characterEncoding    :UTF8
   :characterSetResults  :UTF8})

(def ^:private ^:const ^String default-connection-args-string
  (s/join \& (for [[k v] default-connection-args]
               (str (name k) \= (name v)))))

(defn- append-connection-args
  "Append `default-connection-args-string` to the connection string in CONNECTION-DETAILS, and an additional option to explicitly disable SSL if appropriate.
   (Newer versions of MySQL will complain if you don't explicitly disable SSL.)"
  {:argslist '([connection-spec details])}
  [{connection-string :subname, :as connection-spec} {ssl? :ssl}]
  (assoc connection-spec
    :subname (str connection-string "?" default-connection-args-string (when-not ssl?
                                                                         "&useSSL=false"))))

(defn- connection-details->spec [details]
  (-> details
      (set/rename-keys {:dbname :db})
      dbspec/mysql
      (append-connection-args details)
      (sql/handle-additional-options details)))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (hsql/call :from_unixtime (case seconds-or-milliseconds
                              :seconds      expr
                              :milliseconds (hx// expr 1000))))

(defn- date-format [format-str expr] (hsql/call :date_format expr (hx/literal format-str)))
(defn- str-to-date [format-str expr] (hsql/call :str_to_date expr (hx/literal format-str)))

;; Since MySQL doesn't have date_trunc() we fake it by formatting a date to an appropriate string and then converting back to a date.
;; See http://dev.mysql.com/doc/refman/5.6/en/date-and-time-functions.html#function_date-format for an explanation of format specifiers
(defn- trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))

(defn- date [unit expr]
  (case unit
    :default         expr
    :minute          (trunc-with-format "%Y-%m-%d %H:%i" expr)
    :minute-of-hour  (hx/minute expr)
    :hour            (trunc-with-format "%Y-%m-%d %H" expr)
    :hour-of-day     (hx/hour expr)
    :day             (hsql/call :date expr)
    :day-of-week     (hsql/call :dayofweek expr)
    :day-of-month    (hsql/call :dayofmonth expr)
    :day-of-year     (hsql/call :dayofyear expr)
    ;; To convert a YEARWEEK (e.g. 201530) back to a date you need tell MySQL which day of the week to use,
    ;; because otherwise as far as MySQL is concerned you could be talking about any of the days in that week
    :week            (str-to-date "%X%V %W"
                                  (hx/concat (hsql/call :yearweek expr)
                                             (hx/literal " Sunday")))
    ;; mode 6: Sunday is first day of week, first week of year is the first one with 4+ days
    :week-of-year    (hx/inc (hx/week expr 6))
    :month           (str-to-date "%Y-%m-%d"
                                  (hx/concat (date-format "%Y-%m" expr)
                                             (hx/literal "-01")))
    :month-of-year   (hx/month expr)
    ;; Truncating to a quarter is trickier since there aren't any format strings.
    ;; See the explanation in the H2 driver, which does the same thing but with slightly different syntax.
    :quarter         (str-to-date "%Y-%m-%d"
                                  (hx/concat (hx/year expr)
                                             (hx/literal "-")
                                             (hx/- (hx/* (hx/quarter expr)
                                                         3)
                                                   2)
                                             (hx/literal "-01")))
    :quarter-of-year (hx/quarter expr)
    :year            (hx/year expr)))

(defn- date-interval [unit amount]
  (hsql/call :date_add
    :%now
    (hsql/raw (format "INTERVAL %d %s" (int amount) (name unit)))))

(defn- humanize-connection-error-message [message]
  (condp re-matches message
        #"^Communications link failure\s+The last packet sent successfully to the server was 0 milliseconds ago. The driver has not received any packets from the server.$"
        (driver/connection-error-messages :cannot-connect-check-host-and-port)

        #"^Unknown database .*$"
        (driver/connection-error-messages :database-name-incorrect)

        #"Access denied for user.*$"
        (driver/connection-error-messages :username-or-password-incorrect)

        #"Must specify port after ':' in connection string"
        (driver/connection-error-messages :invalid-hostname)

        #".*" ; default
        message))

(defn- string-length-fn [field-key]
  (hsql/call :char_length field-key))


(defrecord MySQLDriver []
  clojure.lang.Named
  (getName [_] "MySQL"))

(u/strict-extend MySQLDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval                     (u/drop-first-arg date-interval)
          :details-fields                    (constantly (ssh/with-tunnel-config
                                                           [{:name         "host"
                                                             :display-name "Host"
                                                             :default      "localhost"}
                                                            {:name         "port"
                                                             :display-name "Port"
                                                             :type         :integer
                                                             :default      3306}
                                                            {:name         "dbname"
                                                             :display-name "Database name"
                                                             :placeholder  "birds_of_the_word"
                                                             :required     true}
                                                            {:name         "user"
                                                             :display-name "Database username"
                                                             :placeholder  "What username do you use to login to the database?"
                                                             :required     true}
                                                            {:name         "password"
                                                             :display-name "Database password"
                                                             :type         :password
                                                             :placeholder  "*******"}
                                                            {:name         "additional-options"
                                                             :display-name "Additional JDBC connection string options"
                                                             :placeholder  "tinyInt1isBit=false"}]))
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:active-tables             sql/post-filtered-active-tables
          :column->base-type         (u/drop-first-arg column->base-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :excluded-schemas          (constantly #{"INFORMATION_SCHEMA"})
          :quote-style               (constantly :mysql)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          ;; If this fails you need to load the timezone definitions from your system into MySQL;
          ;; run the command `mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root mysql`
          ;; See https://dev.mysql.com/doc/refman/5.7/en/time-zone-support.html for details
          ;; TODO - This can also be set via `sessionVariables` in the connection string, if that's more useful (?)
          :set-timezone-sql          (constantly "SET @@session.time_zone = %s;")
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(driver/register-driver! :mysql (MySQLDriver.))
