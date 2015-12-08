(ns metabase.driver.oracle
  (:require [clojure.java.jdbc :as jdbc]
            (clojure [set :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            (korma [core :as k]
                   [db :as kdb])
            (korma.sql [engine :as kengine]
                       [utils :as kutils])
            (metabase [config :as config]
                      [db :as db]
                      [driver :as driver])
            [metabase.driver.generic-sql :as sql]
            [metabase.models.setting :refer [defsetting], :as setting]
            [metabase.util :as u]
            [metabase.util.korma-extensions :as kx]))

(declare maybe-register-driver!)

(defsetting oracle-jdbc-driver-path
  "Path to Oracle JDBC driver. e.g. `/Users/camsaul/Downloads/ojdbc7.jar`.
   [You can download it here](http://www.oracle.com/technetwork/database/features/jdbc/default-2280470.html)."
  nil
  :setter (fn [value]
            (setting/set* :oracle-jdbc-driver-path value)
            (maybe-register-driver!)))

(defn jdbc-driver-available?
  "Is `oracle.jdbc.OracleDriver` available?"
  ([]
   (jdbc-driver-available? (oracle-jdbc-driver-path)))
  ([jar-path]
   (boolean (try (u/add-jar-to-classpath! jar-path)
                 (Class/forName "oracle.jdbc.OracleDriver")
                 (catch Throwable _)))))


(def ^:private ^:const pattern->type
  [;; Any types -- see http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i107578
   [#"ANYDATA"     :UnknownField]  ; Instance of a given type with data plus a description of the type (?)
   [#"ANYTYPE"     :UnknownField]  ; Can be any named SQL type or an unnamed transient type
   [#"BFILE"       :UnknownField]
   [#"BLOB"        :UnknownField]
   [#"CHAR"        :TextField]
   [#"CLOB"        :TextField]
   [#"DATE"        :DateField]
   [#"DOUBLE"      :FloatField]
   [#"^EXPRESSION" :UnknownField]  ; Expression filter type
   [#"FLOAT"       :FloatField]
   [#"INTERVAL"    :DateTimeField] ; Does this make sense?
   [#"LONG"        :TextField]
   [#"^ORD"        :UnknownField]  ; Media types -- http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i121058
   [#"NUMBER"      :DecimalField]
   [#"RAW"         :UnknownField]
   [#"REAL"        :FloatField]
   [#"ROWID"       :UnknownField]
   [#"^SDO_"       :UnknownField]  ; Spatial types -- see http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i107588
   [#"TIMESTAMP"   :DateTimeField]
   [#"URI"         :TextField]
   [#"XML"         :UnknownField]])

(defn- connection-details->spec [_ {:keys [sid], :as details}]
  (update (kdb/oracle details) :subname (u/rpartial str \: sid)))

;; Oracle connections seem to leak whenever we call .getMetaData if they're in a C3P0 connection pool
;; so we'll have to use non-pooled connections for sync instead
(defn- get-connection-for-sync [_ details]
  (jdbc/get-connection (connection-details->spec nil details)))

(defn- trunc
  "Truncate a date. See also this [table of format templates](http://docs.oracle.com/cd/B28359_01/olap.111/b28126/dml_functions_2071.htm#CJAEFAIA)

      (trunc :day v) -> TRUNC(v, 'day')"
  [format-template v]
  (k/sqlfn :TRUNC v (kx/literal format-template)))

(defn- extract
  "Extract UNIT from a date. See [the reference](http://docs.oracle.com/cd/B19306_01/server.102/b14200/functions050.htm) for more details.

     (extract :year v) -> EXTRACT(year FROM v)"
  [unit v]
  (kutils/func (format "EXTRACT(%s FROM %%s)" (name unit)) [v]))

(defn- date
  "Apply truncation / extraction to a date field or value for SQLite.
   See also the [SQLite Date and Time Functions Reference](http://www.sqlite.org/lang_datefunc.html)."
  ([_ unit v]
   (date unit v))
  ([unit v]
   (case unit
     :default         (kx/->date v)
     :minute          (trunc :mi v)
     ;; you can only extract minute + hour from TIMESTAMPs, even though DATEs still have them (WTF), so cast first
     :minute-of-hour  (extract :minute (kx/->timestamp v))
     :hour            (trunc :hh v)
     :hour-of-day     (extract :hour (kx/->timestamp v))
     :day             (trunc :dd v)
     ;; subtract number of days between today and first day of week, then add one since first day of week = 1
     :day-of-week     (kx/inc (kx/- (date :day v)
                                    (date :week v)))
     :day-of-month    (extract :day v)
     :day-of-year     (kx/inc (kx/- (date :day v) (trunc :year v)))
     ;; [SIC] The format template for truncating to start of week is 'day' in Oracle #WTF
     :week            (trunc :day v)
     :week-of-year    (kx/inc (kx// (kx/- (trunc :iw v)  ; iw = same day of the week as first day of the ISO year
                                          (trunc :iy v)) ; iy = ISO year
                                    (k/raw 7)))
     :month           (trunc :month v)
     :month-of-year   (extract :month v)
     :quarter         (trunc :q v)
     :quarter-of-year (kx// (kx/+ (date :month-of-year (date :quarter v))
                                  (k/raw 2))
                            (k/raw 3))
     :year            (extract :year v))))

(def ^:private ^:const now             (k/raw "SYSDATE"))
(def ^:private ^:const date-1970-01-01 (k/sqlfn :to_timestamp (kx/literal :1970-01-01) (kx/literal :YYYY-MM-DD)))

(defn- num-to-ds-interval [unit v] (k/sqlfn :NumToDSInterval v (kx/literal unit)))
(defn- num-to-ym-interval [unit v] (k/sqlfn :NumToYMInterval v (kx/literal unit)))

(defn- date-interval
  "e.g. (SYSDATE + NUMTODSINTERVAL(?, 'second'))"
  [_ unit amount]
  (kx/+ now (case unit (case unit
                           :second  (num-to-ds-interval :second amount)
                           :minute  (num-to-ds-interval :minute amount)
                           :hour    (num-to-ds-interval :hour   amount)
                           :day     (num-to-ds-interval :day    amount)
                           :week    (num-to-ds-interval :day    (kx/* amount (k/raw 7)))
                           :month   (num-to-ym-interval :month  amount)
                           :quarter (num-to-ym-interval :month  (kx/* amount (k/raw 3)))
                           :year    (num-to-ym-interval :year   amount)))))



(defn- unix-timestamp->timestamp [_ field-or-value seconds-or-milliseconds]
  (kx/+ date-1970-01-01 (num-to-ds-interval :second (case seconds-or-milliseconds
                                                      :seconds      field-or-value
                                                      :milliseconds (kx// field-or-value (k/raw 1000))))))

(defn- apply-offset-and-limit
  "Append SQL like `OFFSET 20 FETCH FIRST 10 ROWS ONLY` to the query."
  [korma-query offset limit]
  (k/offset korma-query (format "%d ROWS FETCH NEXT %d ROWS ONLY" offset limit)))

(defn- apply-limit [_ korma-query {value :limit}]
  ;; Shameless hack! FETCH FIRST ... ROWS ONLY needs to go on the end of the query. Korma doesn't have any built-in
  ;; way to do this but we can use `k/offset` and set it to 0.
  ;; OFFSET 0 FETCH FIRST <value> ROWS ONLY
  (apply-offset-and-limit korma-query 0 value))

(defn- apply-page [_ korma-query {{:keys [items page]} :page}]
  ;; ex.:
  ;; items | page | sql
  ;; ------+------+------------------------
  ;;     5 |    1 | OFFSET 0 ROWS FETCH FIRST 5 ROWS ONLY
  ;;     5 |    2 | OFFSET 5 ROWS FETCH FIRST 5 ROWS ONLY
  (apply-offset-and-limit korma-query (* (dec page) items) items))


(defrecord OracleDriver []
  clojure.lang.Named
  (getName [_] "Oracle"))

(extend OracleDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval  date-interval
          :details-fields (constantly [{:name         "host"
                                        :display-name "Host"
                                        :default      "localhost"}
                                       {:name         "port"
                                        :display-name "Port"
                                        :type         :integer
                                        :default      1521}
                                       {:name         "sid"
                                        :display-name "Oracle System ID"
                                        :required     true}
                                       {:name         "db"
                                        :display-name "Database name"
                                        :placeholder  "BirdsOfTheWorld"
                                        :required     true}
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
          :column->base-type         (sql/pattern-based-column->base-type pattern->type)
          :connection-details->spec  connection-details->spec
          :current-datetime-fn       (constantly now)
          :date                      date
          :excluded-schemas          (fn [& _]
                                      (set/union
                                       #{"APPQOSSYS"
                                         "CTXSYS"
                                         "DBSNMP"
                                         "GSMADMIN_INTERNAL"
                                         "OUTLN"
                                         "RDSADMIN"
                                         "SYS"
                                         "SYSTEM"
                                         "XDB"}
                                       (when (config/is-test?)
                                         ;; DIRTY HACK (!) This is the same hack we do for Redshift, see the explanation there
                                         (require 'metabase.test.data.oracle)
                                         (let [session-schema-number @(resolve 'metabase.test.data.oracle/session-schema-number)]
                                           (set (conj (for [i (range 200)
                                                            :when (not= i session-schema-number)]
                                                        (str "CAM_" i))
                                                      "CAM"))))))
          :get-connection-for-sync   get-connection-for-sync
          :set-timezone-sql          (constantly "ALTER session SET time_zone = ?")
          :string-length-fn          (constantly :LENGTH)
          :unix-timestamp->timestamp unix-timestamp->timestamp}))

(defn- maybe-register-driver! []
  (db/setup-db-if-needed)
  (when (jdbc-driver-available?)
    (log/info (format "Found Oracle JDBC driver: %s" (oracle-jdbc-driver-path)))
    (driver/register-driver! :oracle (OracleDriver.))))

(maybe-register-driver!)
