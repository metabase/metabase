(ns metabase.driver.firebird
  "Firebird Driver."
  (:require [clojure
             [set :as set :refer [rename-keys]]
             [string :as str]]
            [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.db.spec :as dbspec]
            [metabase.driver.generic-sql :as sql]
            [metabase.util
             [honeysql-extensions :as hx]
             [ssh :as ssh]]))

(defrecord FirebirdDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "Firebird"))

;; Connection Properties

(defn firebird->spec
  "Create a database specification for a firebird database. Opts should include keys
  for :db, :user, and :password. You can also optionally set host and port."
  [{:keys [host port db]
    :or   {host "localhost", port 3050, db ""}
    :as   opts}]
  (merge {:classname   "org.firebird.jdbc.FBDriver"
          :subprotocol "firebirdsql"
          :subname     (str "//" host ":" port "/" db)}
         (dissoc opts :host :port :db)))

(def ^:private ^:const default-connection-args
    "Map of properties for the Firebird JDBC connection URL.
     Full list of is options is available here:
     https://github.com/FirebirdSQL/jaybird/wiki/Connection-properties"
    {;; Available encodings: https://github.com/FirebirdSQL/jaybird/wiki/Character-encodings
     :encoding    :UTF8
     :charSet     :UTF-8})

    "String consisting of the properties specified in the map
     `default-connection-args` seperated by `&`"
(def ^:private ^:const ^String default-connection-args-string
    (str/join \& (for [[k v] default-connection-args]
                   (str (name k) \= (name v)))))

(defn- append-connection-args
    "Append `default-connection-args-string` to the connection string in CONNECTION-DETAILS, seperated by `?`"
  [connection-spec details]
  (assoc connection-spec :subname (str (:subname connection-spec) "?" default-connection-args-string)))

(defn- connection-details->spec
  "Create a database specification for a Firebird database."
  [details]
  (-> details
      (set/rename-keys {:dbname :db})
      firebird->spec
      (append-connection-args details)
      (sql/handle-additional-options details)))

(defn- can-connect?
  "Check the db for connectivity. Uses the query \"SELECT 1 FROM RDB$DATABASE\" instead of
   the default \"SELECT 1\" which Firebird doesn't support."
  [driver details]
  (let [details-with-tunnel (ssh/include-ssh-tunnel details)
        connection (connection-details->spec details-with-tunnel)]
    (= 1 (first (vals (first (jdbc/query connection ["SELECT 1 FROM RDB$DATABASE"])))))))

;; Function Implementations

