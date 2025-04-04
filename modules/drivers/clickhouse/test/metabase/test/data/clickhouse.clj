(ns metabase.test.data.clickhouse
  "Code for creating / destroying a ClickHouse database from a `DatabaseDefinition`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
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

(sql-jdbc.tx/add-test-extensions! :clickhouse)

(defmethod driver/database-supports? [:clickhouse :metabase.driver.sql-jdbc.sync.describe-table-test/describe-view-fields]
  [_driver _feature _db] true)
(defmethod driver/database-supports? [:clickhouse :metabase.driver.sql-jdbc.sync.describe-table-test/describe-materialized-view-fields]
  [_driver _feature _db] false)

(defmethod driver/database-supports? [:clickhouse :metabase.query-processor-test.parameters-test/get-parameter-count]
  [_driver _feature _db] false)

(defmethod qp.alternative-date-test/iso-8601-text-fields-expected-rows :clickhouse
  [_driver]
  [[1 "foo" (t/offset-date-time "2004-10-19T10:23:54Z") #t "2004-10-19" (t/offset-date-time "1970-01-01T10:23:54Z")]
   [2 "bar" (t/offset-date-time "2008-10-19T10:23:54Z") #t "2008-10-19" (t/offset-date-time "1970-01-01T10:23:54Z")]
   [3 "baz" (t/offset-date-time "2012-10-19T10:23:54Z") #t "2012-10-19" (t/offset-date-time "1970-01-01T10:23:54Z")]])

(def default-connection-params
  {:classname                      "com.clickhouse.jdbc.ClickHouseDriver"
   :subprotocol                    "clickhouse"
   :subname                        "//localhost:8123/default"
   :user                           "default"
   :password                       ""
   :ssl                            false
   :use_server_time_zone_for_dates true
   :product_name                   (format "metabase/%s" (:tag config/mb-version-info))
   :jdbc_ignore_unsupported_values "true"
   :jdbc_schema_term               "schema",
   :max_open_connections           100
   :remember_last_set_roles        true
   :http_connection_provider       "HTTP_URL_CONNECTION"
   :custom_http_params             ""})

(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/Boolean]         [_ _] "Boolean")
(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/BigInteger]      [_ _] "Int64")
(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/Char]            [_ _] "String")
(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/Date]            [_ _] "Date")
(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/DateTime]        [_ _] "DateTime64(3, 'GMT0')")
(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/DateTimeWithLocalTZ]  [_ _] "DateTime64(3, 'UTC')")
(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/Float]           [_ _] "Float64")
(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/Integer]         [_ _] "Int32")
(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/IPAddress]       [_ _] "IPv4")
(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/Text]            [_ _] "String")
(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/UUID]            [_ _] "UUID")
(defmethod sql.tx/field-base-type->sql-type [:clickhouse :type/Time]            [_ _] "Time")

(defmethod tx/sorts-nil-first? :clickhouse [_ _] false)

(defmethod tx/dbdef->connection-details :clickhouse [_ context {:keys [database-name]}]
  (merge
   {:host     (mt/db-test-env-var :clickhouse :host)
    :port     (mt/db-test-env-var :clickhouse :port)}
   (when-let [user (mt/db-test-env-var :clickhouse :user)]
     {:user user})
   (when-let [password (mt/db-test-env-var :clickhouse :password)]
     {:password password})
   (when (= context :db)
     {:db database-name})))

(defmethod sql.tx/qualified-name-components :clickhouse
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [db-name table-name])
  ([_ db-name table-name field-name] [db-name table-name field-name]))

(defmethod tx/create-db! :clickhouse
  [driver {:keys [database-name], :as db-def} & options]
  (let [database-name (ddl.i/format-name driver database-name)]
    (log/infof "Creating ClickHouse database %s" (pr-str database-name))
    ;; call the default impl for SQL JDBC drivers
    (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver db-def options)))

