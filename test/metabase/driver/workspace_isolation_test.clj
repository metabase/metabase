(ns metabase.driver.workspace-isolation-test
  "Driver-agnostic tests for workspace database isolation. For any driver that
   supports the `:workspace` feature, exercises the full provisioning lifecycle
   (`init-workspace-isolation!` → `grant-workspace-read-access!` →
   `destroy-workspace-isolation!`) against a real warehouse and asserts that the
   workspace user has *exactly* the privileges the design promises:

   - Can SELECT from input tables it has been granted access to.
   - Cannot INSERT/UPDATE/DELETE or run DDL against the input schema.
   - Can SELECT, INSERT, UPDATE, DELETE, and run DDL against its own output
     schema.

   Cross-driver counterpart to the postgres-only
   `workspace-user-cannot-write-to-input-schema-test`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(set! *warn-on-reflection* true)

(defn- find-sql-exception
  "Walk the cause chain until we find a `java.sql.SQLException`, or nil."
  [^Throwable t]
  (loop [t t]
    (cond
      (nil? t)                            nil
      (instance? java.sql.SQLException t) t
      :else                               (recur (.getCause t)))))

(defn- input-schema
  "Schema name to pass to `grant-workspace-read-access!` for the source table.
   Drivers with the `:schemas` feature use the conventional default schema
   (`public`); schema-less drivers like MySQL use the source database name —
   matching the `:schema`-as-database convention that
   `grant-workspace-read-access! :mysql` itself relies on."
  [driver details]
  (if (driver.u/supports? driver :schemas nil)
    "public"
    (:db details)))

(defn- qualify
  "Fully-qualify a table name as `schema.table` for drivers with schemas, or
   `database.table` for schema-less drivers like MySQL (the source database is
   `schema` for those drivers — see [[input-schema]])."
  [_driver schema table]
  (str schema "." table))

(defn- expect-write-denied!
  [user-spec sql label]
  (testing (format "%s on input schema is denied" label)
    (try
      (jdbc/execute! user-spec [sql])
      (is false (format "%s unexpectedly succeeded" label))
      (catch Throwable t
        (let [sqle (find-sql-exception t)]
          (is (some? sqle)
              (format "expected SQLException for %s; got %s" label (class t))))))))

(deftest ^:synchronized workspace-isolation-perms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (testing "workspace user gets read-only access to input schema, full access to output schema"
      (let [driver   driver/*driver*
            db-name  "ws_isolation_perms_test"]
        (tx/drop-if-exists-and-create-db! driver db-name)
        (let [details      (mt/dbdef->connection-details driver :db {:database-name db-name})
              admin-spec   (sql-jdbc.conn/connection-details->spec driver details)
              in-schema    (input-schema driver details)
              src          (qualify driver in-schema "src")]
          (jdbc/execute! admin-spec [(str "CREATE TABLE " src " (id INT, v VARCHAR(8))")])
          (jdbc/execute! admin-spec [(str "INSERT INTO " src " VALUES (1, 'a')")])
          (mt/with-temp [:model/Database database {:engine  driver
                                                   :details details}]
            (let [workspace       {:id 8675309 :name "wsd-permstest-8675309"}
                  init-result     (driver/init-workspace-isolation! driver database workspace)
                  ws-with-details (merge workspace init-result)
                  user-details    (merge details (:database_details ws-with-details))
                  user-spec       (sql-jdbc.conn/connection-details->spec driver user-details)
                  out-schema      (:schema ws-with-details)
                  out             (qualify driver out-schema "out")]
              (try
                (driver/grant-workspace-read-access! driver database ws-with-details
                                                     [{:schema in-schema :name "src"}])
                (testing "workspace user can SELECT from a granted input table"
                  (is (= [{:id 1 :v "a"}]
                         (jdbc/query user-spec [(str "SELECT id, v FROM " src " ORDER BY id")]))))
                (testing "workspace user cannot write to or DDL against the input schema"
                  (doseq [[label sql] [[:insert       (str "INSERT INTO " src " VALUES (2, 'b')")]
                                       [:update       (str "UPDATE " src " SET v = 'x'")]
                                       [:delete       (str "DELETE FROM " src)]
                                       [:create-table (str "CREATE TABLE "
                                                           (qualify driver in-schema "sneaky")
                                                           " (id INT)")]
                                       [:drop-table   (str "DROP TABLE " src)]]]
                    (expect-write-denied! user-spec sql label)))
                (testing "workspace user has full read+write access to its own output schema"
                  (jdbc/execute! user-spec [(str "CREATE TABLE " out " (id INT, v VARCHAR(8))")])
                  (jdbc/execute! user-spec [(str "INSERT INTO " out " VALUES (1, 'a')")])
                  (is (= [{:id 1 :v "a"}]
                         (jdbc/query user-spec [(str "SELECT id, v FROM " out)])))
                  (jdbc/execute! user-spec [(str "UPDATE " out " SET v = 'b'")])
                  (is (= [{:id 1 :v "b"}]
                         (jdbc/query user-spec [(str "SELECT id, v FROM " out)])))
                  (jdbc/execute! user-spec [(str "DELETE FROM " out)])
                  (is (empty? (jdbc/query user-spec [(str "SELECT id, v FROM " out)])))
                  (jdbc/execute! user-spec [(str "DROP TABLE " out)]))
                (finally
                  (driver/destroy-workspace-isolation! driver database ws-with-details))))))))))
