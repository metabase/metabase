(ns metabase.driver.mysql
  (:require (clojure [set :as set]
                     [string :as s])
            (korma [core :as k]
                   [db :as kdb]
                   mysql)
            (korma.sql [engine :refer [sql-func]]
                       [utils :as kutils])
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.util :as u]
            [metabase.util.korma-extensions :as kx]))

;;; # Korma 0.4.2 Bug Workaround
;; (Buggy code @ https://github.com/korma/Korma/blob/684178c386df529558bbf82097635df6e75fb339/src/korma/mysql.clj)
;; This looks like it's been fixed upstream but until a new release is available we'll have to hack the function here

(defn- mysql-count [query v]
  (sql-func "COUNT" (if (and (or (instance? clojure.lang.Named v) ; the issue was that name was being called on things that like maps when we tried to get COUNT(DISTINCT(...))
                                 (string? v))                     ; which would barf since maps don't implement clojure.lang.Named
                             (= (name v) "*"))
                      (kutils/generated "*")
                      v)))

(intern 'korma.mysql 'count mysql-count)


;;; # IMPLEMENTATION

(defn- column->base-type [column-type]
  ({:BIGINT     :BigIntegerField
    :BINARY     :UnknownField
    :BIT        :BooleanField
    :BLOB       :UnknownField
    :CHAR       :CharField
    :DATE       :DateField
    :DATETIME   :DateTimeField
    :DECIMAL    :DecimalField
    :DOUBLE     :FloatField
    :ENUM       :UnknownField
    :FLOAT      :FloatField
    :INT        :IntegerField
    :INTEGER    :IntegerField
    :LONGBLOB   :UnknownField
    :LONGTEXT   :TextField
    :MEDIUMBLOB :UnknownField
    :MEDIUMINT  :IntegerField
    :MEDIUMTEXT :TextField
    :NUMERIC    :DecimalField
    :REAL       :FloatField
    :SET        :UnknownField
    :TEXT       :TextField
    :TIME       :TimeField
    :TIMESTAMP  :DateTimeField
    :TINYBLOB   :UnknownField
    :TINYINT    :IntegerField
    :TINYTEXT   :TextField
    :VARBINARY  :UnknownField
    :VARCHAR    :TextField
    :YEAR       :IntegerField} (keyword (s/replace (name column-type) #"\sUNSIGNED$" "")))) ; strip off " UNSIGNED" from end if present

(def ^:private ^:const connection-args
  "Map of args for the MySQL JDBC connection string.
   Full list of is options is available here: http://dev.mysql.com/doc/connector-j/6.0/en/connector-j-reference-configuration-properties.html"
  {:zeroDateTimeBehavior :convertToNull ; 0000-00-00 dates are valid in MySQL; convert these to `null` when they come back because they're illegal in Java
   :useUnicode           :true          ; Force UTF-8 encoding of results
   :characterEncoding    :UTF8
   :characterSetResults  :UTF8})

(def ^:private ^:const connection-args-string
  (apply str "?" (interpose \& (for [[k v] connection-args]
                                 (str (name k) \= (name v))))))

(defn- connection-details->spec [details]
  (-> details
      (set/rename-keys {:dbname :db})
      kdb/mysql
      (update :subname (u/rpartial str connection-args-string))))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (k/sqlfn :FROM_UNIXTIME (case seconds-or-milliseconds
                            :seconds      expr
                            :milliseconds (kx// expr (k/raw 1000)))))

(defn- date-format [format-str expr] (k/sqlfn :DATE_FORMAT expr (kx/literal format-str)))
(defn- str-to-date [format-str expr] (k/sqlfn :STR_TO_DATE expr (kx/literal format-str)))

;; Since MySQL doesn't have date_trunc() we fake it by formatting a date to an appropriate string and then converting back to a date.
;; See http://dev.mysql.com/doc/refman/5.6/en/date-and-time-functions.html#function_date-format for an explanation of format specifiers
(defn- trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))

(defn- date [unit expr]
  (case unit
    :default         expr
    :minute          (trunc-with-format "%Y-%m-%d %H:%i" expr)
    :minute-of-hour  (kx/minute expr)
    :hour            (trunc-with-format "%Y-%m-%d %H" expr)
    :hour-of-day     (kx/hour expr)
    :day             (k/sqlfn :DATE expr)
    :day-of-week     (k/sqlfn :DAYOFWEEK expr)
    :day-of-month    (k/sqlfn :DAYOFMONTH expr)
    :day-of-year     (k/sqlfn :DAYOFYEAR expr)
    ;; To convert a YEARWEEK (e.g. 201530) back to a date you need tell MySQL which day of the week to use,
    ;; because otherwise as far as MySQL is concerned you could be talking about any of the days in that week
    :week            (str-to-date "%X%V %W"
                                  (kx/concat (k/sqlfn :YEARWEEK expr)
                                             (kx/literal " Sunday")))
    ;; mode 6: Sunday is first day of week, first week of year is the first one with 4+ days
    :week-of-year    (kx/inc (kx/week expr 6))
    :month           (str-to-date "%Y-%m-%d"
                                  (kx/concat (date-format "%Y-%m" expr)
                                             (kx/literal "-01")))
    :month-of-year   (kx/month expr)
    ;; Truncating to a quarter is trickier since there aren't any format strings.
    ;; See the explanation in the H2 driver, which does the same thing but with slightly different syntax.
    :quarter         (str-to-date "%Y-%m-%d"
                                  (kx/concat (kx/year expr)
                                             (kx/literal "-")
                                             (kx/- (kx/* (kx/quarter expr)
                                                         3)
                                                   2)
                                             (kx/literal "-01")))
    :quarter-of-year (kx/quarter expr)
    :year            (kx/year expr)))

(defn- date-interval [unit amount]
  (kutils/generated (format "DATE_ADD(NOW(), INTERVAL %d %s)" (int amount) (s/upper-case (name unit)))))

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


(defrecord MySQLDriver []
  clojure.lang.Named
  (getName [_] "MySQL"))

(u/strict-extend MySQLDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval                     (u/drop-first-arg date-interval)
          :details-fields                    (constantly [{:name         "host"
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
                                                           :placeholder  "*******"}])
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:active-tables             sql/post-filtered-active-tables
          :column->base-type         (u/drop-first-arg column->base-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :excluded-schemas          (constantly #{"INFORMATION_SCHEMA"})
          :string-length-fn          (constantly :CHAR_LENGTH)
          ;; If this fails you need to load the timezone definitions from your system into MySQL;
          ;; run the command `mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root mysql`
          ;; See https://dev.mysql.com/doc/refman/5.7/en/time-zone-support.html for details
          ;; TODO - This can also be set via `sessionVariables` in the connection string, if that's more useful (?)
          :set-timezone-sql          (constantly "SET @@session.time_zone = ?;")
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(driver/register-driver! :mysql (MySQLDriver.))
