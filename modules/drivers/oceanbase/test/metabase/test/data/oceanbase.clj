(ns metabase.test.data.oceanbase
  "Code for creating / destroying an OceanBase database from a `DatabaseDefinition`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor-test.alternative-date-test :as qp.alternative-date-test]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :oceanbase)

(defmethod driver/database-supports? [:oceanbase :metabase.driver.sql-jdbc.sync.describe-table-test/describe-view-fields]
  [_driver _feature _db] true)
(defmethod driver/database-supports? [:oceanbase :metabase.driver.sql-jdbc.sync.describe-table-test/describe-materialized-view-fields]
  [_driver _feature _db] false)

(defmethod driver/database-supports? [:oceanbase :metabase.query-processor-test.parameters-test/get-parameter-count]
  [_driver _feature _db] false)

(defmethod qp.alternative-date-test/iso-8601-text-fields-expected-rows :oceanbase
  [_driver]
  [[1 "foo" (t/offset-date-time "2004-10-19T10:23:54Z") #t "2004-10-19" (t/offset-date-time "1970-01-01T10:23:54Z")]
   [2 "bar" (t/offset-date-time "2008-10-19T10:23:54Z") #t "2008-10-19" (t/offset-date-time "1970-01-01T10:23:54Z")]
   [3 "baz" (t/offset-date-time "2012-10-19T10:23:54Z") #t "2012-10-19" (t/offset-date-time "1970-01-01T10:23:54Z")]])

(def default-connection-params
  {:classname                      "com.oceanbase.jdbc.Driver"
   :subprotocol                    "oceanbase"
   :subname                        "//localhost:2881/test"
   :user                           "root"
   :password                       "123456"
   :ssl                            false
   :use_server_time_zone_for_dates true
   :product_name                   (format "metabase/%s" (:tag config/mb-version-info))
   :max_open_connections           100
   :auto_commit                    true
   :rewrite_batched_statements     true})

(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/Boolean]         [_ _] "BOOLEAN")
(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/BigInteger]      [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/Char]            [_ _] "CHAR(1)")
(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/Date]            [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/DateTime]        [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/DateTimeWithLocalTZ]  [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/Float]           [_ _] "FLOAT")
(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/Integer]         [_ _] "INT")
(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/IPAddress]       [_ _] "VARCHAR(45)")
(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/Text]            [_ _] "TEXT")
(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/UUID]            [_ _] "VARCHAR(36)")
(defmethod sql.tx/field-base-type->sql-type [:oceanbase :type/Time]            [_ _] "TIME")

(defmethod tx/sorts-nil-first? :oceanbase [_ _] false)

(defmethod tx/dbdef->connection-details :oceanbase [driver context {:keys [database-name]}]
  (merge
   {:host     (mt/db-test-env-var :oceanbase :host)
    :port     (Integer/parseInt (mt/db-test-env-var :oceanbase :port))
    :enable-multiple-db true}
   (when-let [user (mt/db-test-env-var :oceanbase :user)]
     {:user user})
   (when-let [password (mt/db-test-env-var :oceanbase :password)]
     {:password password})
   (when (= context :db)
     (let [database-name (ddl.i/format-name driver database-name)]
       {:db database-name
        :db-filters-type "inclusion"
        :db-filters-patterns database-name}))))

(defmethod sql.tx/qualified-name-components :oceanbase
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [db-name table-name])
  ([_ db-name table-name field-name] [db-name table-name field-name]))

(defmethod tx/create-db! :oceanbase
  [driver {:keys [database-name], :as db-def} & options]
  (let [database-name (ddl.i/format-name driver database-name)]
    (log/infof "Creating OceanBase database %s" (pr-str database-name))
    ;; call the default impl for SQL JDBC drivers
    (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver db-def options)))

