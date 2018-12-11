(ns metabase.test.data.vertica
  "Code for creating / destroying a Vertica database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]]
            [metabase.util :as u]))

(sql-jdbc.tx/add-test-extensions! :vertica)

(defmethod sql.tx/field-base-type->sql-type [:vertica :type/BigInteger] [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:vertica :type/Boolean]    [_ _] "BOOLEAN")
(defmethod sql.tx/field-base-type->sql-type [:vertica :type/Char]       [_ _] "VARCHAR(254)")
(defmethod sql.tx/field-base-type->sql-type [:vertica :type/Date]       [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:vertica :type/DateTime]   [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:vertica :type/Decimal]    [_ _] "NUMERIC")
(defmethod sql.tx/field-base-type->sql-type [:vertica :type/Float]      [_ _] "FLOAT")
(defmethod sql.tx/field-base-type->sql-type [:vertica :type/Integer]    [_ _] "INTEGER")
(defmethod sql.tx/field-base-type->sql-type [:vertica :type/Text]       [_ _] "VARCHAR(254)")
(defmethod sql.tx/field-base-type->sql-type [:vertica :type/Time]       [_ _] "TIME")

(defn- db-name []
  (tx/db-test-env-var-or-throw :vertica :db "docker"))

(def ^:private db-connection-details
  (delay {:host     (tx/db-test-env-var-or-throw :vertica :host "localhost")
          :port     (Integer/parseInt (tx/db-test-env-var-or-throw :vertica :port "5433"))
          :user     (tx/db-test-env-var :vertica :user "dbadmin")
          :password (tx/db-test-env-var :vertica :password)
          :db       (db-name)
          :timezone :America/Los_Angeles}))

(defmethod tx/dbdef->connection-details :vertica [& _] @db-connection-details)

(defmethod sql.tx/qualified-name-components :vertica
  ([_ _]                             [(db-name)])
  ([_ db-name table-name]            ["public" (tx/db-qualified-table-name db-name table-name)])
  ([_ db-name table-name field-name] ["public" (tx/db-qualified-table-name db-name table-name) field-name]))

(defmethod sql.tx/create-db-sql         :vertica [& _] nil)
(defmethod sql.tx/drop-db-if-exists-sql :vertica [& _] nil)

(defmethod sql.tx/drop-table-if-exists-sql :vertica [& args]
  (apply sql.tx/drop-table-if-exists-cascade-sql args))

(defmethod load-data/load-data! :vertica [& args]
  (apply load-data/load-data-one-at-a-time-parallel! args))

(defmethod sql.tx/pk-sql-type :vertica [& _] "INTEGER")

(defmethod execute/execute-sql! :vertica [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod tx/has-questionable-timezone-support? :vertica [_] true)


(defn- dbspec []
  (sql-jdbc.conn/connection-details->spec :vertica @db-connection-details))

(defmethod tx/before-run :vertica [_]
  ;; Close all existing sessions connected to our test DB
  (jdbc/query (dbspec) "SELECT CLOSE_ALL_SESSIONS();")
  ;; Increase the connection limit; the default is 5 or so which causes tests to fail when too many connections are made
  (jdbc/execute! (dbspec) (format "ALTER DATABASE \"%s\" SET MaxClientSessions = 10000;" (db-name))))
