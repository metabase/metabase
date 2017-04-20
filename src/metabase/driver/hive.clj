(ns metabase.driver.hive
  (:require
   [clojure.java.jdbc :as jdbc]
   (clojure [set :as set]
            [string :as s])
   [clojure.tools.logging :as log]
   [toucan.db :as db]
   (honeysql [core :as hsql]
             [helpers :as h])
   [metabase.db.spec :as dbspec]
   [metabase.driver :as driver]
   [metabase.driver.generic-sql :as sql]
   [metabase.driver.generic-sql.util.unprepare :as unprepare]
   [metabase.util :as u]
   [metabase.util.honeysql-extensions :as hx]
   [metabase.query-processor.util :as qputil]
   )
  (:import
   (java.util Date)))

(def ^:const column->base-type
  "Map of Spark SQL (Hive) column types -> Field base types.
   Add more mappings here as you come across them."
  {;; Numeric types
   :tinyint :type/Integer
   :smallint :type/Integer
   :int :type/Integer
   :integer :type/Integer
   :bigint :type/BigInteger
   :float :type/Float
   :double :type/Float
   (keyword "double precision") :type/Float
   :decimal :type/Decimal
   ;; Date/Time types
   :timestamp :type/DateTime
   :date :type/Date
   :interval :type/*
   :string :type/Text
   :varchar :type/Text
   :char :type/Text
   :boolean :type/Boolean
   :binary :type/*})

(def ^:const now (hsql/raw "NOW()"))

(defn unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (hx/->timestamp
   (hsql/call :from_unixtime (case seconds-or-milliseconds
                               :seconds      expr
                               :milliseconds (hx// expr 1000)))))

(defn- date-format [format-str expr]
  (hsql/call :date_format expr (hx/literal format-str)))

(defn- str-to-date [format-str expr]
  (hx/->timestamp
   (hsql/call :from_unixtime
              (hsql/call :unix_timestamp
                         expr (hx/literal format-str)))))

(defn trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))

(defn date [unit expr]
  (case unit
    :default expr
    :minute (trunc-with-format "yyyy-MM-dd HH:mm" expr)
    :minute-of-hour (hsql/call :minute expr)
    :hour (trunc-with-format "yyyy-MM-dd HH" expr)
    :hour-of-day (hsql/call :hour expr)
    :day (trunc-with-format "yyyy-MM-dd" expr)
    :day-of-week (hx/->integer (date-format "u"
                                            (hx/+ expr
                                                  (hsql/raw "interval '1' day"))))
    :day-of-month (hsql/call :dayofmonth expr)
    :day-of-year (hx/->integer (date-format "D" expr))
    :week (hsql/call :date_sub
                     (hx/+ expr
                           (hsql/raw "interval 1 day"))
                     (hsql/call :date_format
                                (hx/+ expr
                                      (hsql/raw "interval 1 day"))
                                "u"))
    :week-of-year (hsql/call :weekofyear expr)
    :month (hsql/call :trunc expr (hx/literal :MM))
    :month-of-year (hsql/call :month expr)
    :quarter (hsql/call :add_months
                        (hsql/call :trunc expr (hx/literal :year))
                        (hx/* (hx/- (hsql/call :quarter expr)
                                    1)
                              3))
    :quarter-of-year (hsql/call :quarter expr)
    :year (hsql/call :year expr)))

(defn date-interval [unit amount]
  (hsql/raw (format "(NOW() + INTERVAL '%d' %s)" (int amount) (name unit))))

(defn string-length-fn [field-key]
  (hsql/call :length field-key))

;; same as the normal one, except we don't include the schema name
(defn qualified-name-components
  "Return the pieces that represent a path to FIELD, of the form `[table-name parent-fields-name* field-name]`."
  [{field-name :name, table-id :table_id, parent-id :parent_id}]
  (conj (vec (if-let [parent (metabase.models.field/Field parent-id)]
               (qualified-name-components parent)
               (let [{table-name :name, schema :schema} (db/select-one ['Table :name :schema], :id table-id)]
                 [table-name])))
        field-name))

(defn field->identifier [field]
  (log/info "-asdf1" (prn-str field) " to " (apply hsql/qualify (qualified-name-components field)))
  (apply hsql/qualify (qualified-name-components field)))

;; copied from the Presto driver, except using mysql quoting style
(defn apply-page [honeysql-query {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can simply use limit
      (h/limit honeysql-query items)
      ;; if we need to do an offset we have to do nesting to generate a row number and where on that
      (let [over-clause (format "row_number() OVER (%s)"
                                (first (hsql/format (select-keys honeysql-query [:order-by])
                                                    :allow-dashed-names? true
                                                    :quoting :mysql)))]
        (-> (apply h/select (map last (:select honeysql-query)))
            (h/from (h/merge-select honeysql-query [(hsql/raw over-clause) :__rownum__]))
            (h/where [:> :__rownum__ offset])
            (h/limit items))))))

;; lots of copy-paste here. consider making some of those non-private instead.
(defn- exception->nice-error-message ^String [^java.sql.SQLException e]
  (or (->> (.getMessage e)     ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
           (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
           second)             ; so just return the part of the exception that is relevant
      (.getMessage e)))

(defn do-with-try-catch {:style/indent 0} [f]
  (try (f)
       (catch java.sql.SQLException e
         (log/error (jdbc/print-sql-exception-chain e))
         (throw (Exception. (exception->nice-error-message e))))))

(defn- run-query
  "Run the query itself."
  [{sql :query, params :params, remark :remark} connection]
  (let [sql              (str "-- " remark "\n" (hx/unescape-dots sql))
        statement        (into [sql] params)
        _ (log/debug "Hive running query" statement)
        [columns & rows] (jdbc/query connection statement {:identifiers identity, :as-arrays? true})]
    {:rows    (or rows [])
     :columns columns}))

(defn run-query-without-timezone [driver settings connection query]
  (run-query query connection))

(defprotocol ^:private IUnprepare
  (^:private unprepare-arg ^String [this]))

(extend-protocol IUnprepare
  nil     (unprepare-arg [this] "NULL")
  String  (unprepare-arg [this] (str \' (s/replace this "'" "\\\\'") \')) ; escape single-quotes
  Boolean (unprepare-arg [this] (if this "TRUE" "FALSE"))
  Number  (unprepare-arg [this] (str this))
  Date    (unprepare-arg [this] (first (hsql/format
                                        (hsql/call :from_unixtime
                                                   (hsql/call :unix_timestamp
                                                              (hx/literal (u/date->iso-8601 this))
                                                              (hx/literal "yyyy-MM-dd\\\\'T\\\\'HH:mm:ss.SSS\\\\'Z\\\\'")))))))

(defn unprepare
  "Convert a normal SQL `[statement & prepared-statement-args]` vector into a flat, non-prepared statement."
  ^String [[sql & args]]
  (loop [sql sql, [arg & more-args, :as args] args]
    (if-not (seq args)
      sql
      (recur (s/replace-first sql #"(?<!\?)\?(?!\?)" (unprepare-arg arg))
             more-args))))

;; we need this because transactions are not supported in Hive 1.2.1
;; bound variables are not support in Spark SQL (maybe not Hive either, haven't checked)
(defn execute-query
  "Process and run a native (raw SQL) QUERY."
  [driver {:keys [database settings], query :native, :as outer-query}]
  (let [query (-> (assoc query :remark (qputil/query->remark outer-query))
                  (assoc :query (if (seq (:params query))
                                  (unprepare (cons (:query query) (:params query)))
                                  (:query query)))
                  (dissoc :params))]
    (do-with-try-catch
     (fn []
       (let [db-connection (sql/db->jdbc-connection-spec database)]
         (run-query-without-timezone driver settings db-connection query))))))

(defn describe-database [driver database]
  (log/info "xyz-" (prn-str database) " details " (:details database))
  {:tables (with-open [conn (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
             (set (for [result (jdbc/query {:connection conn} [(str "show tables in `" (:name database) "`")])]
                    {:name (:tablename result)
                     :schema (:database result)})))})

(defn describe-table [driver database table]
  (with-open [conn (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
    {:name (:name table)
     :schema (:schema table)
     :fields (set (for [result (jdbc/query {:connection conn}
                                           [(str "describe `" (:schema table)
                                                 "`.`" (:name table) "`")])]
                    {:name (:col_name result)
                     :base-type (column->base-type (keyword (:data_type result)))}))}))

(defn describe-table-fks [driver database table]
  #{})

(defn- humanize-connection-error-message [message]
  (condp re-matches message
    #"^FATAL: database \".*\" does not exist$"
    (driver/connection-error-messages :database-name-incorrect)

    #"^No suitable driver found for.*$"
    (driver/connection-error-messages :invalid-hostname)

    #"^Connection refused. Check that the hostname and port are correct and that the postmaster is accepting TCP/IP connections.$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^FATAL: .*$" ; all other FATAL messages: strip off the 'FATAL' part, capitalize, and add a period
    (let [[_ message] (re-matches #"^FATAL: (.*$)" message)]
      (str (s/capitalize message) \.))

    #".*" ; default
    message))

(defn hive
  "Create a database specification for a Hive database. Opts should include
  keys for :db, :user, and :password. You can also optionally set host and
  port."
  [{:keys [host port db]
    :or {host "localhost", port 10000, db ""}
    :as opts}]
  ;; This is a bit awkward. HiveDriver is a superclass of FixedHiveDriver,
  ;; so its constructor will always be called first and register with the
  ;; DriverManager.
  ;; Doing the following within the constructor of FixedHiveDriver didn't seem
  ;; to work, so we make sure FixedHiveDriver is returned for jdbc:hive2
  ;; connections here by manually deregistering all other jdbc:hive2 drivers.
  (loop []
    (let [driver (try
                   (java.sql.DriverManager/getDriver "jdbc:hive2://localhost:10000")
                   (catch java.sql.SQLException e
                     nil))]
      (if driver
        (when-not (instance? com.metabase.hive.jdbc.FixedHiveDriver driver)
          (java.sql.DriverManager/deregisterDriver driver)
          (recur))
        (java.sql.DriverManager/registerDriver (com.metabase.hive.jdbc.FixedHiveDriver.)))))
  (merge {:classname "com.metabase.hive.jdbc.FixedHiveDriver"
          :subprotocol "hive2"
          :subname (str "//" host ":" port "/")}
         (dissoc opts :host :port)))

(defn- connection-details->spec [details]
  (-> details
      (update :port (fn [port]
                      (if (string? port)
                        (Integer/parseInt port)
                        port)))
      (set/rename-keys {:dbname :db})
      hive
      (sql/handle-additional-options details)))

(defn features
  "Default implementation of `IDriver` `features` for SQL drivers."
  [driver]
  #{:basic-aggregations
    :standard-deviation-aggregations
    :expressions
    :expression-aggregations
    :native-parameters
    })

(defrecord HiveDriver []
  clojure.lang.Named
  (getName [_] "Hive"))

(u/strict-extend HiveDriver
                 driver/IDriver
                 (merge (sql/IDriverSQLDefaultsMixin)
                        {:date-interval (u/drop-first-arg date-interval)
                         :describe-database describe-database
                         :describe-table describe-table
                         :describe-table-fks describe-table-fks
                         :details-fields (constantly [{:name "host"
                                                       :display-name "Host"
                                                       :default "localhost"}
                                                      {:name "port"
                                                       :display-name "Port"
                                                       :type :integer
                                                       :default 10000}
                                                      {:name "dbname"
                                                       :display-name "Database name"
                                                       :placeholder "default"
                                                       :required true}
                                                      {:name "user"
                                                       :display-name "Database username"
                                                       :placeholder "What username do you use to login to the database?"
                                                       :required true}
                                                      {:name "password"
                                                       :display-name "Database password"
                                                       :type :password
                                                       :placeholder "*******"}
                                                      ])
                         :execute-query execute-query
                         :features features
                         :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)})
                 sql/ISQLDriver
                 (merge (sql/ISQLDriverDefaultsMixin)
                        {:apply-page (u/drop-first-arg apply-page)
                         :column->base-type (u/drop-first-arg column->base-type)
                         :connection-details->spec (u/drop-first-arg connection-details->spec)
                         :date (u/drop-first-arg date)
                         ;;:field->identifier (u/drop-first-arg field->identifier)
                         :quote-style (constantly :mysql)
                         :current-datetime-fn (u/drop-first-arg (constantly now))
                         :string-length-fn (u/drop-first-arg string-length-fn)
                         :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(driver/register-driver! :hive (HiveDriver.))
