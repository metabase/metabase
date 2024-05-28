(ns metabase.test.data.postgres
  "Postgres driver test extensions."
  (:require
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util.honey-sql-2 :as h2x]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :postgres)

(defmethod tx/sorts-nil-first? :postgres [_ _] false)

(defmethod sql.tx/pk-sql-type :postgres [_] "SERIAL")

(defmethod tx/aggregate-column-info :postgres
  ([driver ag-type]
   ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (= ag-type :sum)
      {:base_type :type/BigInteger}))))

(doseq [[base-type db-type] {:type/BigInteger     "BIGINT"
                             :type/Boolean        "BOOL"
                             :type/Date           "DATE"
                             :type/DateTime       "TIMESTAMP"
                             :type/DateTimeWithTZ "TIMESTAMP WITH TIME ZONE"
                             :type/Decimal        "DECIMAL"
                             :type/Float          "FLOAT"
                             :type/Integer        "INTEGER"
                             :type/IPAddress      "INET"
                             :type/JSON           "JSON"
                             :type/Text           "TEXT"
                             :type/Time           "TIME"
                             :type/TimeWithTZ     "TIME WITH TIME ZONE"
                             :type/UUID           "UUID"}]
  (defmethod sql.tx/field-base-type->sql-type [:postgres base-type] [_ _] db-type))

(defmethod tx/dbdef->connection-details :postgres
  [_ context {:keys [database-name]}]
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

(defmethod ddl/drop-db-ddl-statements :postgres
  [driver {:keys [database-name], :as dbdef} & options]
  (when-not (string? database-name)
    (throw (ex-info (format "Expected String database name; got ^%s %s"
                            (some-> database-name class .getCanonicalName) (pr-str database-name))
                    {:driver driver, :dbdef dbdef})))
  ;; add an additional statement to the front to kill open connections to the DB before dropping
  (cons
   (kill-connections-to-db-sql database-name)
   (apply (get-method ddl/drop-db-ddl-statements :sql-jdbc/test-extensions) driver dbdef options)))

(defn cast-json-columns
  "For each `:type/JSON` column, parse them with cheshire so they enter as json and not text."
  [tabledef]
  (if (some (comp #{:type/JSON} :base-type) (:field-definitions tabledef))
    (let [parse-fns (map #(if (= % :type/JSON)
                            (fn [json]
                              [::sql.qp/compiled (h2x/cast "json" json)])
                            identity)
                         (map :base-type (:field-definitions tabledef)))]
      (update tabledef :rows (fn [rows]
                               (map (fn [row]
                                      (map (fn [parser value] (parser value))
                                           parse-fns row))
                                    rows))))
    tabledef))

(defmethod load-data/load-data! :postgres [driver dbdef tabledef]
  (load-data/load-data-all-at-once! driver dbdef (cast-json-columns tabledef)))

(defmethod sql.tx/standalone-column-comment-sql :postgres [& args]
  (apply sql.tx/standard-standalone-column-comment-sql args))

(defmethod sql.tx/standalone-table-comment-sql :postgres [& args]
  (apply sql.tx/standard-standalone-table-comment-sql args))

(defmethod sql.tx/session-schema :postgres [_driver] "public")
