(ns metabase.test.data.vertica
  "Code for creating / destroying a Vertica database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [colorize.core :as colorize]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]]))

(sql-jdbc.tx/add-test-extensions! :vertica)

(defmethod tx/sorts-nil-first? :vertica [_] false)

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

(defmethod sql.tx/drop-table-if-exists-sql :vertica
  [& args]
  (apply sql.tx/drop-table-if-exists-cascade-sql args))

(defn- dbspec []
  (sql-jdbc.conn/connection-details->spec :vertica @db-connection-details))

(defmethod load-data/load-data! :vertica
  [driver {:keys [database-name], :as dbdef} {:keys [table-name], :as tabledef}]
  ;; try a few times to load the data, Vertica is very fussy and it doesn't always work the first time
  (letfn [(load-data-with-retries! [retries]
            (try
              (load-data/load-data-one-at-a-time! driver dbdef tabledef)
              (catch Throwable e
                (when-not (pos? retries)
                  (throw e))
                (println (colorize/red "\n\nVertica failed to load data, let's try again...\n\n"))
                (let [sql (format "TRUNCATE TABLE %s" (sql.tx/qualify-and-quote :vertica database-name table-name))]
                  (jdbc/execute! (dbspec) sql))
                (load-data-with-retries! (dec retries)))))]
    (load-data-with-retries! 5)))

(defmethod sql.tx/pk-sql-type :vertica [& _] "INTEGER")

(defmethod execute/execute-sql! :vertica [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod tx/has-questionable-timezone-support? :vertica [_] true)


(defmethod tx/before-run :vertica
  [_]
  ;; Close all existing sessions connected to our test DB
  (jdbc/query (dbspec) "SELECT CLOSE_ALL_SESSIONS();")
  ;; Increase the connection limit; the default is 5 or so which causes tests to fail when too many connections are made
  (jdbc/execute! (dbspec) (format "ALTER DATABASE \"%s\" SET MaxClientSessions = 10000;" (db-name))))

(defmethod tx/create-db! :vertica
  [driver dbdef & options]
  ;; try a few times to create the DB. Vertica is very fussy and sometimes you need to try a few times to get it to
  ;; work correctly.
  (letfn [(create-db-with-retries! [retries]
            (try
              (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver dbdef options)
              (catch Throwable e
                (when-not (pos? retries)
                  (throw e))
                (println (colorize/red "\n\nVertica failed to create a DB, again. Let's try again...\n\n"))
                (jdbc/query (dbspec) "SELECT CLOSE_ALL_SESSIONS();")
                (create-db-with-retries! (dec retries)))))]
    (create-db-with-retries! 5)))
