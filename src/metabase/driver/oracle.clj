(ns metabase.driver.oracle
  (:require [clojure.java.jdbc :as jdbc]
            (clojure [set :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.config :as config]
            [metabase.db :as db]
            [metabase.db.spec :as dbspec]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]))

(def ^:private ^:const pattern->type
  [;; Any types -- see http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i107578
   [#"ANYDATA"     :UnknownField]  ; Instance of a given type with data plus a description of the type (?)
   [#"ANYTYPE"     :UnknownField]  ; Can be any named SQL type or an unnamed transient type
   [#"ARRAY"       :UnknownField]
   [#"BFILE"       :UnknownField]
   [#"BLOB"        :UnknownField]
   [#"RAW"         :UnknownField]
   [#"CHAR"        :TextField]
   [#"CLOB"        :TextField]
   [#"DATE"        :DateField]
   [#"DOUBLE"      :FloatField]
   [#"^EXPRESSION" :UnknownField]  ; Expression filter type
   [#"FLOAT"       :FloatField]
   [#"INTERVAL"    :DateTimeField] ; Does this make sense?
   [#"LONG RAW"    :UnknownField]
   [#"LONG"        :TextField]
   [#"^ORD"        :UnknownField]  ; Media types -- http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i121058
   [#"NUMBER"      :DecimalField]
   [#"REAL"        :FloatField]
   [#"REF"         :UnknownField]
   [#"ROWID"       :UnknownField]
   [#"^SDO_"       :UnknownField]  ; Spatial types -- see http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i107588
   [#"STRUCT"      :UnknownField]
   [#"TIMESTAMP"   :DateTimeField]
   [#"URI"         :TextField]
   [#"XML"         :UnknownField]])

(defn- connection-details->spec [{:keys [sid], :as details}]
  (update (dbspec/oracle details) :subname (u/rpartial str \: sid)))

(defn- can-connect? [details]
  (let [connection (connection-details->spec details)]
    (= 1M (first (vals (first (jdbc/query connection ["SELECT 1 FROM dual"])))))))


(defn- trunc
  "Truncate a date. See also this [table of format templates](http://docs.oracle.com/cd/B28359_01/olap.111/b28126/dml_functions_2071.htm#CJAEFAIA)

      (trunc :day v) -> TRUNC(v, 'day')"
  [format-template v]
  (hsql/call :trunc v (hx/literal format-template)))

(defn- date
  "Apply truncation / extraction to a date field or value for Oracle."
  [unit v]
  (case unit
    :default         (hx/->date v)
    :minute          (trunc :mi v)
    ;; you can only extract minute + hour from TIMESTAMPs, even though DATEs still have them (WTF), so cast first
    :minute-of-hour  (hsql/call :extract :minute (hx/->timestamp v))
    :hour            (trunc :hh v)
    :hour-of-day     (hsql/call :extract :hour (hx/->timestamp v))
    :day             (trunc :dd v)
    ;; subtract number of days between today and first day of week, then add one since first day of week = 1
    :day-of-week     (hx/inc (hx/- (date :day v)
                                   (date :week v)))
    :day-of-month    (hsql/call :extract :day v)
    :day-of-year     (hx/inc (hx/- (date :day v) (trunc :year v)))
    ;; [SIC] The format template for truncating to start of week is 'day' in Oracle #WTF
    :week            (trunc :day v)
    :week-of-year    (hx/inc (hx// (hx/- (trunc :iw v) ; iw = same day of the week as first day of the ISO year
                                         (trunc :iy v)) ; iy = ISO year
                                   7))
    :month           (trunc :month v)
    :month-of-year   (hsql/call :extract :month v)
    :quarter         (trunc :q v)
    :quarter-of-year (hx// (hx/+ (date :month-of-year (date :quarter v))
                                 2)
                           3)
    :year            (hsql/call :extract :year v)))

(def ^:private ^:const now             (hsql/raw "SYSDATE"))
(def ^:private ^:const date-1970-01-01 (hsql/call :to_timestamp (hx/literal :1970-01-01) (hx/literal :YYYY-MM-DD)))

(defn- num-to-ds-interval [unit v] (hsql/call :numtodsinterval v (hx/literal unit)))
(defn- num-to-ym-interval [unit v] (hsql/call :numtoyminterval v (hx/literal unit)))

(defn- date-interval
  "e.g. (SYSDATE + NUMTODSINTERVAL(?, 'second'))"
  [unit amount]
  (hx/+ now (case unit
              :second  (num-to-ds-interval :second amount)
              :minute  (num-to-ds-interval :minute amount)
              :hour    (num-to-ds-interval :hour   amount)
              :day     (num-to-ds-interval :day    amount)
              :week    (num-to-ds-interval :day    (hx/* amount (hsql/raw 7)))
              :month   (num-to-ym-interval :month  amount)
              :quarter (num-to-ym-interval :month  (hx/* amount (hsql/raw 3)))
              :year    (num-to-ym-interval :year   amount))))



(defn- unix-timestamp->timestamp [field-or-value seconds-or-milliseconds]
  (hx/+ date-1970-01-01 (num-to-ds-interval :second (case seconds-or-milliseconds
                                                      :seconds      field-or-value
                                                      :milliseconds (hx// field-or-value (hsql/raw 1000))))))

(defn- apply-offset-and-limit
  "Append SQL like `OFFSET 20 FETCH FIRST 10 ROWS ONLY` to the query."
  [honeysql-query offset limit]
  (assoc honeysql-query
    :offset (hsql/raw (format "%d ROWS FETCH NEXT %d ROWS ONLY" offset limit) )))

(defn- apply-limit [honeysql-query {value :limit}]
  ;; Shameless hack! FETCH FIRST ... ROWS ONLY needs to go on the end of the query. Korma doesn't have any built-in
  ;; way to do this but we can use `k/offset` and set it to 0.
  ;; OFFSET 0 FETCH FIRST <value> ROWS ONLY
  (apply-offset-and-limit honeysql-query 0 value))

(defn- apply-page [honeysql-query {{:keys [items page]} :page}]
  ;; ex.:
  ;; items | page | sql
  ;; ------+------+------------------------
  ;;     5 |    1 | OFFSET 0 ROWS FETCH FIRST 5 ROWS ONLY
  ;;     5 |    2 | OFFSET 5 ROWS FETCH FIRST 5 ROWS ONLY
  (apply-offset-and-limit honeysql-query (* (dec page) items) items))

;; Oracle doesn't support `TRUE`/`FALSE`; use `1`/`0`, respectively; convert these booleans to numbers.
(defn- prepare-value [{value :value}]
  (cond
    (true? value)  1
    (false? value) 0
    :else          value))

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))


(defrecord OracleDriver []
  clojure.lang.Named
  (getName [_] "Oracle"))

(u/strict-extend OracleDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:can-connect?   (u/drop-first-arg can-connect?)
          :date-interval  (u/drop-first-arg date-interval)
          :details-fields (constantly [{:name         "host"
                                        :display-name "Host"
                                        :default      "localhost"}
                                       {:name         "port"
                                        :display-name "Port"
                                        :type         :integer
                                        :default      1521}
                                       {:name         "sid"
                                        :display-name "Oracle System ID"
                                        :default      "ORCL"}
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
         {:apply-limit               (u/drop-first-arg apply-limit)
          :apply-page                (u/drop-first-arg apply-page)
          :column->base-type         (sql/pattern-based-column->base-type pattern->type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :current-datetime-fn       (constantly now)
          :date                      (u/drop-first-arg date)
          :excluded-schemas          (fn [& _]
                                       (set/union
                                        #{"ANONYMOUS"
                                          "APEX_040200" ; TODO - are there othere APEX tables we want to skip? Maybe we should make this a pattern instead? (#"^APEX_")
                                          "APPQOSSYS"
                                          "AUDSYS"
                                          "CTXSYS"
                                          "DBSNMP"
                                          "DIP"
                                          "GSMADMIN_INTERNAL"
                                          "GSMCATUSER"
                                          "GSMUSER"
                                          "LBACSYS"
                                          "MDSYS"
                                          "OLAPSYS"
                                          "ORDDATA"
                                          "ORDSYS"
                                          "OUTLN"
                                          "RDSADMIN"
                                          "SYS"
                                          "SYSBACKUP"
                                          "SYSDG"
                                          "SYSKM"
                                          "SYSTEM"
                                          "WMSYS"
                                          "XDB"
                                          "XS$NULL"}
                                        (when config/is-test?
                                          ;; DIRTY HACK (!) This is similar hack we do for Redshift, see the explanation there
                                          ;; we just want to ignore all the test "session schemas" that don't match the current test
                                          (require 'metabase.test.data.oracle)
                                          ((resolve 'metabase.test.data.oracle/non-session-schemas)))))
          :field-percent-urls        sql/slow-field-percent-urls
          ;; TODO - we *should* be able to set timezone using the SQL below, but I think the SQL doesn't work with prepared params (i.e., '?')
          ;; Find some way to work around this for Oracle
          ;; :set-timezone-sql          (constantly "ALTER session SET time_zone = ?")
          :prepare-value             (u/drop-first-arg prepare-value)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

;; only register the Oracle driver if the JDBC driver is available
(when (u/ignore-exceptions
        (Class/forName "oracle.jdbc.OracleDriver"))

  ;; By default the Oracle JDBC driver isn't compliant with JDBC standards -- instead of returning types like java.sql.Timestamp
  ;; it returns wacky types like oracle.sql.TIMESTAMPT. By setting this System property the JDBC driver will return the appropriate types.
  ;; See this page for more details: http://docs.oracle.com/database/121/JJDBC/datacc.htm#sthref437
  (.setProperty (System/getProperties) "oracle.jdbc.J2EE13Compliant" "TRUE")

  (driver/register-driver! :oracle (OracleDriver.)))
