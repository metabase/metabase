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

(doseq [[base-type sql-type] {:type/BigInteger     "BIGINT"
                              :type/Boolean        "BOOLEAN"
                              :type/Char           "VARCHAR(254)"
                              :type/Date           "DATE"
                              :type/DateTime       "TIMESTAMP"
                              :type/DateTimeWithTZ "TIMESTAMP WITH TIME ZONE"
                              :type/Decimal        "NUMERIC"
                              :type/Float          "FLOAT"
                              :type/Integer        "INTEGER"
                              :type/Text           "VARCHAR(254)"
                              :type/Time           "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:vertica base-type] [_ _] sql-type))

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

(defn- do-with-retries
  "Attempt to execute `thunk` up to `num-retries` times. If it throws an Exception, execute `on-fail` and try again if
  any retries remain."
  [thunk on-fail num-retries]
  (if-not (pos? num-retries)
    (thunk)
    (try
      (thunk)
      (catch Throwable e
        (on-fail)
        (do-with-retries thunk on-fail (dec num-retries))))))

(defmethod load-data/load-data! :vertica
  [driver {:keys [database-name], :as dbdef} {:keys [table-name], :as tabledef}]
  ;; try a few times to load the data, Vertica is very fussy and it doesn't always work the first time
  (do-with-retries
   #(load-data/load-data-one-at-a-time-add-ids! driver dbdef tabledef)
   (fn []
     (println (colorize/red "\n\nVertica failed to load data, let's try again...\n\n"))
     (let [sql (format "TRUNCATE TABLE %s" (sql.tx/qualify-and-quote :vertica database-name table-name))]
       (jdbc/execute! (dbspec) sql)))
   5))

(defmethod sql.tx/pk-sql-type :vertica [& _] "INTEGER")

(defmethod execute/execute-sql! :vertica [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod tx/has-questionable-timezone-support? :vertica [_] true)


(defmethod tx/before-run :vertica
  [_]
  ;; Close all existing sessions connected to our test DB
  (jdbc/query (dbspec) "SELECT CLOSE_ALL_SESSIONS();")
  ;; Increase the connection limit; the default is 5 or so which causes tests to fail when too many connections are made
  (jdbc/execute! (dbspec) (format "ALTER DATABASE \"%s\" SET MaxClientSessions = 1000;" (db-name))))

(defmethod tx/create-db! :vertica
  [driver dbdef & options]
  ;; try a few times to create the DB. Vertica is very fussy and sometimes you need to try a few times to get it to
  ;; work correctly.
  (do-with-retries
   #(apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver dbdef options)
   (fn []
     (println (colorize/red "\n\nVertica failed to create a DB, again. Let's try again...\n\n"))
     (jdbc/query (dbspec) "SELECT CLOSE_ALL_SESSIONS();"))
   5))

(defmethod tx/aggregate-column-info :vertica
  ([driver ag-type]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer})))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer}))))
