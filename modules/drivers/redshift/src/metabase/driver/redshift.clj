(ns metabase.driver.redshift
  "Amazon Redshift Driver."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [honeysql.core :as hsql]
            [metabase
             [config :as config]
             [driver :as driver]]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util.honeysql-extensions :as hx]))

(driver/register! :redshift, :parent :postgres)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; don't use the Postgres implementation for `describe-table` since it tries to fetch enums which Redshift doesn't
;; support
(defmethod driver/describe-table :redshift [& args]
  (apply (get-method driver/describe-table :sql-jdbc) args))

;; The Postgres JDBC .getImportedKeys method doesn't work for Redshift, and we're not allowed to access
;; information_schema.constraint_column_usage, so we'll have to use this custom query instead
;;
;; See also: [Related Postgres JDBC driver issue on GitHub](https://github.com/pgjdbc/pgjdbc/issues/79)
;;           [How to access the equivalent of information_schema.constraint_column_usage in Redshift](https://forums.aws.amazon.com/thread.jspa?threadID=133514)
(defmethod driver/describe-table-fks :redshift [_ database table]
  (set (for [fk (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                            ["SELECT source_column.attname AS \"fk-column-name\",
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
                                     AND dest_column.attnum   = ANY(c.confkey)"
                             (:name table)
                             (:schema table)])]
         {:fk-column-name   (:fk-column-name fk)
          :dest-table       {:name   (:dest-table-name fk)
                             :schema (:dest-table-schema fk)}
          :dest-column-name (:dest-column-name fk)})))

(defmethod driver/format-custom-field-name :redshift [_ custom-field-name]
  (str/lower-case custom-field-name))

;; The docs say TZ should be allowed at the end of the format string, but it doesn't appear to work
;; Redshift is always in UTC and doesn't return it's timezone
(defmethod driver.common/current-db-time-date-formatters :redshift [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSS zzz"))

(defmethod driver.common/current-db-time-native-query :redshift [_]
  "select to_char(current_timestamp, 'YYYY-MM-DD HH24:MI:SS.MS TZ')")

(defmethod driver/current-db-time :redshift [& args]
  (apply driver.common/current-db-time args))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/date-interval :redshift [_ unit amount]
  (hsql/call :+ :%getdate (hsql/raw (format "INTERVAL '%d %s'" (int amount) (name unit)))))

(defmethod sql.qp/unix-timestamp->timestamp [:redshift :seconds] [_ _ expr]
  (hx/+ (hsql/raw "TIMESTAMP '1970-01-01T00:00:00Z'")
        (hx/* expr
              (hsql/raw "INTERVAL '1 second'"))))

(defmethod sql.qp/current-datetime-fn :redshift [_]
  :%getdate)

(defmethod sql-jdbc.execute/set-timezone-sql :redshift [_]
  "SET TIMEZONE TO %s;")

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.conn/connection-details->spec :redshift [_ {:keys [host port db], :as opts}]
  (merge {:classname "com.amazon.redshift.jdbc.Driver" ; must be in classpath
          :subprotocol "redshift"
          :subname (str "//" host ":" port "/" db "?OpenSourceSubProtocolOverride=false")
          :ssl true}
         (dissoc opts :host :port :db)))

;; HACK ! When we test against Redshift we use a session-unique schema so we can run simultaneous tests
;; against a single remote host; when running tests tell the sync process to ignore all the other schemas
(def ^:private excluded-schemas
  (when config/is-test?
    (memoize
     (fn []
       (require 'metabase.test.data.redshift)
       (let [session-schema-number @(resolve 'metabase.test.data.redshift/session-schema-number)]
         (set (conj (for [i     (range 240)
                          :when (not= i session-schema-number)]
                      (str "schema_" i))
                    "public")))))))

(defmethod sql-jdbc.sync/excluded-schemas :redshift [_]
  (excluded-schemas))