(defmethod ddl/insert-rows-dml-statements :oceanbase
  [driver table-identifier rows]
  (binding [driver/*compile-with-inline-parameters* true]
    ((get-method ddl/insert-rows-dml-statements :sql-jdbc/test-extensions) driver table-identifier rows)))

(mu/defmethod load-data/do-insert! :oceanbase
  [driver                    :- :keyword
   ^java.sql.Connection conn :- (lib.schema.common/instance-of-class java.sql.Connection)
   table-identifier
   rows]
  (let [statements (ddl/insert-rows-dml-statements driver table-identifier rows)]
    (doseq [sql-args statements
            :let     [sql-args (if (string? sql-args)
                                 [sql-args]
                                 sql-args)]]
      (assert (string? (first sql-args))
              (format "Bad sql-args: %s" (pr-str sql-args)))
      (log/tracef "[insert] %s" (pr-str sql-args))
      (try
        (jdbc/execute! {:connection conn :transaction? false}
                       sql-args
                       {:set-parameters (fn [stmt params]
                                          (sql-jdbc.execute/set-parameters! driver stmt params))})
        (catch Throwable e
          (throw (ex-info (format "INSERT FAILED: %s" (ex-message e))
                          {:driver   driver
                           :sql-args (into [(str/split-lines (driver/prettify-native-form driver (first sql-args)))]
                                           (rest sql-args))}
                          e)))))))

(defn- quote-name
  [name]
  (sql.u/quote-name :oceanbase :field (ddl.i/format-name :oceanbase name)))

(defn- ->comma-separated-str
  [coll]
  (->> coll
       (interpose ", ")
       (apply str)))

(defn- field->oceanbase-column
  [field]
  (let [{:keys [field-name base-type pk?]} field
        ob-type  (if (map? base-type)
                   (:native base-type)
                   (sql.tx/field-base-type->sql-type :oceanbase base-type))
        col-name (quote-name field-name)
        ob-col   (if pk?
                   (format "%s %s NOT NULL" col-name ob-type)
                   (format "%s %s" col-name ob-type))]
    ob-col))

(defmethod sql.tx/create-table-sql :oceanbase
  [_ {:keys [database-name]} {:keys [table-name field-definitions]}]
  (let [table-name     (sql.tx/qualify-and-quote :oceanbase database-name table-name)
        pk-fields      (filter (fn [{:keys [pk?]}] pk?) field-definitions)
        pk-field-names (map #(quote-name (:field-name %)) pk-fields)
        fields         (->> field-definitions
                            (map field->oceanbase-column)
                            (->comma-separated-str))
        primary-key    (when (seq pk-field-names)
                        (format "PRIMARY KEY (%s)" (->comma-separated-str pk-field-names)))]
    (format "CREATE TABLE %s (%s%s)"
            table-name
            fields
            (if primary-key (str ", " primary-key) ""))))

(defmethod execute/execute-sql! :oceanbase [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod load-data/row-xform :oceanbase [_driver _dbdef tabledef]
  (load-data/maybe-add-ids-xform tabledef))

(defmethod sql.tx/pk-sql-type :oceanbase [_] "INT")

(defmethod sql.tx/add-fk-sql :oceanbase [& _] nil)

(defmethod sql.tx/session-schema :oceanbase [_] "test")

(defn exec-statements
  ([statements details-map]
   (exec-statements statements details-map nil))
  ([statements details-map _oceanbase-settings]
   (sql-jdbc.execute/do-with-connection-with-options
    :oceanbase
    (sql-jdbc.conn/connection-details->spec :oceanbase (merge {:engine :oceanbase} details-map))
    {:write? true}
    (fn [^java.sql.Connection conn]
      (doseq [statement statements]
        (log/tracef "Executing: %s" statement)
        (with-open [jdbcStmt (.createStatement conn)]
          (.execute jdbcStmt statement)))))))

(defmethod tx/dataset-already-loaded? :oceanbase
  [driver dbdef]
  (let [tabledef       (first (:table-definitions dbdef))
        db-name        (ddl.i/format-name :oceanbase (:database-name dbdef))
        table-name     (ddl.i/format-name :oceanbase (:table-name tabledef))
        details        (tx/dbdef->connection-details :oceanbase :db {:database-name db-name})]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     (sql-jdbc.conn/connection-details->spec driver details)
     {:write? false}
     (fn [^java.sql.Connection conn]
       (with-open [rset (.getTables (.getMetaData conn)
                                    #_catalog        nil
                                    #_schema-pattern db-name
                                    #_table-pattern  table-name
                                    #_types          (into-array String ["TABLE"]))]
         ;; if the ResultSet returns anything we know the table is already loaded.
         (.next rset))))))

(defmethod tx/create-and-grant-roles! :oceanbase
  [driver details roles user-name _default-role]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    ;; Create roles for testing
    (doseq [[role-name _role-perms] roles]
      (jdbc/execute! spec [(format "CREATE ROLE IF NOT EXISTS %s" role-name)] {:transaction? false})))
  (sql-jdbc.tx/drop-if-exists-and-create-roles! driver details roles)
  (sql-jdbc.tx/grant-roles-to-user! driver details roles user-name))

(defmethod tx/drop-roles! :oceanbase
  [driver details roles user-name]
  (sql-jdbc.tx/drop-roles! driver details roles)
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    (doseq [[role-name _role-perms] roles]
      (jdbc/execute! spec
                     [(format "DROP ROLE IF EXISTS %s;" role-name)]
                     {:transaction? false}))))

;; Note: OceanBase uses standard SQL JDBC test extensions
;; No custom test data definitions needed
