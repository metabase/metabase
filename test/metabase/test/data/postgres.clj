(ns metabase.test.data.postgres
  "Postgres driver test extensions."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions]
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
    :port     (tx/db-test-env-var-or-throw :postgresql :port 32794)
    :timezone :America/Los_Angeles}
   (when-let [user (tx/db-test-env-var :postgresql :user "metabase")]
     {:user user})
   (when-let [password (tx/db-test-env-var :postgresql :password "password")]
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

(defmethod load-data/chunk-size :postgres
  [_driver _dbdef _tabledef]
  ;; load data all at once
  nil)

(defn- cast-json-columns-xform
  "[[load-data/row-xform]] for Postgres: for each `:type/JSON` column, parse them with cheshire so they enter as json
  and not text."
  [tabledef]
  (when-let [parse-fns (not-empty
                        (into {}
                              (keep (fn [fielddef]
                                      (when (isa? (:base-type fielddef) :type/JSON)
                                        [(keyword (:field-name fielddef))
                                         (fn [json]
                                           [::sql.qp/compiled (h2x/cast "json" json)])])))
                              (:field-definitions tabledef)))]
    (map (fn [row]
           (reduce
            (fn [row [field-name f]]
              (update row field-name f))
            row
            parse-fns)))))

(defmethod load-data/row-xform :postgres
  ;; For each `:type/JSON` column, parse them with cheshire so they enter as json and not text.
  [_driver _dbdef tabledef]
  (or (cast-json-columns-xform tabledef)
      identity))

(deftest ^:parallel postgres-row-xform-test
  (testing "Make sure the row xform and cast-json-columns-xform above are getting applied as expected"
    (mt/test-driver :postgres
      (let [dbdef    (tx/get-dataset-definition metabase.test.data.dataset-definitions/json)
            tabledef (m/find-first
                      #(= (:table-name %) "json")
                      (:table-definitions dbdef))]
        (is (=? [[{:json_bit (mt/malli=? [:tuple [:= :metabase.driver.sql.query-processor/compiled] :any])}]]
                (into []
                      (map (fn [chunk]
                             (into [] (take 1) chunk)))
                      (#'load-data/reducible-chunks :postgres dbdef tabledef))))))))

(defmethod sql.tx/standalone-column-comment-sql :postgres [& args]
  (apply sql.tx/standard-standalone-column-comment-sql args))

(defmethod sql.tx/standalone-table-comment-sql :postgres [& args]
  (apply sql.tx/standard-standalone-table-comment-sql args))

(defmethod sql.tx/session-schema :postgres [_driver] "public")

(defmethod tx/drop-if-exists-and-create-db! :postgres
  [driver db-name & [just-drop]]
  (let [spec (sql-jdbc.conn/connection-details->spec driver (mt/dbdef->connection-details driver :server nil))]
    ;; kill any open connections
    (jdbc/query spec ["SELECT pg_terminate_backend(pg_stat_activity.pid)
                       FROM pg_stat_activity
                       WHERE pg_stat_activity.datname = ?;" db-name])
    (jdbc/execute! spec [(format "DROP DATABASE IF EXISTS \"%s\"" db-name)]
                   {:transaction? false})
    (when (not= just-drop :just-drop)
      (jdbc/execute! spec [(format "CREATE DATABASE \"%s\";" db-name)]
                     {:transaction? false}))))

(defmethod tx/drop-roles! :postgres
  [driver details roles _user-name]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    (doseq [[role-name table-perms] roles]
      (let [role-name (sql.tx/qualify-and-quote driver role-name)]
        (doseq [[table-name _perms] table-perms]
          (jdbc/execute! spec
                         [(format "ALTER TABLE %s DISABLE ROW LEVEL SECURITY" table-name)]
                         {:transaction? false}))
        (doseq [statement [(format "DROP OWNED BY %s;" role-name)
                           (format "DROP ROLE IF EXISTS %s;" role-name)]]
          (jdbc/execute! spec [statement] {:transaction? false}))))))

(defn grant-table-perms-to-roles!
  [driver details roles]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    (doseq [[role-name table-perms] roles]
      (let [role-name (sql.tx/qualify-and-quote driver role-name)]
        (doseq [[table-name perms] table-perms]
          (let [rls-perms (get perms :rls [true])
                policy-cond (first (binding [driver/*compile-with-inline-parameters* true]
                                     (sql.qp/format-honeysql driver rls-perms)))]
            (doseq [statement [(format "ALTER TABLE %s ENABLE ROW LEVEL SECURITY" table-name)
                               (format "CREATE POLICY role_policy_%s ON %s FOR SELECT TO %s USING %s"
                                       (mt/random-name) table-name role-name policy-cond)]]
              (jdbc/execute! spec [statement] {:transaction? false})))
          (let [columns (:columns perms)
                select-cols (str/join ", " (map #(sql.tx/qualify-and-quote driver %) columns))
                grant-stmt (if (not= select-cols "")
                             (format "GRANT SELECT (%s) ON %s TO %s" select-cols table-name role-name)
                             (format "GRANT SELECT ON %s TO %s" table-name role-name))]
            (jdbc/execute! spec [grant-stmt] {:transaction? false})))))))

(defmethod tx/create-and-grant-roles! :postgres
  [driver details roles user-name _default-role]
  (sql-jdbc.tx/drop-if-exists-and-create-roles! driver details roles)
  (grant-table-perms-to-roles! driver details roles)
  (sql-jdbc.tx/grant-roles-to-user! driver details roles user-name))

(defmethod sql.tx/generated-column-sql :postgres [_ expr]
  (format "GENERATED ALWAYS AS (%s) STORED" expr))
