(ns metabase.driver.athena
  "Athena driver."
  (:require [metabase.driver :as driver]
            [metabase.util :as u]
            [metabase.driver.generic-sql :as sql]
            [honeysql
             [core :as hsql]]
            [metabase.util
             [honeysql-extensions :as hx]]))

(defrecord AthenaDriver []
  clojure.lang.Named
  (getName [_] "Athena"))

(defn- connection-details->spec
  [{:keys [region, s3_staging_dir, user, password]
    :as   opts}]
  {:classname "com.simba.athena.jdbc.Driver"
   :subprotocol "awsathena"
   :subname (str "//athena." region ".amazonaws.com:443")
   :user        user
   :password    password
   :s3_staging_dir s3_staging_dir})

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :from_unixtime expr)
    :milliseconds (recur (hx// expr 1000.0) :seconds)))

(defn- date [unit expr]
  (case unit
    :default         expr
    :minute          (hsql/call :date_trunc (hx/literal :minute) expr)
    :minute-of-hour  (hsql/call :minute expr)
    :hour            (hsql/call :date_trunc (hx/literal :hour) expr)
    :hour-of-day     (hsql/call :hour expr)
    :day             (hsql/call :date_trunc (hx/literal :day) expr)
    ;; Presto is ISO compliant, so we need to offset Monday = 1 to Sunday = 1
    :day-of-week     (hx/+ (hx/mod (hsql/call :day_of_week expr) 7) 1)
    :day-of-month    (hsql/call :day expr)
    :day-of-year     (hsql/call :day_of_year expr)
    ;; Similar to DoW, sicne Presto is ISO compliant the week starts on Monday, we need to shift that to Sunday
    :week            (hsql/call :date_add (hx/literal :day) -1 (hsql/call :date_trunc (hx/literal :week) (hsql/call :date_add (hx/literal :day) 1 expr)))
    ;; Offset by one day forward to "fake" a Sunday starting week
    :week-of-year    (hsql/call :week (hsql/call :date_add (hx/literal :day) 1 expr))
    :month           (hsql/call :date_trunc (hx/literal :month) expr)
    :month-of-year   (hsql/call :month expr)
    :quarter         (hsql/call :date_trunc (hx/literal :quarter) expr)
    :quarter-of-year (hsql/call :quarter expr)
    :year            (hsql/call :year expr)))

(u/strict-extend AthenaDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:details-fields (constantly [{:name         "region"
                                        :display-name "Region"
                                        :placeholder  "us-east-1"
                                        :required     true}
                                       {:name         "s3_staging_dir"
                                        :display-name "Staging dir"
                                        :placeholder  "See 'Query result location' in Athena settings"}
                                       {:name         "user"
                                        :display-name "AWS access key"
                                        :placeholder  "AWS_ACCESS_KEY_ID"
                                        :required     true}
                                       {:name         "password"
                                        :display-name "AWS secret key"
                                        :type         :password
                                        :placeholder  "AWS_SECRET_ACCESS_KEY"
                                        :required     true}])})
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
        {:connection-details->spec   (u/drop-first-arg connection-details->spec)
          :column->base-type         (constantly nil)
          :string-length-fn          (constantly nil)
          :date                      (u/drop-first-arg date)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(driver/register-driver! :athena (AthenaDriver.))