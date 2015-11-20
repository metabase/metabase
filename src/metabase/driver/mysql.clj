(ns metabase.driver.mysql
  (:require (clojure [set :as set]
                     [string :as s])
            (korma [core :as k]
                   [db :as kdb]
                   mysql)
            (korma.sql [engine :refer [sql-func]]
                       [utils :as utils])
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.util :refer [funcs]]
            [metabase.util :as u]))

;;; # Korma 0.4.2 Bug Workaround
;; (Buggy code @ https://github.com/korma/Korma/blob/684178c386df529558bbf82097635df6e75fb339/src/korma/mysql.clj)
;; This looks like it's been fixed upstream but until a new release is available we'll have to hack the function here

(defn- mysql-count [query v]
  (sql-func "COUNT" (if (and (or (instance? clojure.lang.Named v) ; the issue was that name was being called on things that like maps when we tried to get COUNT(DISTINCT(...))
                                 (string? v))                     ; which would barf since maps don't implement clojure.lang.Named
                             (= (name v) "*"))
                      (utils/generated "*")
                      v)))

(intern 'korma.mysql 'count mysql-count)


;;; # IMPLEMENTATION

(defn- column->base-type [_ column-type]
  ({:BIGINT     :BigIntegerField
     :BINARY     :UnknownField
     :BIT        :UnknownField
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
     :YEAR       :IntegerField} column-type))

(defn- connection-details->spec [_ details]
  (-> details
      (set/rename-keys {:dbname :db})
      kdb/mysql
      ;; 0000-00-00 dates are valid in MySQL, but JDBC barfs when queries return them because java.sql.Date doesn't allow it.
      ;; Add a param to the end of the connection string that tells MySQL to convert 0000-00-00 dates to NULL when returning them.
      (update :subname (u/rpartial str "?zeroDateTimeBehavior=convertToNull"))))

(defn- unix-timestamp->timestamp [_ field-or-value seconds-or-milliseconds]
  (utils/func (case seconds-or-milliseconds
                :seconds      "FROM_UNIXTIME(%s)"
                :milliseconds "FROM_UNIXTIME(%s / 1000)")
                [field-or-value]))

;; Since MySQL doesn't have date_trunc() we fake it by formatting a date to an appropriate string and then converting back to a date.
;; See http://dev.mysql.com/doc/refman/5.6/en/date-and-time-functions.html#function_date-format for an explanation of format specifiers
(defn- trunc-with-format [format-str]
  (let [format-str (s/escape format-str {\% "%%"})] ; replace the format specifiers like %y with ones like %%y so they don't get treated as SQL arg placeholders in result str
    (format "STR_TO_DATE(DATE_FORMAT(%%s, '%s'), '%s')" format-str format-str)))

;; Truncating to a quarter is trickier since there aren't any format strings.
;; See the explanation in the H2 driver, which does the same thing but with slightly different syntax.
(defn- trunc-to-quarter [field-or-value]
  (funcs "STR_TO_DATE(%s, '%%Y-%%m-%%d')"
         ["CONCAT(%s)"
          ["YEAR(%s)" field-or-value]
          (k/raw "'-'")
          ["((QUARTER(%s) * 3) - 2)" field-or-value]
          (k/raw "'-01'")]))

(defn- date [_ unit field-or-value]
  (if (= unit :quarter)
    (trunc-to-quarter field-or-value)
    (utils/func (case unit
                  :default         "TIMESTAMP(%s)"
                  :minute          (trunc-with-format "%Y-%m-%d %H:%i")
                  :minute-of-hour  "MINUTE(%s)"
                  :hour            (trunc-with-format "%Y-%m-%d %H")
                  :hour-of-day     "HOUR(%s)"
                  :day             "DATE(%s)"
                  :day-of-week     "DAYOFWEEK(%s)"
                  :day-of-month    "DAYOFMONTH(%s)"
                  :day-of-year     "DAYOFYEAR(%s)"
                  ;; To convert a YEARWEEK (e.g. 201530) back to a date you need tell MySQL which day of the week to use,
                  ;; because otherwise as far as MySQL is concerned you could be talking about any of the days in that week
                  :week            "STR_TO_DATE(CONCAT(YEARWEEK(%s), ' Sunday'), '%%X%%V %%W')"
                  ;; mode 6: Sunday is first day of week, first week of year is the first one with 4+ days
                  :week-of-year    "(WEEK(%s, 6) + 1)"
                  :month           "STR_TO_DATE(CONCAT(DATE_FORMAT(%s, '%%Y-%%m'), '-01'), '%%Y-%%m-%%d')"
                  :month-of-year   "MONTH(%s)"
                  :quarter-of-year "QUARTER(%s)"
                  :year            "YEAR(%s)")
                [field-or-value])))

(defn- date-interval [_ unit amount]
  (utils/generated (format "DATE_ADD(NOW(), INTERVAL %d %s)" amount (s/upper-case (name unit)))))

(defn- humanize-connection-error-message [_ message]
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

(extend MySQLDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval                     date-interval
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
          :humanize-connection-error-message humanize-connection-error-message})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:column->base-type         column->base-type
          :connection-details->spec  connection-details->spec
          :date                      date
          :excluded-schemas          (constantly #{"INFORMATION_SCHEMA"})
          :string-length-fn          (constantly :CHAR_LENGTH)
          ;; If this fails you need to load the timezone definitions from your system into MySQL;
          ;; run the command `mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root mysql`
          ;; See https://dev.mysql.com/doc/refman/5.7/en/time-zone-support.html for details
          :set-timezone-sql          (constantly "SET @@session.time_zone = ?;")
          :unix-timestamp->timestamp unix-timestamp->timestamp}))

(driver/register-driver! :mysql (MySQLDriver.))
