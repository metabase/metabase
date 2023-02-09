(ns metabase.driver.h2
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.string :as str]
   [java-time :as t]
   [metabase.db.jdbc-protocols :as mdb.jdbc-protocols]
   [metabase.db.spec :as mdb.spec]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.driver.h2.actions :as h2.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.plugins.classloader :as classloader]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.honeysql-extensions :as hx]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.ssh :as ssh])
  (:import
   (java.sql Clob ResultSet ResultSetMetaData)
   (java.time OffsetTime)
   (org.h2.command CommandInterface Parser)
   (org.h2.engine SessionLocal)))

;; method impls live in this namespace
(comment h2.actions/keep-me)

(driver/register! :h2, :parent :sql-jdbc)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(doseq [[feature supported?] {:full-join                 false
                              :regex                     true
                              :percentile-aggregations   false
                              :actions                   true
                              :actions/custom            true
                              :datetime-diff             true
                              :now                       true
                              :test/jvm-timezone-setting false}]
  (defmethod driver/database-supports? [:h2 feature]
    [_driver _feature _database]
    supported?))

(defmethod sql.qp/->honeysql [:h2 :regex-match-first]
  [driver [_ arg pattern]]
  (hx/call :regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)))

(defmethod driver/connection-properties :h2
  [_]
  (->>
   [{:name         "db"
     :display-name (tru "Connection String")
     :helper-text (deferred-tru "The local path relative to where Metabase is running from. Your string should not include the .mv.db extension.")
     :placeholder  (str "file:/" (deferred-tru "Users/camsaul/bird_sightings/toucans"))
     :required     true}
    driver.common/cloud-ip-address-info
    driver.common/advanced-options-start
    driver.common/default-advanced-options]
   (map u/one-or-many)
   (apply concat)))

(defmethod driver/db-start-of-week :h2
  [_]
  :monday)

