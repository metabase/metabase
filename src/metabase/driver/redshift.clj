(ns metabase.driver.redshift
  "Amazon Redshift Driver."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [honeysql.core :as hsql]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.db.spec :as dbspec]
            [metabase.driver
             [generic-sql :as sql]
             [postgres :as postgres]]
            [metabase.util
             [honeysql-extensions :as hx]
             [ssh :as ssh]]))

(defn- connection-details->spec [details]
  (dbspec/postgres (merge details postgres/ssl-params))) ; always connect to redshift over SSL

(defn- date-interval [unit amount]
  (hsql/call :+ :%getdate (hsql/raw (format "INTERVAL '%d %s'" (int amount) (name unit)))))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hx/+ (hsql/raw "TIMESTAMP '1970-01-01T00:00:00Z'")
                        (hx/* expr
                              (hsql/raw "INTERVAL '1 second'")))
    :milliseconds (recur (hx// expr 1000) :seconds)))

;; The Postgres JDBC .getImportedKeys method doesn't work for Redshift, and we're not allowed to access information_schema.constraint_column_usage,
;; so we'll have to use this custom query instead
;; See also: [Related Postgres JDBC driver issue on GitHub](https://github.com/pgjdbc/pgjdbc/issues/79)
;;           [How to access the equivalent of information_schema.constraint_column_usage in Redshift](https://forums.aws.amazon.com/thread.jspa?threadID=133514)
(defn- describe-table-fks [database table]
  (set (for [fk (jdbc/query (sql/db->jdbc-connection-spec database)
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

(defrecord RedshiftDriver []
  clojure.lang.Named
  (getName [_] "Amazon Redshift"))

(u/strict-extend RedshiftDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval            (u/drop-first-arg date-interval)
          :describe-table-fks       (u/drop-first-arg describe-table-fks)
          :details-fields           (constantly (ssh/with-tunnel-config
                                                  [{:name         "host"
                                                    :display-name "Host"
                                                    :placeholder  "my-cluster-name.abcd1234.us-east-1.redshift.amazonaws.com"
                                                    :required     true}
                                                   {:name         "port"
                                                    :display-name "Port"
                                                    :type         :integer
                                                    :default      5439}
                                                   {:name         "db"
                                                    :display-name "Database name"
                                                    :placeholder  "toucan_sightings"
                                                    :required     true}
                                                   {:name         "user"
                                                    :display-name "Database username"
                                                    :placeholder  "cam"
                                                    :required     true}
                                                   {:name         "password"
                                                    :display-name "Database user password"
                                                    :type         :password
                                                    :placeholder  "*******"
                                                    :required     true}]))
          :format-custom-field-name (u/drop-first-arg str/lower-case)})

  sql/ISQLDriver
  (merge postgres/PostgresISQLDriverMixin
         {:connection-details->spec  (u/drop-first-arg connection-details->spec)
          :current-datetime-fn       (constantly :%getdate)
          :set-timezone-sql          (constantly nil)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}
         ;; HACK ! When we test against Redshift we use a session-unique schema so we can run simultaneous tests against a single remote host;
         ;; when running tests tell the sync process to ignore all the other schemas
         (when config/is-test?
           {:excluded-schemas (memoize
                               (fn [_]
                                 (require 'metabase.test.data.redshift)
                                 (let [session-schema-number @(resolve 'metabase.test.data.redshift/session-schema-number)]
                                   (set (conj (for [i (range 240)
                                                    :when (not= i session-schema-number)]
                                                (str "schema_" i))
                                              "public")))))})))

(driver/register-driver! :redshift (RedshiftDriver.))
