(ns metabase.driver.redshift
  "Amazon Redshift Driver."
  (:require [cheshire.core :as json]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.execute.legacy-impl :as legacy]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql-jdbc.sync.describe-database :as sync.describe-database]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.mbql.util :as mbql.u]
            [metabase.public-settings :as pubset]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.util :as qputil]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.i18n :refer [trs]])
  (:import [java.sql Connection PreparedStatement ResultSet Types]
           java.time.OffsetTime))

(driver/register! :redshift, :parent #{:postgres ::legacy/use-legacy-classes-for-read-and-set})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; don't use the Postgres implementation for `describe-table` since it tries to fetch enums which Redshift doesn't
;; support
(defmethod driver/describe-table :redshift
  [& args]
  (apply (get-method driver/describe-table :sql-jdbc) args))

;; The Postgres JDBC .getImportedKeys method doesn't work for Redshift, and we're not allowed to access
;; information_schema.constraint_column_usage, so we'll have to use this custom query instead
;;
;; See also: [Related Postgres JDBC driver issue on GitHub](https://github.com/pgjdbc/pgjdbc/issues/79)
;;           [How to access the equivalent of information_schema.constraint_column_usage in Redshift](https://forums.aws.amazon.com/thread.jspa?threadID=133514)
(def ^:private fk-query
  "SELECT source_column.attname AS \"fk-column-name\",
          dest_table.relname    AS \"dest-table-name\",
          dest_table_ns.nspname AS \"dest-table-schema\",
          dest_column.attname   AS \"dest-column-name\"
   FROM pg_constraint c
          JOIN pg_namespace n             ON c.connamespace          = n.oid
          JOIN pg_class source_table      ON c.conrelid              = source_table.oid
          JOIN pg_attribute source_column ON c.conrelid              = source_column.attrelid
          JOIN pg_class dest_table        ON c.confrelid             = dest_table.oid
          JOIN pg_namespace dest_table_ns ON dest_table.relnamespace = dest_table_ns.oid
          JOIN pg_attribute dest_column   ON c.confrelid             = dest_column.attrelid
   WHERE c.contype                 = 'f'::char
          AND source_table.relname = ?
          AND n.nspname            = ?
          AND source_column.attnum = ANY(c.conkey)
          AND dest_column.attnum   = ANY(c.confkey)")

(defmethod driver/describe-table-fks :redshift
  [_ database table]
  (set (for [fk (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                            [fk-query (:name table) (:schema table)])]
         {:fk-column-name   (:fk-column-name fk)
          :dest-table       {:name   (:dest-table-name fk)
                             :schema (:dest-table-schema fk)}
          :dest-column-name (:dest-column-name fk)})))

(defmethod driver/format-custom-field-name :redshift
  [_ custom-field-name]
  (str/lower-case custom-field-name))

;; The docs say TZ should be allowed at the end of the format string, but it doesn't appear to work
;; Redshift is always in UTC and doesn't return it's timezone
(defmethod driver.common/current-db-time-date-formatters :redshift
  [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSS zzz"))

(defmethod driver.common/current-db-time-native-query :redshift
  [_]
  "select to_char(current_timestamp, 'YYYY-MM-DD HH24:MI:SS.MS TZ')")

(defmethod driver/current-db-time :redshift
  [& args]
  (apply driver.common/current-db-time args))

(defmethod driver/db-start-of-week :redshift
  [_]
  :sunday)



;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; custom Redshift type handling

(def ^:private database-type->base-type
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [[#"(?i)CHARACTER VARYING" :type/Text]       ; Redshift uses CHARACTER VARYING (N) as a synonym for VARCHAR(N)
    [#"(?i)NUMERIC"           :type/Decimal]])) ; and also has a NUMERIC(P,S) type, which is the same as DECIMAL(P,S)

(defmethod sql-jdbc.sync/database-type->base-type :redshift
  [driver column-type]
  (or (database-type->base-type column-type)
      ((get-method sql-jdbc.sync/database-type->base-type :postgres) driver column-type)))

(defmethod sql.qp/add-interval-honeysql-form :redshift
  [_ hsql-form amount unit]
  (hsql/call :dateadd (hx/literal unit) amount (hx/->timestamp hsql-form)))

(defmethod sql.qp/unix-timestamp->honeysql [:redshift :seconds]
  [_ _ expr]
  (hx/+ (hsql/raw "TIMESTAMP '1970-01-01T00:00:00Z'")
        (hx/* expr
              (hsql/raw "INTERVAL '1 second'"))))

(defmethod sql.qp/current-datetime-honeysql-form :redshift
  [_]
  :%getdate)

(defmethod sql-jdbc.execute/set-timezone-sql :redshift
  [_]
  "SET TIMEZONE TO %s;")

;; This impl is basically the same as the default impl in `sql-jdbc.execute`, but doesn't attempt to make the
;; connection read-only, because that seems to be causing problems for people
(defmethod sql-jdbc.execute/connection-with-timezone :redshift
  [driver database ^String timezone-id]
  (let [conn (.getConnection (sql-jdbc.execute/datasource-with-diagnostic-info! driver database))]
    (try
      (sql-jdbc.execute/set-best-transaction-level! driver conn)
      (sql-jdbc.execute/set-time-zone-if-supported! driver conn timezone-id)
      (try
        (.setHoldability conn ResultSet/CLOSE_CURSORS_AT_COMMIT)
        (catch Throwable e
          (log/debug e (trs "Error setting default holdability for connection"))))
      conn
      (catch Throwable e
        (.close ^Connection conn)
        (throw e)))))

(defn- prepare-statement ^PreparedStatement [^Connection conn sql]
  (.prepareStatement conn
                     sql
                     ResultSet/TYPE_FORWARD_ONLY
                     ResultSet/CONCUR_READ_ONLY
                     ResultSet/CLOSE_CURSORS_AT_COMMIT))

(defn- quote-literal-for-connection
  "Quotes a string literal so that it can be safely inserted into Redshift queries, by returning the result of invoking
  the Redshift QUOTE_LITERAL function on the given string (which is set in a PreparedStatement as a parameter)."
  [^Connection conn ^String s]
  (with-open [stmt (doto (prepare-statement conn "SELECT QUOTE_LITERAL(?);")
                     (.setString 1 s))
              rs   (.executeQuery stmt)]
    (when (.next rs)
      (.getString rs 1))))

(defn- quote-literal-for-database
  "This function invokes quote-literal-for-connection with a connection for the given database. See its docstring for
  more detail."
  [database s]
  (let [jdbc-spec (sql-jdbc.conn/db->pooled-connection-spec database)]
    (with-open [conn (jdbc/get-connection jdbc-spec)]
      (quote-literal-for-connection conn s))))

(defmethod sql.qp/->honeysql [:redshift :regex-match-first]
  [driver [_ arg pattern]]
  (hsql/call
    :regexp_substr
    (sql.qp/->honeysql driver arg)
    ;; the parameter to REGEXP_SUBSTR can only be a string literal; neither prepared statement parameters nor encoding/
    ;; decoding functions seem to work (fails with java.sql.SQLExcecption: "The pattern must be a valid UTF-8 literal
    ;; character expression"), hence we will use a different function to safely escape it before splicing here
    (hsql/raw (quote-literal-for-database (qp.store/database) pattern))))

(defmethod sql.qp/->honeysql [:redshift :replace]
  [driver [_ arg pattern replacement]]
  (hsql/call
    :replace
    (sql.qp/->honeysql driver arg)
    (sql.qp/->honeysql driver pattern)
    (sql.qp/->honeysql driver replacement)))

(defmethod sql.qp/->honeysql [:redshift :concat]
  [driver [_ & args]]
  (->> args
       (map (partial sql.qp/->honeysql driver))
       (reduce (partial hsql/call :concat))))

(defmethod sql.qp/->honeysql [:redshift :concat]
  [driver [_ & args]]
  (->> args
       (map (partial sql.qp/->honeysql driver))
       (reduce (partial hsql/call :concat))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.conn/connection-details->spec :redshift
  [_ {:keys [host port db], :as opts}]
  (sql-jdbc.common/handle-additional-options
   (merge
    {:classname                     "com.amazon.redshift.jdbc42.Driver"
     :subprotocol                   "redshift"
     :subname                       (str "//" host ":" port "/" db)
     :ssl                           true
     :OpenSourceSubProtocolOverride false
     :additional-options            (str "defaultRowFetchSize=" (pubset/redshift-fetch-size))}
    (dissoc opts :host :port :db))))

(prefer-method
 sql-jdbc.execute/read-column-thunk
 [::legacy/use-legacy-classes-for-read-and-set Types/TIMESTAMP]
 [:postgres Types/TIMESTAMP])

(prefer-method
 sql-jdbc.execute/read-column-thunk
 [::legacy/use-legacy-classes-for-read-and-set Types/TIME]
 [:postgres Types/TIME])

(prefer-method
 sql-jdbc.execute/set-parameter
 [::legacy/use-legacy-classes-for-read-and-set OffsetTime]
 [:postgres OffsetTime])

(defn- field->parameter-value
  "Map fields used in parameters to parameter `:value`s."
  [{:keys [user-parameters]}]
  (into {}
        (keep (fn [param]
                (if (contains? param :name)
                  [(:name param) (:value param)]

                  (when-let [field-id (mbql.u/match-one param
                                        [:field (field-id :guard integer?) _]
                                        (when (contains? (set &parents) :dimension)
                                          field-id))]
                    [(:name (qp.store/field field-id)) (:value param)]))))
        user-parameters))

(defmethod qputil/query->remark :redshift
  [_ {{:keys [executed-by query-hash card-id]} :info, :as query}]
  (str "/* partner: \"metabase\", "
       (json/generate-string {:dashboard_id        nil ;; requires metabase/metabase#11909
                              :chart_id            card-id
                              :optional_user_id    executed-by
                              :optional_account_id (pubset/site-uuid)
                              :filter_values       (field->parameter-value query)})
       " */ "
       (qputil/default-query->remark query)))

(defn- reducible-schemas-with-usage-permissions
  "Takes something `reducible` that returns a collection of string schema names (e.g. an `Eduction`) and returns an
  `IReduceInit` that filters out schemas for which the DB user has no schema privileges."
  [^Connection conn reducible]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (with-open [stmt (prepare-statement conn "SELECT HAS_SCHEMA_PRIVILEGE(?, 'USAGE');")]
        (reduce
         rf
         init
         (eduction
          (filter (fn [^String table-schema]
                    (try
                      (with-open [rs (.executeQuery (doto stmt (.setString 1 table-schema)))]
                        (let [has-perm? (and (.next rs)
                                             (.getBoolean rs 1))]
                          (or has-perm?
                              (log/tracef "Ignoring schema %s because no USAGE privilege on it" table-schema))))
                      (catch Throwable e
                        (log/error e (trs "Error checking schema permissions"))
                        false))))
          reducible))))))

(defmethod sql-jdbc.sync/syncable-schemas :redshift
  [driver conn metadata]
  (reducible-schemas-with-usage-permissions
   conn
   (eduction
    (remove (set (sql-jdbc.sync/excluded-schemas driver)))
    (sync.describe-database/all-schemas metadata))))