(def ^:private ^:const column->base-type
    {:INT64                         :type/BigInteger
     :CHAR                          :type/Text
     :TIMESTAMP                     :type/DateTime
     :DECIMAL                       :type/Decimal
     :FLOAT                         :type/Float
     :BLOB                          :type/*
     :INTEGER                       :type/Integer
     :NUMERIC                       :type/Decimal
     :DOUBLE                        :type/Float
     :SMALLINT                      :type/Integer
     :VARCHAR                       :type/Text
     :BIGINT                        :type/BigInteger
     :DATE                          :type/Date
     (keyword "BLOB SUB_TYPE 0")    :type/*
     (keyword "BLOB SUB_TYPE 1")    :type/Text
     (keyword "DOUBLE PRECISION")   :type/Float})

(defn- string-length-fn
  [field-key]
  (hsql/call :char_length (hx/cast :VARCHAR field-key)))

(defn- apply-limit
  "Apply a `filter` clause to HONEYSQL-FORM. Uses \"FIRST\" instead of \"LIMIT\""
  [honeysql-form {value :limit}]
    (assoc honeysql-form :modifiers [(format "FIRST %d" value)]))

;; Date/Time operations

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (log/info (u/format-color 'red "Converting unix to timestamp. Expr: %s | s.or.m: %s" expr seconds-or-milliseconds))
  (case seconds-or-milliseconds
    ;; found on http://thejavo.blogspot.com/2012/07/firebird-convertir-un-unix-timestamp.html
    :seconds      (hsql/call :DATEADD :SECOND expr (hx/cast :TIMESTAMP (hx/literal "01-01-1970 00:00:00")))
    :milliseconds (recur (hx// expr 1000) :seconds)))

;; Specifies what Substring to replace for a given time unit
(defn get-unit-placeholder [unit]
  (case unit
    :SECOND :ss
    :MINUTE :mm
    :HOUR   :hh
    :DAY    :DD
    :MONTH  :MM
    :YEAR   :YYYY))

(defn get-unit-name [unit]
  (case unit
    0 :SECOND
    1 :MINUTE
    2 :HOUR
    3 :DAY
    4 :MONTH
    5 :YEAR))

;; Replace the specified part of the timestamp
(defn replace-timestamp-part [input unit expr]
  (hsql/call :replace input (hx/literal (get-unit-placeholder unit)) (hsql/call :extract unit expr)))

;; Format a timestamp
(defn format-step [expr input step wanted-unit]
    (if (> step wanted-unit)
      (format-step expr (replace-timestamp-part input (get-unit-name step) expr) (- step 1) wanted-unit)
      (replace-timestamp-part input (get-unit-name step) expr)))

;; Format a Timestamp
(defn format-timestamp [expr format-template wanted-unit]
  (format-step expr (hx/literal format-template) 5 wanted-unit))

;; Firebird doesn't have a date_trunc function, so use a workaround: First format the timestamp to a
;; string of the wanted resulution, then convert it back to a timestamp
(defn date-trunc [expr format-str wanted-unit]
  (hx/cast :TIMESTAMP (format-timestamp expr format-str wanted-unit)))

(defn date [unit expr]
  ;; First, cast the expression to a timestamp/date
  (if (or (instance? clojure.lang.Keyword expr) (instance? honeysql.types.SqlCall expr))
    (do (def expr-timestamp (hx/cast :TIMESTAMP expr))
        (def expr-date (hx/cast :DATE expr)))
    (do (def expr-timestamp (hx/cast :TIMESTAMP (hx/literal (str expr))))
        (def expr-date (hx/cast :DATE (hx/literal (str expr))))))
  (case unit
    :second           (date-trunc expr-timestamp "YYYY-MM-DD hh:mm:ss" 0)
    :minute           (date-trunc expr-timestamp "YYYY-MM-DD hh:mm:00" 1)
    :minute-of-hour   (hsql/call :extract :MINUTE expr-timestamp)
    :hour             (date-trunc expr-timestamp "YYYY-MM-DD hh:00:00" 2)
    :hour-of-day      (hsql/call :extract :HOUR   expr-timestamp)
    :day              (date-trunc expr-timestamp "YYYY-MM-DD" 3)
    ;; Firebird DOW is 0 (Sun) - 6 (Sat); increment this to be consistent with Java, H2, MySQL, and
    ;; Mongo (1-7)
    :day-of-week      (hx/+ (hsql/call :extract :WEEKDAY expr-timestamp) 1)
    :day-of-month     (hsql/call :extract :DAY expr-timestamp)
    ;; Firebird YEARDAY starts from 0; increment this
    :day-of-year      (hx/+ (hsql/call :extract :YEARDAY expr-timestamp) 1)
    ;; Use hsql/raw for DAY in dateadd because the keyword :WEEK gets surrounded with quotations
    :week             (hsql/call :dateadd (hsql/raw "DAY") (hx/- 0 (hsql/call :extract :WEEKDAY expr-date)) expr-date)
    :week-of-year     (hsql/call :extract :WEEK expr-timestamp)
    :month            (date-trunc expr-timestamp "YYYY-MM-01" 4)
    :month-of-year    (hsql/call :extract :MONTH expr-timestamp)
    :quarter          (hsql/call :dateadd (hsql/raw "MONTH") (hx/* (hx// (hx/- (hsql/call :extract :MONTH expr-timestamp) 1) 3) 3) (date-trunc expr-timestamp "YYYY-01-01" 5))
    :quarter-of-year  (hx/+ (hx// (hx/- (hsql/call :extract :MONTH expr-timestamp) 1) 3) 1)
    :year             (date-trunc expr-timestamp "YYYY-01-01" 5)
    :default          expr))

;; Defaults
(def FirebirdISQLDriverMixin
  (merge (sql/ISQLDriverDefaultsMixin)
         {:connection-details->spec   (u/drop-first-arg connection-details->spec)
          :column->base-type          (u/drop-first-arg column->base-type)
          :string-length-fn           (u/drop-first-arg string-length-fn)
          :active-tables              sql/post-filtered-active-tables
          :apply-limit                (u/drop-first-arg apply-limit)
          :current-datetime-fn        (constantly (hx/cast :timestamp (hx/literal :now)))
          :unix-timestamp->timestamp  (u/drop-first-arg unix-timestamp->timestamp)
          :date                       (u/drop-first-arg date)}))

(u/strict-extend FirebirdDriver
  driver/IDriver
  (merge
    (sql/IDriverSQLDefaultsMixin)
      {:details-fields        (constantly (ssh/with-tunnel-config
                                            [driver/default-host-details
                                             (assoc driver/default-port-details :default 3050)
                                             driver/default-dbname-details
                                             driver/default-user-details
                                             driver/default-password-details
                                             driver/default-ssl-details]))
       :can-connect?          can-connect?})

  sql/ISQLDriver FirebirdISQLDriverMixin)

(defn -init-driver
  "Register the FirebirdSQL driver"
  []
  (driver/register-driver! :firebird (FirebirdDriver.)))
