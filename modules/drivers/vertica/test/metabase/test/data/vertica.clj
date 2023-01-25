(ns metabase.test.data.vertica
  "Code for creating / destroying a Vertica database from a `DatabaseDefinition`."
  (:require [clojure.data.csv :as csv]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [java-time :as t]
            [medley.core :as m]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.sql :as sql.tx]
            [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
            [metabase.test.data.sql-jdbc.execute :as execute]
            [metabase.test.data.sql-jdbc.load-data :as load-data]
            [metabase.util :as u]
            [metabase.util.files :as u.files]
            [methodical.core :as methodical]
            [clojure.java.io :as io]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :vertica)

;; In ORDER BY clause, nulls come last for FLOAT, STRING, and BOOLEAN columns, and first otherwise
;; https://www.vertica.com/docs/9.2.x/HTML/Content/Authoring/AnalyzingData/Optimizations/NULLPlacementByAnalyticFunctions.htm#2
(defmethod tx/sorts-nil-first? :vertica [_ base-type]
  (not (contains? #{:type/Text :type/Boolean :type/Float}
                  base-type)))

(doseq [[base-type sql-type] {:type/BigInteger     "BIGINT"
                              :type/Boolean        "BOOLEAN"
                              :type/Char           "VARCHAR(254)"
                              :type/Date           "DATE"
                              :type/DateTime       "TIMESTAMP"
                              :type/DateTimeWithTZ "TIMESTAMP WITH TIME ZONE"
                              :type/Decimal        "NUMERIC"
                              :type/Float          "FLOAT"
                              :type/Integer        "INTEGER"
                              :type/Text           "VARCHAR(1024)"
                              :type/Time           "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:vertica base-type] [_ _] sql-type))

(defn- db-name []
  (tx/db-test-env-var-or-throw :vertica :db "VMart"))

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

(defmethod execute/execute-sql! :vertica [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod tx/has-questionable-timezone-support? :vertica [_] true)

(defmethod tx/before-run :vertica
  [_]
  ;; Close all existing sessions connected to our test DB
  (jdbc/query (dbspec) "SELECT CLOSE_ALL_SESSIONS();")
  ;; Increase the connection limit; the default is 5 or so which causes tests to fail when too many connections are made
  (jdbc/execute! (dbspec) (format "ALTER DATABASE \"%s\" SET MaxClientSessions = 1000;" (db-name))))

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

(methodical/defmethod tx/load-dataset-step! [:vertica :default :csv]
  "Load rows from a CSV file into a Table."
  [driver dataset-name {:keys [table file]}]
  (let [file-name-on-class-path (format "metabase/driver/%s/%s" (name driver) file)]
    (try
      (let [resource (or (io/resource file-name-on-class-path)
                         (throw (ex-info "Cannot find file on class path" {:file file-name-on-class-path})))]
        (execute/execute-sql! driver :server {:database-name dataset-name}
                              (format "COPY %s FROM LOCAL '%s' DELIMITER ','"
                                      (sql.tx/qualify-and-quote :vertica (name dataset-name) table)
                                      (.getAbsolutePath (io/file resource)))))
      (catch Throwable e
        (throw (ex-info "Error loading rows from CSV file" {:file file-name-on-class-path} e))))))
