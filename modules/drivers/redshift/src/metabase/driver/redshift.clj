(ns metabase.driver.redshift
  "Amazon Redshift Driver."
  (:require [cheshire.core :as json]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]]
            [metabase.driver.sql-jdbc.execute.legacy-impl :as legacy]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor.util :as qputil]
            [metabase.util
             [honeysql-extensions :as hx]
             [i18n :refer [trs]]])
  (:import [java.sql ResultSet Types]
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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

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
  (let [conn (.getConnection (sql-jdbc.execute/datasource database))]
    (try
      (sql-jdbc.execute/set-best-transaction-level! driver conn)
      (sql-jdbc.execute/set-time-zone-if-supported! driver conn timezone-id)
      (try
        (.setHoldability conn ResultSet/CLOSE_CURSORS_AT_COMMIT)
        (catch Throwable e
          (log/debug e (trs "Error setting default holdability for connection"))))
      conn
      (catch Throwable e
        (.close conn)
        (throw e)))))

(defn- splice-raw-string-value
  [driver s]
  (hsql/raw (str "'" (sql.qp/->honeysql driver s) "'")))

(defmethod sql.qp/->honeysql [:redshift :regex-match-first]
  [driver [_ arg pattern]]
  (hsql/call :regexp_substr (sql.qp/->honeysql driver arg) (splice-raw-string-value driver pattern)))

(defmethod sql.qp/->honeysql [:redshift :replace]
  [driver [_ arg pattern replacement]]
  (hsql/call :replace (sql.qp/->honeysql driver arg) (splice-raw-string-value driver pattern)
              (splice-raw-string-value driver replacement)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.conn/connection-details->spec :redshift
  [_ {:keys [host port db], :as opts}]
  (merge
   {:classname                     "com.amazon.redshift.jdbc.Driver"
    :subprotocol                   "redshift"
    :subname                       (str "//" host ":" port "/" db)
    :ssl                           true
    :OpenSourceSubProtocolOverride false}
   (dissoc opts :host :port :db)))

(prefer-method
 sql-jdbc.execute/read-column-thunk
 [::legacy/use-legacy-classes-for-read-and-set Types/TIMESTAMP]
 [:postgres Types/TIMESTAMP])

(prefer-method
 sql-jdbc.execute/set-parameter
 [::legacy/use-legacy-classes-for-read-and-set OffsetTime]
 [:postgres OffsetTime])


;; example query:
;; {:database 2
;; :query
;; {:source-table 86
;;  :filter
;;  [:and
;;   [:= [:field-id 46] [:value "MOROCCO" {:base_type :type/Text, :special_type :type/Category, :database_type "varchar", :name "c_nation"}]]
;;   [:= [:field-id 47] [:value "AFRICA" {:base_type :type/Text, :special_type :type/Category, :database_type "varchar", :name "c_region"}]]]
;;  :fields [[:field-id 48] [:field-id 41] [:field-id 43] [:field-id 44] [:field-id 42] [:field-id 46] [:field-id 45] [:field-id 47]]
;;  :limit 2000}
;; :type :query
;; :middleware {:add-default-userland-constraints? true}
;; :info
;; {:executed-by 1
;;  :context :ad-hoc
;;  :nested? false
;;  :query-hash [-98, -79, -69, 52, -33, -66, 92, -59, -30, -96, -90, 105, 14, -8, -50, -37, -69, -84, -84, -6, -106, 126, -8, -36, -52, -128, -58, -65, -8, 111, 14, 12]}
;; :constraints {:max-results 10000, :max-results-bare-rows 2000}
;; :native
;; {:query
;;  "SELECT \"public\".\"customer\".\"c_address\" AS \"c_address\", \"public\".\"customer\".\"c_city\" AS \"c_city\",
;;  \"public\".\"customer\".\"c_custkey\" AS \"c_custkey\", \"public\".\"customer\".\"c_mktsegment\" AS \"c_mktsegment\",
;;  \"public\".\"customer\".\"c_name\" AS \"c_name\", \"public\".\"customer\".\"c_nation\" AS \"c_nation\",
;;  \"public\".\"customer\".\"c_phone\" AS \"c_phone\", \"public\".\"customer\".\"c_region\" AS \"c_region\"
;;  FROM \"public\".\"customer\" WHERE (\"public\".\"customer\".\"c_nation\" = ? AND
;;  \"public\".\"customer\".\"c_region\" = ?) LIMIT 2000"
;;  :params ("MOROCCO" "AFRICA")}}

(defmethod qputil/query->remark :redshift
  [_ {{:keys [executed-by query-hash card-id], :as info} :info, query-type :type :as params}]
  (log/spy :error params)
  (str "/* partner: \"metabase\", "
       (json/generate-string {:dashboard_id nil ;; requires metabase/metabase#11909
                              :chart_id card-id
                              :optional_user_id executed-by
                              :filter_values {}})
       " */ "
       (qputil/default-query->remark params)))