(mu/defmethod load-data/do-insert! :clickhouse
  [driver                    :- :keyword
   ^java.sql.Connection conn :- (lib.schema.common/instance-of-class java.sql.Connection)
   table-identifier
   rows]
  ;; (println "###### calling load-data/do-insert!")
  (let [statements (ddl/insert-rows-dml-statements driver table-identifier rows)]
    (doseq [sql-args statements
            :let     [sql-args (if (string? sql-args)
                                 [sql-args]
                                 sql-args)]]
      (assert (string? (first sql-args))
              (format "Bad sql-args: %s" (pr-str sql-args)))
      (log/tracef "[insert] %s" (pr-str sql-args))
      (try
        ;; (println "#### do-insert! statement: " statements)
        (jdbc/execute! {:connection conn :transaction? false}
                       sql-args
                       {:set-parameters (fn [stmt params]
                                          (sql-jdbc.execute/set-parameters! driver stmt params))})
        (catch Throwable e
          (throw (ex-info (format "INSERT FAILED: %s" (ex-message e))
                          {:driver   driver
                           :sql-args (into [(str/split-lines (mdb.query/format-sql (first sql-args)))]
                                           (rest sql-args))}
                          e)))))))

(defn- quote-name
  [name]
  (sql.u/quote-name :clickhouse :field (ddl.i/format-name :clickhouse name)))

(def ^:private non-nullable-types ["Array" "Map" "Tuple" "Nullable"])

(defn- disallowed-as-nullable?
  [ch-type]
  (boolean (some #(str/starts-with? ch-type %) non-nullable-types)))

(defn- field->clickhouse-column
  [field]
  (let [{:keys [field-name base-type pk?]} field
        ch-type  (if (map? base-type)
                   (:native base-type)
                   (sql.tx/field-base-type->sql-type :clickhouse base-type))
        col-name (quote-name field-name)
        ch-col   (cond
                   (or pk? (disallowed-as-nullable? ch-type) (map? base-type))
                   (format "%s %s" col-name ch-type)

                   (= ch-type "Time")
                   (format "%s Nullable(DateTime64) COMMENT 'time'" col-name)

                   :else (format "%s Nullable(%s)" col-name ch-type))]
    ch-col))

(defn- ->comma-separated-str
  [coll]
  (->> coll
       (interpose ", ")
       (apply str)))

(defmethod sql.tx/create-table-sql :clickhouse
  [_ {:keys [database-name]} {:keys [table-name field-definitions]}]
  (let [table-name     (sql.tx/qualify-and-quote :clickhouse database-name table-name)
        pk-fields      (filter (fn [{:keys [pk?]}] pk?) field-definitions)
        pk-field-names (map #(quote-name (:field-name %)) pk-fields)
        fields         (->> field-definitions
                            (map field->clickhouse-column)
                            (->comma-separated-str))
        order-by       (->comma-separated-str pk-field-names)]
    (format "CREATE TABLE %s (%s)
             ENGINE = MergeTree
             ORDER BY (%s)
             SETTINGS allow_nullable_key=1"
            table-name fields order-by)))

(defmethod execute/execute-sql! :clickhouse [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod load-data/row-xform :clickhouse [_driver _dbdef tabledef]
  (load-data/maybe-add-ids-xform tabledef))

(defmethod sql.tx/pk-sql-type :clickhouse [_] "Int32")

(defmethod sql.tx/add-fk-sql :clickhouse [& _] nil)

(defmethod sql.tx/session-schema :clickhouse [_] "default")

(defn rows-without-index
  "Remove the Metabase index which is the first column in the result set"
  [query-result]
  (map #(drop 1 %) (mt/rows query-result)))

(defn exec-statements
  ([statements details-map]
   (exec-statements statements details-map nil))
  ([statements details-map clickhouse-settings]
   (sql-jdbc.execute/do-with-connection-with-options
    :clickhouse
    (sql-jdbc.conn/connection-details->spec :clickhouse (merge {:engine :clickhouse} details-map))
    {:write? true}
    (fn [^java.sql.Connection conn]
      (doseq [statement statements]
        ;; (println "Executing:" statement)
        (let [^com.clickhouse.jdbc.ConnectionImpl clickhouse-conn (.unwrap conn com.clickhouse.jdbc.ConnectionImpl)
              query-settings  (new com.clickhouse.client.api.query.QuerySettings)]
          (with-open [jdbcStmt (.createStatement conn)]
            (when clickhouse-settings
              (doseq [[k v] clickhouse-settings] (.setOption query-settings k v)))
            (.setDefaultQuerySettings clickhouse-conn query-settings)
            (.execute jdbcStmt statement))))))))

(defmethod tx/dataset-already-loaded? :clickhouse
  [driver dbdef]
  (let [tabledef       (first (:table-definitions dbdef))
        db-name        (ddl.i/format-name :clickhouse (:database-name dbdef))
        table-name     (ddl.i/format-name :clickhouse (:table-name tabledef))
        details        (tx/dbdef->connection-details :clickhouse :db {:database-name db-name})]
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
