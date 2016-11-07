(ns metabase.driver.impala
  (:require (clojure [set :as set]
                     [string :as s])
            [honeysql.core :as hsql]
            [metabase.db.spec :as dbspec]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]))

;;; # IMPLEMENTATION
;; See http://www.cloudera.com/documentation/other/connectors/impala-jdbc/latest/Cloudera-JDBC-Driver-for-Impala-Install-Guide.pdf
;; for all information regarding the Impala JDBC driver.

(def ^:private ^:const column->base-type
  "See: http://www.cloudera.com/documentation/enterprise/latest/topics/impala_datatypes.html"
  {:INT        :type/Integer
    :STRING     :type/Text
    :ARRAY      :type/Text
    :BIGINT     :type/BigInteger
    :BINARY     :type/*
    :BOOLEAN    :type/Boolean
    :CHAR       :type/Text
    :DATE       :type/Date
    :DECIMAL    :type/Decimal
    :DOUBLE     :type/Float
    :FLOAT      :type/Float
    :MAP        :type/Text
    :SMALLINT   :type/Integer
    :STRUCT     :type/Text
    :TIMESTAMP  :type/DateTime
    :TINYINT    :type/Integer
    :VARCHAR    :type/Text})

(defn- connection-details->spec [details]
  (-> details
      (set/rename-keys {:dbname :db})
      dbspec/impala
      (dissoc :ssl))) ;; SSL attribute is part of connProperties


(defn- trunc
  "Truncate a date.
  See: http://www.cloudera.com/documentation/enterprise/latest/topics/impala_datetime_functions.html
      (trunc :day v) -> trunc(v, 'day')"
  [format-template v]
  (hsql/call :trunc v (hx/literal format-template)))


(defn- date
  "Apply truncation / extraction to a date field or value for Oracle."
  [unit v]
  (case unit
    :default         (hx/->timestamp v)
    :minute          (hsql/call :trunc v (str "MI"))
    :minute-of-hour  (hsql/call :extract v (str "minute"))
    :hour            (hsql/call :trunc v (str "HH"))
    :hour-of-day     (hsql/call :extract v (str "hour"))
    :day             (hsql/call :trunc v (str "DD")) 
    :day-of-week     (hsql/call :dayofweek v) 
    :day-of-month    (hsql/call :dayofmonth v)
    :day-of-year     (hsql/call :dayofyear v)
    :week            (hsql/call :trunc v (str "DAY")) 
    :week-of-year    (hsql/call :weekofyear v)
    :month           (hsql/call :trunc v (str "MONTH")) 
    :month-of-year   (hsql/call :extract v (str "month"))
    :quarter         (hsql/call :trunc v (str "Q")) 
    ;; SQL: select floor((extract(trunc(now(), 'Q'), "month") /3) + 1);
    :quarter-of-year (hsql/call :floor (inc (/ 
                     (hsql/call :extract 
                     (hsql/call :trunc v (str "Q")), (str "month")) 3))) 
    :year            (hsql/call :extract (str "year") v)))


(def ^:private ^:const now (hsql/call :now))


(defn- date-interval [unit amount]
  (hsql/call :date_add
    :%now
    (hsql/raw (format "INTERVAL %d %s" (int amount) (name unit)))))


(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (hsql/call :from_unixtime (case seconds-or-milliseconds
                              :seconds      expr
                              :milliseconds (hx// expr 1000))))


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


(defrecord ImpalaDriver []
  clojure.lang.Named
  (getName [_] "Impala"))

(u/strict-extend ImpalaDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval                     (u/drop-first-arg date-interval)
          :details-fields                    (constantly [{:name         "host"
                                                           :display-name "Host"
                                                           :default      "localhost"}
                                                          {:name         "port"
                                                           :display-name "Port"
                                                           :type         :integer
                                                           :default      21050}
                                                          {:name         "dbname"
                                                           :display-name "Database name"
                                                           :placeholder  "Store_Sales"
                                                           :required     false}  ;;database is optional in the connection url
                                                          {:name         "user"
                                                           :display-name "Database username"
                                                           :placeholder  "What username do you use to login to the database?"
                                                           :required     false}  ;; Impala AuthMech=0 does not require username and password to connect.
                                                                                 ;; AuthMech=0 == Wildy insecure!!!
                                                          {:name         "password"
                                                           :display-name "Database password"
                                                           :type         :password
                                                           :placeholder  "*******"
                                                           :required     false} ;; Impala authMech=2 does not require password
                                                           {:name        "connProperties"  ;;Impala driver supports many additional properties
                                                                                           ;;These properties are semicolon separated.     
                                                           :display-name "Connection attributes"
                                                           :placeholder  ";AuthMech=1;KrbRealm=EXAMPLE.COM;KrbHostFQDN=impala.example.com;KrbServiceName=impala"}])
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:active-tables             sql/post-filtered-active-tables
          :column->base-type         (u/drop-first-arg column->base-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          ;;Impala likes mysql style backticks around table and attr names.
          :quote-style               (constantly :mysql)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))


(driver/register-driver! :impala (ImpalaDriver.))

