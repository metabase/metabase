(ns metabase.test.data.postgres
  "Postgres driver test extensions."
  (:require [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc.load-data :as load-data]
            [metabase.test.data.sql.ddl :as ddl]))

(sql-jdbc.tx/add-test-extensions! :postgres)

(defmethod tx/has-questionable-timezone-support? :postgres [_] true)

(defmethod sql.tx/pk-sql-type :postgres [_] "SERIAL")

(defmethod sql.tx/field-base-type->sql-type [:postgres :type/BigInteger]     [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:postgres :type/Boolean]        [_ _] "BOOL")
(defmethod sql.tx/field-base-type->sql-type [:postgres :type/Date]           [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:postgres :type/DateTime]       [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:postgres :type/DateTimeWithTZ] [_ _] "TIMESTAMP WITH TIME ZONE")
(defmethod sql.tx/field-base-type->sql-type [:postgres :type/Decimal]        [_ _] "DECIMAL")
(defmethod sql.tx/field-base-type->sql-type [:postgres :type/Float]          [_ _] "FLOAT")
(defmethod sql.tx/field-base-type->sql-type [:postgres :type/Integer]        [_ _] "INTEGER")
(defmethod sql.tx/field-base-type->sql-type [:postgres :type/IPAddress]      [_ _] "INET")
(defmethod sql.tx/field-base-type->sql-type [:postgres :type/Text]           [_ _] "TEXT")
(defmethod sql.tx/field-base-type->sql-type [:postgres :type/Time]           [_ _] "TIME")
(defmethod sql.tx/field-base-type->sql-type [:postgres :type/UUID]           [_ _] "UUID")

(defmethod tx/dbdef->connection-details :postgres [_ context {:keys [database-name]}]
  (merge
   {:host     (tx/db-test-env-var-or-throw :postgresql :host "localhost")
    :port     (tx/db-test-env-var-or-throw :postgresql :port 5432)
    :timezone :America/Los_Angeles}
   (when-let [user (tx/db-test-env-var :postgresql :user)]
     {:user user})
   (when-let [password (tx/db-test-env-var :postgresql :password)]
     {:password password})
   (when (= context :db)
     {:db database-name})))

(defn- kill-connections-to-db-sql
  "Return a SQL `SELECT` statement that will kill all connections to a database with DATABASE-NAME."
  ^String [database-name]
  (format (str "DO $$ BEGIN\n"
               "  PERFORM pg_terminate_backend(pg_stat_activity.pid)\n"
               "  FROM pg_stat_activity\n"
               "  WHERE pid <> pg_backend_pid()\n"
               "    AND pg_stat_activity.datname = '%s';\n"
               "END $$;\n")
          (name database-name)))

(defmethod ddl/drop-db-ddl-statements :postgres [driver {:keys [database-name], :as dbdef} & options]
  ;; add an additonal statement to the front to kill open connections to the DB before dropping
  (cons
   (kill-connections-to-db-sql database-name)
   (apply (get-method ddl/drop-db-ddl-statements :sql-jdbc/test-extensions) :postgres dbdef options)))

(defmethod load-data/load-data! :postgres [& args]
  (apply load-data/load-data-all-at-once! args))

(defmethod sql.tx/standalone-column-comment-sql :postgres [& args]
  (apply sql.tx/standard-standalone-column-comment-sql args))

(defmethod sql.tx/standalone-table-comment-sql :postgres [& args]
  (apply sql.tx/standard-standalone-table-comment-sql args))