;; TODO - it would be better not to put all the options in the connection string in the first place?
(defn- connection-string->file+options
  "Explode a `connection-string` like `file:my-db;OPTION=100;OPTION_2=TRUE` to a pair of file and an options map.

    (connection-string->file+options \"file:my-crazy-db;OPTION=100;OPTION_X=TRUE\")
      -> [\"file:my-crazy-db\" {\"OPTION\" \"100\", \"OPTION_X\" \"TRUE\"}]"
  [^String connection-string]
  {:pre [(string? connection-string)]}
  (let [[file & options] (str/split connection-string #";+")
        options          (into {} (for [option options]
                                    (str/split option #"=")))]
    [file options]))

(defn- db-details->user [{:keys [db], :as details}]
  {:pre [(string? db)]}
  (or (some (partial get details) ["USER" :USER])
      (let [[_ {:strs [USER]}] (connection-string->file+options db)]
        USER)))

(defn- check-native-query-not-using-default-user [{query-type :type, :as query}]
  (u/prog1 query
    ;; For :native queries check to make sure the DB in question has a (non-default) NAME property specified in the
    ;; connection string. We don't allow SQL execution on H2 databases for the default admin account for security
    ;; reasons
    (when (= (keyword query-type) :native)
      (let [{:keys [details]} (qp.store/database)
            user              (db-details->user details)]
        (when (or (str/blank? user)
                  (= user "sa"))        ; "sa" is the default USER
          (throw
           (ex-info (tru "Running SQL queries against H2 databases using the default (admin) database user is forbidden.")
                    {:type qp.error-type/db})))))))

(defn- get-field
  "Returns value of private field. This function is used to bypass field protection to instantiate
   a low-level H2 Parser object in order to detect DDL statements in queries."
  [obj field]
  (.get (doto (.getDeclaredField (class obj) field)
          (.setAccessible true))
        obj))

(defn- make-h2-parser
  "Returns an H2 Parser object for the given (H2) database ID"
  ^Parser [h2-db-id]
  (with-open [conn (.getConnection (sql-jdbc.execute/datasource-with-diagnostic-info! :h2 h2-db-id))]
    ;; The H2 Parser class is created from the H2 JDBC session, but these fields are not public
    (let [session (-> conn (get-field "inner") (get-field "session"))]
      ;; Only SessionLocal represents a connection we can create a parser with. Remote sessions and other
      ;; session types are ignored.
      (when (instance? SessionLocal session)
        (Parser. session)))))

(defn- contains-ddl?
  [database query]
  (when-let [h2-parser (make-h2-parser database)]
    (try
      (let [command      (.prepareCommand h2-parser query)
            command-type (.getCommandType command)]
        ;; TODO: do we need to handle CommandList?
        ;; Command types are organized with all DDL commands listed first
        ;; see https://github.com/h2database/h2database/blob/master/h2/src/main/org/h2/command/CommandInterface.java
        (< command-type CommandInterface/ALTER_SEQUENCE))
      ;; if the query is invalid, then it isn't DDL
      (catch Throwable _ false))))

(defn- check-disallow-ddl-commands [{:keys [database] {:keys [query]} :native}]
  (when (and query (contains-ddl? database query))
    (throw (IllegalArgumentException. "DDL commands are not allowed to be used with h2."))))

(defmethod driver/execute-reducible-query :h2
  [driver query chans respond]
  (check-native-query-not-using-default-user query)
  (check-disallow-ddl-commands query)
  ((get-method driver/execute-reducible-query :sql-jdbc) driver query chans respond))

(defmethod sql.qp/add-interval-honeysql-form :h2
  [driver hsql-form amount unit]
  (cond
    (= unit :quarter)
    (recur driver hsql-form (hx/* amount 3) :month)

    ;; H2 only supports long ints in the `dateadd` amount field; since we want to support fractional seconds (at least
    ;; for application DB purposes) convert to `:millisecond`
    (and (= unit :second)
         (not (zero? (rem amount 1))))
    (recur driver hsql-form (* amount 1000.0) :millisecond)

    :else
    (hx/call :dateadd (hx/literal unit) (hx/cast :long amount) (hx/cast :datetime hsql-form))))

(defmethod driver/humanize-connection-error-message :h2
  [_ message]
  (condp re-matches message
    #"^A file path that is implicitly relative to the current working directory is not allowed in the database URL .*$"
    :implicitly-relative-db-file-path

    #"^Database .* not found, .*$"
    :db-file-not-found

    #"^Wrong user name or password .*$"
    :username-or-password-incorrect

    message))

(def ^:private date-format-str "yyyy-MM-dd HH:mm:ss.SSS zzz")

(defmethod driver.common/current-db-time-date-formatters :h2
  [_]
  (driver.common/create-db-time-formatters date-format-str))

(defmethod driver.common/current-db-time-native-query :h2
  [_]
  (format "select formatdatetime(current_timestamp(),'%s') AS VARCHAR" date-format-str))

(defmethod driver/current-db-time :h2
  [& args]
  (apply driver.common/current-db-time args))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/current-datetime-honeysql-form :h2
  [_]
  (hx/with-database-type-info :%now :TIMESTAMP))

(defn- add-to-1970 [expr unit-str]
  (hx/call :timestampadd
    (hx/literal unit-str)
    expr
    (hx/raw "timestamp '1970-01-01T00:00:00Z'")))

(defmethod sql.qp/unix-timestamp->honeysql [:h2 :seconds] [_ _ expr]
  (add-to-1970 expr "second"))

(defmethod sql.qp/unix-timestamp->honeysql [:h2 :milliseconds] [_ _ expr]
  (add-to-1970 expr "millisecond"))

(defmethod sql.qp/unix-timestamp->honeysql [:h2 :microseconds] [_ _ expr]
  (add-to-1970 expr "microsecond"))

(defmethod sql.qp/cast-temporal-string [:h2 :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  (hx/call :parsedatetime expr (hx/literal "yyyyMMddHHmmss")))

(defmethod sql.qp/cast-temporal-byte [:h2 :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal
                               (hx/call :utf8tostring expr)))

;; H2 v2 added date_trunc and extract, so we can borrow the Postgres implementation
(defn- date-trunc [unit expr] (hx/call :date_trunc (hx/literal unit) expr))
(defn- extract    [unit expr] (hx/call :extract    unit              expr))

(def ^:private extract-integer (comp hx/->integer extract))

(defmethod sql.qp/date [:h2 :default]          [_ _ expr] expr)
(defmethod sql.qp/date [:h2 :second-of-minute] [_ _ expr] (extract-integer :second expr))
(defmethod sql.qp/date [:h2 :minute]           [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:h2 :minute-of-hour]   [_ _ expr] (extract-integer :minute expr))
(defmethod sql.qp/date [:h2 :hour]             [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:h2 :hour-of-day]      [_ _ expr] (extract-integer :hour expr))
(defmethod sql.qp/date [:h2 :day]              [_ _ expr] (hx/->date expr))
(defmethod sql.qp/date [:h2 :day-of-month]     [_ _ expr] (extract-integer :day expr))
(defmethod sql.qp/date [:h2 :day-of-year]      [_ _ expr] (extract-integer :doy expr))
(defmethod sql.qp/date [:h2 :month]            [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:h2 :month-of-year]    [_ _ expr] (extract-integer :month expr))
(defmethod sql.qp/date [:h2 :quarter]          [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:h2 :quarter-of-year]  [_ _ expr] (extract-integer :quarter expr))
(defmethod sql.qp/date [:h2 :year]             [_ _ expr] (date-trunc :year expr))
(defmethod sql.qp/date [:h2 :year-of-era]      [_ _ expr] (extract-integer :year expr))

(defmethod sql.qp/date [:h2 :day-of-week]
  [_ _ expr]
  (sql.qp/adjust-day-of-week :h2 (extract :iso_day_of_week expr)))

(defmethod sql.qp/date [:h2 :week]
  [_ _ expr]
  (sql.qp/add-interval-honeysql-form :h2 (sql.qp/date :h2 :day expr)
                                     (hx/- 1 (sql.qp/date :h2 :day-of-week expr))
                                     :day))

(defmethod sql.qp/date [:h2 :week-of-year-iso] [_ _ expr] (extract :iso_week expr))

(defmethod sql.qp/->honeysql [:h2 :log]
  [driver [_ field]]
  (hx/call :log10 (sql.qp/->honeysql driver field)))

(defn- datediff
  "Like H2's `datediff` function but accounts for timestamps with time zones."
  [unit x y]
  (hx/call :datediff (hx/raw (name unit)) (hx/->timestamp x) (hx/->timestamp y)))

(defn- time-zoned-extract
  "Like H2's extract but accounts for timestamps with time zones."
  [unit x]
  (extract unit (hx/->timestamp x)))

(defmethod sql.qp/datetime-diff [:h2 :year]    [driver _unit x y] (hx// (sql.qp/datetime-diff driver :month x y) 12))
(defmethod sql.qp/datetime-diff [:h2 :quarter] [driver _unit x y] (hx// (sql.qp/datetime-diff driver :month x y) 3))

(defmethod sql.qp/datetime-diff [:h2 :month]
  [_driver _unit x y]
  (hx/+ (datediff :month x y)
        ;; datediff counts month boundaries not whole months, so we need to adjust
        ;; if x<y but x>y in the month calendar then subtract one month
        ;; if x>y but x<y in the month calendar then add one month
        (hx/call
         :case
         (hx/call :and (hx/call :< x y) (hx/call :> (time-zoned-extract :day x) (time-zoned-extract :day y)))
         -1
         (hx/call :and (hx/call :> x y) (hx/call :< (time-zoned-extract :day x) (time-zoned-extract :day y)))
         1
         :else 0)))

(defmethod sql.qp/datetime-diff [:h2 :week] [_driver _unit x y] (hx// (datediff :day x y) 7))
(defmethod sql.qp/datetime-diff [:h2 :day]  [_driver _unit x y] (datediff :day x y))
(defmethod sql.qp/datetime-diff [:h2 :hour] [_driver _unit x y] (hx// (datediff :millisecond x y) 3600000))
(defmethod sql.qp/datetime-diff [:h2 :minute] [_driver _unit x y] (datediff :minute x y))
(defmethod sql.qp/datetime-diff [:h2 :second] [_driver _unit x y] (datediff :second x y))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Datatype grammar adapted from BNF at https://h2database.com/html/datatypes.html

(defn- expand-grammar
  "Expands BNF-like grammar to all possible data types"
  [grammar]
  (cond
    (set? grammar)  (mapcat expand-grammar grammar)
    (list? grammar) (map (partial str/join " ")
                         (apply math.combo/cartesian-product
                                (map expand-grammar grammar)))
    :else           [grammar]))

(def ^:private base-type->db-type-grammar
  '{:type/Boolean             #{BOOLEAN}
    :type/Integer             #{TINYINT SMALLINT INTEGER INT}
    :type/BigInteger          #{BIGINT}
    :type/Decimal             #{NUMERIC DECIMAL DEC}
    :type/Float               #{REAL FLOAT "DOUBLE PRECISION" DECFLOAT}
    :type/Text                #{CHARACTER
                                CHAR
                                (NATIONAL #{CHARACTER CHAR})
                                NCHAR
                                (#{CHARACTER CHAR} VARYING)
                                VARCHAR
                                (#{(NATIONAL #{CHARACTER CHAR}) NCHAR} VARYING)
                                VARCHAR_CASESENSITIVE
                                (#{CHARACTER CHAR} LARGE OBJECT)
                                CLOB
                                (#{NATIONAL CHARACTER NCHAR} LARGE OBJECT)
                                NCLOB
                                UUID}
    :type/*                   #{ARRAY
                                BINARY
                                "BINARY VARYING"
                                VARBINARY
                                "BINARY LARGE OBJECT"
                                BLOB
                                GEOMETRY
                                IMAGE}
    :type/Date                #{DATE}
    :type/DateTime            #{TIMESTAMP}
    :type/Time                #{TIME "TIME WITHOUT TIME ZONE"}
    :type/TimeWithLocalTZ     #{"TIME WITH TIME ZONE"}
    :type/DateTimeWithLocalTZ #{"TIMESTAMP WITH TIME ZONE"}})

(def ^:private db-type->base-type
  (into {}
        (for [[base-type grammar] base-type->db-type-grammar
              db-type (expand-grammar grammar)]
          [(keyword db-type) base-type])))

(defmethod sql-jdbc.sync/database-type->base-type :h2
  [_ database-type]
  (db-type->base-type database-type))

;; These functions for exploding / imploding the options in the connection strings are here so we can override shady
;; options users might try to put in their connection string. e.g. if someone sets `ACCESS_MODE_DATA` to `rws` we can
;; replace that and make the connection read-only.

(defn- file+options->connection-string
  "Implode the results of `connection-string->file+options` back into a connection string."
  [file options]
  (apply str file (for [[k v] options]
                    (str ";" k "=" v))))

(defn- connection-string-set-safe-options
  "Add Metabase Security Settings™ to this `connection-string` (i.e. try to keep shady users from writing nasty SQL)."
  [connection-string]
  {:pre [(string? connection-string)]}
  (let [[file options] (connection-string->file+options connection-string)]
    (file+options->connection-string file (merge
                                           (->> options
                                                ;; Remove INIT=... from options for security reasons (Metaboat #165)
                                                ;; http://h2database.com/html/features.html#execute_sql_on_connection
                                                (remove (fn [[k _]] (= (u/lower-case-en k) "init")))
                                                (into {}))
                                           {"IFEXISTS"         "TRUE"
                                            "ACCESS_MODE_DATA" "r"}))))

(defmethod sql-jdbc.conn/connection-details->spec :h2
  [_ details]
  {:pre [(map? details)]}
  (mdb.spec/spec :h2 (update details :db connection-string-set-safe-options)))

(defmethod sql-jdbc.sync/active-tables :h2
  [& args]
  (apply sql-jdbc.sync/post-filtered-active-tables args))

(defmethod sql-jdbc.sync/excluded-schemas :h2
  [_]
  #{"INFORMATION_SCHEMA"})

(defmethod sql-jdbc.execute/connection-with-timezone :h2
  [driver database ^String _timezone-id]
  ;; h2 doesn't support setting timezones, or changing the transaction level without admin perms, so we can skip those
  ;; steps that are in the default impl
  (let [conn (.getConnection (sql-jdbc.execute/datasource-with-diagnostic-info! driver database))]
    (try
      (doto conn
        (.setReadOnly true))
      (catch Throwable e
        (.close conn)
        (throw e)))))

;; de-CLOB any CLOB values that come back
(defmethod sql-jdbc.execute/read-column-thunk :h2
  [_ ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (let [classname (some-> (.getColumnClassName rsmeta i)
                          (Class/forName true (classloader/the-classloader)))]
    (if (isa? classname Clob)
      (fn []
        (mdb.jdbc-protocols/clob->str (.getObject rs i)))
      (fn []
        (.getObject rs i)))))

(defmethod sql-jdbc.execute/set-parameter [:h2 OffsetTime]
  [driver prepared-statement i t]
  (let [local-time (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))]
    (sql-jdbc.execute/set-parameter driver prepared-statement i local-time)))

(defmethod driver/incorporate-ssh-tunnel-details :h2
  [_ db-details]
  (if (and (:tunnel-enabled db-details) (ssh/ssh-tunnel-open? db-details))
    (if (and (:db db-details) (str/starts-with? (:db db-details) "tcp://"))
      (let [details (ssh/include-ssh-tunnel! db-details)
            db      (:db details)]
        (assoc details :db (str/replace-first db (str (:orig-port details)) (str (:tunnel-entrance-port details)))))
      (do (log/error (tru "SSH tunnel can only be established for H2 connections using the TCP protocol"))
          db-details))
    db-details))
