(ns metabase.db.schema-migrations-test.impl
  "Tests for the schema migrations defined in the Liquibase YAML files. The basic idea is:

  1. Create a temporary H2/Postgres/MySQL/MariaDB database
  2. Run all migrations up to a certain point
  3. Load some arbitrary data
  4. run migration(s) after that point (verify that they actually run)
  5. verify that data looks like what we'd expect after running migration(s)

  Actual tests using this code live in `metabase.db.schema-migrations-test`."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [clojure.tools.logging :as log]
            [metabase.db :as mdb]
            [metabase.db.liquibase :as liquibase]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.test.initialize :as initialize]
            [metabase.util :as u]
            [toucan.db :as db])
  (:import [liquibase Contexts Liquibase]
           [liquibase.changelog ChangeSet DatabaseChangeLog]))

(defmulti ^:private do-with-temp-empty-app-db*
  "Create a new completely empty app DB for `driver`, then call `(f jdbc-spec)` with a spec for that DB. Should clean up
  before and after running `f` as needed."
  {:arglists '([driver f])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod do-with-temp-empty-app-db* :default
  [driver f]
  (log/debugf "Creating empty %s app db..." driver)
  (let [dbdef {:database-name     "schema-migrations-test-db"
               :table-definitions []}]
    (try
      (tx/create-db! driver dbdef)
      (let [connection-details (tx/dbdef->connection-details driver :db dbdef)
            jdbc-spec          (sql-jdbc.conn/connection-details->spec driver connection-details)]
        (f jdbc-spec))
      (finally
        (log/debugf "Destroying empty %s app db..." driver)
        (tx/destroy-db! driver dbdef)))))

(defmethod do-with-temp-empty-app-db* :h2
  [driver f]
  (log/debug "Creating empty H2 app db...")
  ;; we don't need to destroy this DB manually because it will just get shutdown immediately when the Connection
  ;; closes because we're not setting a `DB_CLOSE_DELAY`
  ;;
  ;; don't use the usual implementation of `tx/dbdef->connection-details` because it creates a spec that only connects
  ;; to with `USER=GUEST` which doesn't let us run DDL statements
  (let [jdbc-spec {:subprotocol "h2", :subname "mem:schema-migrations-test-db", :classname "org.h2.Driver"}]
    (f jdbc-spec)))

(defn- do-with-temp-empty-app-db [driver f]
  (do-with-temp-empty-app-db*
   driver
   (fn [jdbc-spec]
     (with-open [conn (jdbc/get-connection jdbc-spec)]
       (binding [toucan.db/*db-connection* {:connection conn}
                 toucan.db/*quoting-style* (mdb/quoting-style driver)]
         (f conn))))))

(defmacro ^:private with-temp-empty-app-db
  "Create a new temporary application DB of `db-type` and execute `body` with `conn-binding` bound to a
  `java.sql.Connection` to the database. Toucan `*db-connection*` is also bound, which means Toucan functions like
  `select` or `update!` will operate against this database."
  [[conn-binding db-type] & body]
  `(do-with-temp-empty-app-db ~db-type (fn [~(vary-meta conn-binding assoc :tag 'java.sql.Connection)] ~@body)))

(defn- run-migrations-in-range!
  "Run Liquibase migrations from our migrations YAML file in the range of `start-id` -> `end-id` (inclusive) against a
  DB with `jdbc-spec`."
  [^java.sql.Connection conn [start-id end-id]]
  (liquibase/with-liquibase [liquibase conn]
    (let [change-log        (.getDatabaseChangeLog liquibase)
          ;; create a new change log that only has the subset of migrations we want to run.
          subset-change-log (doto (DatabaseChangeLog.)
                              ;; we don't actually use this for anything but if we don't set it then Liquibase barfs
                              (.setPhysicalFilePath (.getPhysicalFilePath change-log)))]
      ;; add the relevant migrations (change sets) to our subset change log
      (doseq [^ChangeSet change-set (.getChangeSets change-log)
              :let                  [id (Integer/parseUnsignedInt (.getId change-set))]
              :when                 (<= start-id id end-id)]
        (.addChangeSet subset-change-log change-set))
      ;; now create a new instance of Liquibase that will run just the subset change log
      (let [subset-liquibase (Liquibase. subset-change-log (.getResourceAccessor liquibase) (.getDatabase liquibase))]
        (when-let [unrun (not-empty (.listUnrunChangeSets subset-liquibase nil))]
          (log/debugf "Running migrations %s...%s (inclusive)"
                      (.getId ^ChangeSet (first unrun)) (.getId ^ChangeSet (last unrun))))
        ;; run the migrations
        (.update subset-liquibase (Contexts.))))))

(defn- test-migrations-for-driver [driver [start-id end-id] f]
  (log/debug (u/format-color 'yellow "Testing migrations for driver %s..." driver))
  (with-temp-empty-app-db [conn driver]
    ;; sanity check: make sure the DB is actually empty
    (let [metadata (.getMetaData conn)]
      (with-open [rs (.getTables metadata nil nil "%" (into-array String ["TABLE"]))]
        (let [tables (jdbc/result-set-seq rs)]
          (assert (zero? (count tables))
                  (str "'Empty' application DB is not actually empty. Found tables:\n"
                       (u/pprint-to-str tables))))))
    (run-migrations-in-range! conn [1 (dec start-id)])
    (f #(run-migrations-in-range! conn [start-id end-id])))
  (log/debug (u/format-color 'green "Done testing migrations for driver %s." driver)))

(defn test-migrations*
  [migration-range f]
  ;; make sure the normal Metabase application DB is set up before running the tests so things don't get confused and
  ;; try to initialize it while the mock DB is bound
  (initialize/initialize-if-needed! :db)
  (let [[start-id end-id] (if (sequential? migration-range)
                            migration-range
                            [migration-range migration-range])]
    (testing (format "Migrations %d-%d" start-id end-id)
      (mt/test-drivers #{:h2 :mysql :postgres}
        (test-migrations-for-driver driver/*driver* [start-id end-id] f)))))

(defmacro test-migrations
  "Util macro for running tests for a set of Liquibase schema migration(s).

  Before invoking body, migrations up to `start-id` are automatically ran. In body, you should do the following in
  this order:

  1. Load data and check any preconditions before running migrations you're testing. Prefer `toucan.db/simple-insert!`
     or plain SQL for loading data to avoid dependencies on the current state of the schema that may be present in
     Toucan `pre-insert` functions and the like.

  2. Call `(migrate!)` to run migrations in range of `start-id` -> `end-id` (inclusive)

  3. Check any postconditions after running the migrations.

  e.g.

    ;; example test for migrations 100-105
    (test-migrations [100 105] [migrate!]
      ;; (Migrations 1-99 are ran automatically before body is invoked)
      ;; 1. Load data
      (create-some-users!)
      ;; 2. Run migrations 100-105
      (migrate!)
      ;; 3. Do some test assertions
      (is (= ...)))

  For convenience `migration-range` can be either a range of migrations IDs to test (e.g. `[100 105]`) or just a
  single migration ID (e.g. `100`).

  These run against the current set of test `DRIVERS` (by default H2), so if you want to run against more than H2
  either set the `DRIVERS` env var or use `mt/set-test-drivers!` from the REPL."
  {:style/indent 2}
  [migration-range [migrate!-binding] & body]
  `(test-migrations*
    ~migration-range
    (fn [~migrate!-binding]
      ~@body)))
