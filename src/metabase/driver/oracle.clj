(ns metabase.driver.oracle
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.java.jdbc :as jdbc]
            [honeysql.core :as hsql]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.util
             [honeysql-extensions :as hx]
             [ssh :as ssh]]
            [puppetlabs.i18n.core :refer [tru]]))

(defrecord OracleDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "Oracle"))

(def ^:private ^:const pattern->type
  [;; Any types -- see http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i107578
   [#"ANYDATA"     :type/*]  ; Instance of a given type with data plus a description of the type (?)
   [#"ANYTYPE"     :type/*]  ; Can be any named SQL type or an unnamed transient type
   [#"ARRAY"       :type/*]
   [#"BFILE"       :type/*]
   [#"BLOB"        :type/*]
   [#"RAW"         :type/*]
   [#"CHAR"        :type/Text]
   [#"CLOB"        :type/Text]
   [#"DATE"        :type/Date]
   [#"DOUBLE"      :type/Float]
   [#"^EXPRESSION" :type/*]  ; Expression filter type
   [#"FLOAT"       :type/Float]
   [#"INTERVAL"    :type/DateTime] ; Does this make sense?
   [#"LONG RAW"    :type/*]
   [#"LONG"        :type/Text]
   [#"^ORD"        :type/*]  ; Media types -- http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i121058
   [#"NUMBER"      :type/Decimal]
   [#"REAL"        :type/Float]
   [#"REF"         :type/*]
   [#"ROWID"       :type/*]
   [#"^SDO_"       :type/*]  ; Spatial types -- see http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i107588
   [#"STRUCT"      :type/*]
   [#"TIMESTAMP"   :type/DateTime]
   [#"URI"         :type/Text]
   [#"XML"         :type/*]])

(defn- connection-details->spec
  "Create a database specification for an Oracle database. DETAILS should include keys for `:user`,
   `:password`, and one or both of `:sid` and `:serivce-name`. You can also optionally set `:host` and `:port`."
  [{:keys [host port sid service-name]
    :or   {host "localhost", port 1521}
    :as   details}]
  (assert (or sid service-name))
  (merge {:subprotocol "oracle:thin"
          :subname     (str "@" host
                            ":" port
                            (when sid
                              (str ":" sid))
                            (when service-name
                              (str "/" service-name)))}
         (dissoc details :host :port :sid :service-name)))

(defn- can-connect? [details]
  (let [connection (connection-details->spec (ssh/include-ssh-tunnel details))]
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
    :default         (some-> v hx/->date)
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


(defn- increment-identifier-suffix
  "Add an appropriate suffix to a keyword IDENTIFIER to make it distinct from previous usages of the same identifier,
  e.g.

     (increment-identifier-suffix :my_col)   ; -> :my_col_2
     (increment-identifier-suffix :my_col_2) ; -> :my_col_3"
  [identifier]
  (keyword
   (let [identifier (name identifier)]
     (if-let [[_ existing-suffix] (re-find #"^.*_(\d+$)" identifier)]
       ;; if identifier already has an alias like col_2 then increment it to col_3
       (let [new-suffix (str (inc (Integer/parseInt existing-suffix)))]
         (clojure.string/replace identifier (re-pattern (str existing-suffix \$)) new-suffix))
       ;; otherwise just stick a _2 on the end so it's col_2
       (str identifier "_2")))))

(defn- alias-everything
  "Make sure all the columns in SELECT-CLAUSE are alias forms, e.g. `[:table.col :col]` instead of `:table.col`.
   (This faciliates our deduplication logic.)"
  [select-clause]
  (for [col select-clause]
    (if (sequential? col)
      ;; if something's already an alias form like [:table.col :col] it's g2g
      col
      ;; otherwise if it's something like :table.col replace with [:table.col :col]
      [col (keyword (last (clojure.string/split (name col) #"\.")))])))

(defn- deduplicate-identifiers
  "Make sure every column in SELECT-CLAUSE has a unique alias.
   This is done because Oracle can't figure out how to use a query
  that produces duplicate columns in a subselect."
  [select-clause]
  (if (= select-clause [:*])
    ;; if we're doing `SELECT *` there's no way we can deduplicate anything so we're SOL, return as-is
    select-clause
    ;; otherwise we can actually deduplicate things
    (loop [already-seen #{}, acc [], [[col alias] & more] (alias-everything select-clause)]
      (cond
        ;; if not more cols are left to deduplicate, we're done
        (not col)                      acc
        ;; otherwise if we've already used this alias, replace it with one like `identifier_2` and try agan
        (contains? already-seen alias) (recur already-seen acc (cons [col (increment-identifier-suffix alias)]
                                                                     more))
        ;; otherwise if we haven't seen it record it as seen and move on to the next column
        :else                          (recur (conj already-seen alias) (conj acc [col alias]) more)))))

;; Oracle doesn't support `LIMIT n` syntax. Instead we have to use `WHERE ROWNUM <= n` (`NEXT n ROWS ONLY` isn't
;; supported on Oracle versions older than 12). This has to wrap the actual query, e.g.
;;
;; SELECT *
;; FROM (
;;     SELECT *
;;     FROM employees
;;     ORDER BY employee_id
;; )
;; WHERE ROWNUM < 10;
;;
;; This wrapping can cause problems if there is an ambiguous column reference in the nested query (i.e. two columns
;; with the same alias name). To ensure that doesn't happen, those column references need to be disambiguated first
;;
;; To do an offset we have to do something like:
;;
;; SELECT *
;; FROM (
;;     SELECT __table__.*, ROWNUM AS __rownum__
;;     FROM (
;;         SELECT *
;;         FROM employees
;;         ORDER BY employee_id
;;     ) __table__
;;     WHERE ROWNUM <= 150
;; )
;; WHERE __rownum__ >= 100;
;;
;; See issue #3568 and the Oracle documentation for more details: http://docs.oracle.com/cd/B19306_01/server.102/b14200/pseudocolumns009.htm

(defn- apply-limit [honeysql-query {value :limit}]
  {:pre [(integer? value)]}
  {:select [:*]
   :from   [(-> (merge {:select [:*]} ; if `honeysql-query` doesn't have a `SELECT` clause yet (which might be the case when using a source query)
                       honeysql-query); fall back to including a `SELECT *` just to make sure a valid query is produced
                (update :select deduplicate-identifiers))]
   :where  [:<= (hsql/raw "rownum") value]})

(defn- apply-page [honeysql-query {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can use use the single-nesting implementation for `apply-limit`
      (apply-limit honeysql-query {:limit items})
      ;; if we need to do an offset we have to do double-nesting
      {:select [:*]
       :from   [{:select [:__table__.* [(hsql/raw "rownum") :__rownum__]]
                 :from   [[(merge {:select [:*]}
                                  honeysql-query)
                           :__table__]]
                 :where  [:<= (hsql/raw "rownum") (+ offset items)]}]
       :where  [:> :__rownum__ offset]})))


;; Oracle doesn't support `TRUE`/`FALSE`; use `1`/`0`, respectively; convert these booleans to numbers.
(defmethod sqlqp/->honeysql [OracleDriver Boolean]
  [_ bool]
  (if bool 1 0))

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))


(defn- remove-rownum-column
  "Remove the `:__rownum__` column from results, if present."
  [{:keys [columns rows], :as results}]
  (if-not (contains? (set columns) :__rownum__)
    results
    ;; if we added __rownum__ it will always be the last column and value so we can just remove that
    {:columns (butlast columns)
     :rows    (for [row rows]
                (butlast row))}))

(defn- humanize-connection-error-message [message]
  ;; if the connection error message is caused by the assertion above checking whether sid or service-name is set,
  ;; return a slightly nicer looking version. Otherwise just return message as-is
  (if (str/includes? message "(or sid service-name)")
    "You must specify the SID and/or the Service Name."
    message))

(def ^:private oracle-date-formatters (driver/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSS zzz"))
(def ^:private oracle-db-time-query "select to_char(current_timestamp, 'YYYY-MM-DD HH24:MI:SS.FF3 TZD') FROM DUAL")

(u/strict-extend OracleDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:can-connect?                      (u/drop-first-arg can-connect?)
          :date-interval                     (u/drop-first-arg date-interval)
          :details-fields                    (constantly (ssh/with-tunnel-config
                                                           [driver/default-host-details
                                                            (assoc driver/default-port-details :default 1521)
                                                            {:name         "sid"
                                                             :display-name (tru "Oracle system ID (SID)")
                                                             :placeholder  (str (tru "Usually something like ORCL or XE.")
                                                                                " "
                                                                                (tru "Optional if using service name"))}
                                                            {:name         "service-name"
                                                             :display-name (tru "Oracle service name")
                                                             :placeholder  (tru "Optional TNS alias")}
                                                            driver/default-user-details
                                                            driver/default-password-details]))
          :execute-query                     (comp remove-rownum-column sqlqp/execute-query)
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)
          :current-db-time                   (driver/make-current-db-time-fn oracle-db-time-query oracle-date-formatters)})

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
                                          ;; TODO - are there othere APEX tables we want to skip? Maybe we should make
                                          ;; this a pattern instead? (#"^APEX_")
                                          "APEX_040200"
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
                                          ;; DIRTY HACK (!) This is similar hack we do for Redshift, see the
                                          ;; explanation there we just want to ignore all the test "session schemas"
                                          ;; that don't match the current test
                                          (require 'metabase.test.data.oracle)
                                          ((resolve 'metabase.test.data.oracle/non-session-schemas)))))
          :set-timezone-sql          (constantly "ALTER session SET time_zone = %s")
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(defn -init-driver
  "Register the oracle driver when the JAR is found on the classpath"
  []
  ;; only register the Oracle driver if the JDBC driver is available
  (when (u/ignore-exceptions
         (Class/forName "oracle.jdbc.OracleDriver"))
    ;; By default the Oracle JDBC driver isn't compliant with JDBC standards -- instead of returning types like
    ;; java.sql.Timestamp it returns wacky types like oracle.sql.TIMESTAMPT. By setting this System property the JDBC
    ;; driver will return the appropriate types. See this page for more details:
    ;; http://docs.oracle.com/database/121/JJDBC/datacc.htm#sthref437
    (.setProperty (System/getProperties) "oracle.jdbc.J2EE13Compliant" "TRUE")
    (driver/register-driver! :oracle (OracleDriver.))))
