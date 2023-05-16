(ns metabase.db.schema-migrations-test.impl
  "Tests for the schema migrations defined in the Liquibase YAML files. The basic idea is:

  1. Create a temporary H2/Postgres/MySQL/MariaDB database
  2. Run all migrations up to a certain point
  3. Load some arbitrary data
  4. run migration(s) after that point (verify that they actually run)
  5. verify that data looks like what we'd expect after running migration(s)

  Actual tests using this code live in `metabase.db.schema-migrations-test`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.data-source :as mdb.data-source]
   [metabase.db.liquibase :as liquibase]
   [metabase.db.test-util :as mdb.test-util]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test.data.datasets :as datasets]
   [metabase.test.data.interface :as tx]
   [metabase.test.initialize :as initialize]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (liquibase Contexts Liquibase)
   (liquibase.changelog ChangeSet DatabaseChangeLog)))

(set! *warn-on-reflection* true)

(defmulti do-with-temp-empty-app-db*
  "Create a new completely empty app DB for `driver`, then call `(f jdbc-spec)` with a spec for that DB. Should clean up
  before and after running `f` as needed."
  {:added "0.41.0", :arglists '([driver f])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn- random-schema-migrations-test-db-name []
  (format "schema-migrations-test-db-%05d" (rand-int 100000)))

(defmethod do-with-temp-empty-app-db* :default
  [driver f]
  (log/debugf "Creating empty %s app db..." driver)
  (let [dbdef {:database-name     (random-schema-migrations-test-db-name)
               :table-definitions []}]
    (try
      (tx/create-db! driver dbdef)
      (let [connection-details (tx/dbdef->connection-details driver :db dbdef)
            jdbc-spec          (sql-jdbc.conn/connection-details->spec driver connection-details)]
        (f (mdb.test-util/->ClojureJDBCSpecDataSource jdbc-spec)))
      (finally
        (log/debugf "Destroying empty %s app db..." driver)
        (tx/destroy-db! driver dbdef)))))

(defmethod do-with-temp-empty-app-db* :h2
  [_driver f]
  (log/debug "Creating empty H2 app db...")
  ;; we don't need to destroy this DB manually because it will just get shutdown immediately when the Connection closes
  ;; because we're not setting a `DB_CLOSE_DELAY`
  (let [data-source (mdb.data-source/raw-connection-string->DataSource (str "jdbc:h2:mem:" (random-schema-migrations-test-db-name)))]
    (f data-source)))

(defn do-with-temp-empty-app-db
  "The function invoked by [[with-temp-empty-app-db]] to execute function `f` in a temporary, empty app DB. Use the
  macro instead: [[with-temp-empty-app-db]]."
  {:added "0.41.0"}
  [driver f]
  (do-with-temp-empty-app-db*
   driver
   (fn [^javax.sql.DataSource data-source]
     ;; it should be ok to open multiple connections to this `data-source`; it should stay open as long as `conn` is
     ;; open
     (with-open [conn (.getConnection data-source)]
       (binding [mdb.connection/*application-db* (mdb.connection/application-db driver data-source)]
         (f conn))))))

(defmacro with-temp-empty-app-db
  "Create a new temporary application DB of `db-type` and execute `body` with `conn-binding` bound to a
  [[java.sql.Connection]] to the database. [[toucan.db/*db-connection*]] is also bound, which means Toucan functions
  like `select` or `update!` will operate against this database.

  Made public as of x.41."
  [[conn-binding db-type] & body]
  `(do-with-temp-empty-app-db ~db-type (fn [~(vary-meta conn-binding assoc :tag 'java.sql.Connection)] ~@body)))

(defn- migration->number [id]
  (if (integer? id)
    id
    (or (when-let [[_ major-version minor-version migration-num] (re-matches #"^v(\d+)\.(\d+)-(\d+)$" id)]
          (+ (* (Integer/parseUnsignedInt major-version) 100)
             (Integer/parseUnsignedInt minor-version)
             (/ (Integer/parseUnsignedInt migration-num)
                1000.0)))
        (when (re-matches #"^\d+$" id)
          (Integer/parseUnsignedInt id))
        (throw (ex-info (format "Invalid migration ID: %s" id) {:id id})))))

(deftest migration->number-test
  (is (= 356
         (migration->number 356)
         (migration->number "356")))
  (is (= 4301.009
         (migration->number "v43.01-009")))
  (is (= 4301.01
         (migration->number "v43.01-010"))))

(defn- migration-id-in-range?
  "Whether `id` should be considered to be between `start-id` and `end-id`, inclusive. Handles both legacy plain-integer
  and new-style `vMM.mm-NNN` style IDs."
  [start-id id end-id & [{:keys [inclusive-end?]
                          :or   {inclusive-end? true}}]]

  (let [start (migration->number start-id)
        id    (migration->number id)
        ;; end-id can be nil (meaning, unbounded)
        end   (if end-id
                (migration->number end-id)
                Integer/MAX_VALUE)]
    (and
     (<= start id)
     (if inclusive-end?
       (<= id end)
       (< id end)))))

(deftest migration-id-in-range?-test
  (testing "legacy IDs"
    (is (migration-id-in-range? 1 2 3))
    (is (migration-id-in-range? 1 2 3 {:inclusive-end? false}))
    (is (migration-id-in-range? 1 1 3))
    (is (migration-id-in-range? 1 3 3))
    (is (migration-id-in-range? 100 100 nil))
    (is (not (migration-id-in-range? 1 3 3 {:inclusive-end? false})))
    (is (not (migration-id-in-range? 2 1 3)))
    (is (not (migration-id-in-range? 2 4 3)))
    (testing "strings"
      (is (migration-id-in-range? 1 "1" 3))
      (is (not (migration-id-in-range? 1 "13" 3)))))
  (testing "new-style IDs"
    (is (migration-id-in-range? "v42.00-001" "v42.00-002" "v42.00-003"))
    (is (migration-id-in-range? "v42.00-001" "v42.00-002" "v42.00-002"))
    (is (not (migration-id-in-range? "v42.00-001" "v42.00-002" "v42.00-002" {:inclusive-end? false})))
    (is (not (migration-id-in-range? "v42.00-001" "v42.00-004" "v42.00-003")))
    (is (not (migration-id-in-range? "v42.00-002" "v42.00-001" "v42.00-003")))
    ;; this case is invoked when the test-migrations macro is only given one item in the range list
    (is (migration-id-in-range? "v42.00-064" "v42.00-064" nil)))
  (testing "mixed"
    (is (migration-id-in-range? 1 3 "v42.00-001"))
    (is (migration-id-in-range? 1 "v42.00-001" "v42.00-002"))
    (is (not (migration-id-in-range? "v42.00-002" 1000 "v42.00-003")))
    (is (not (migration-id-in-range? "v42.00-002" 1000 "v42.00-003" {:inclusive-end? false})))
    (is (not (migration-id-in-range? 1 "v42.00-001" 1000)))
    (is (not (migration-id-in-range? 1 "v42.00-001" 1000)))
    (is (migration-id-in-range? 1 "v42.00-000" "v43.00-000"))
    (is (migration-id-in-range? 1 "v42.00-001" "v43.00-000"))
    (is (migration-id-in-range? 1 "v42.00-000" "v43.00-014"))
    (is (migration-id-in-range? 1 "v42.00-015" "v43.00-014"))
    (is (not (migration-id-in-range? 1 "v43.00-014" "v42.00-015")))))

(defn run-migrations-in-range!
  "Run Liquibase migrations from our migrations YAML file in the range of `start-id` -> `end-id` (inclusive) against a
  DB with `jdbc-spec`."
  {:added "0.41.0", :arglists '([conn [start-id end-id]]
                                [conn [start-id end-id] {:keys [inclusive-end?], :or {inclusive-end? true}}])}
  [^java.sql.Connection conn [start-id end-id] & [range-options]]
  (liquibase/with-liquibase [liquibase conn]
    (let [change-log        (.getDatabaseChangeLog liquibase)
          ;; create a new change log that only has the subset of migrations we want to run.
          subset-change-log (doto (DatabaseChangeLog.)
                              ;; we don't actually use this for anything but if we don't set it then Liquibase barfs
                              (.setPhysicalFilePath (.getPhysicalFilePath change-log)))]
      ;; add the relevant migrations (change sets) to our subset change log
      (doseq [^ChangeSet change-set (.getChangeSets change-log)
              :let                  [id (.getId change-set)
                                     _ (log/tracef "Migration %s in range [%s ↔ %s] %s ? => %s"
                                                   id start-id end-id
                                                   (if (:inclusive-end? range-options) "(inclusive)" "(exclusive)")
                                                   (migration-id-in-range? start-id id end-id range-options))]
              :when                 (migration-id-in-range? start-id id end-id range-options)]
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
    (let [metadata (.getMetaData conn)
          schema (when (= :h2 driver) "PUBLIC")]
      (with-open [rs (.getTables metadata nil schema "%" (into-array String ["TABLE"]))]
        (let [tables (jdbc/result-set-seq rs)]
          (assert (zero? (count tables))
                  (str "'Empty' application DB is not actually empty. Found tables:\n"
                       (u/pprint-to-str tables))))))
    (log/debugf "Finding and running migrations before %s..." start-id)
    (run-migrations-in-range! conn [1 start-id] {:inclusive-end? false})
    (f
     (fn migrate! []
       (log/debugf "Finding and running migrations between %s and %s (inclusive)" start-id (or end-id "end"))
       (run-migrations-in-range! conn [start-id end-id]))))
  (log/debug (u/format-color 'green "Done testing migrations for driver %s." driver)))

(defn do-test-migrations
  [migration-range f]
  ;; make sure the normal Metabase application DB is set up before running the tests so things don't get confused and
  ;; try to initialize it while the mock DB is bound
  (initialize/initialize-if-needed! :db)
  (let [[start-id end-id] (if (sequential? migration-range)
                            migration-range
                            [migration-range migration-range])]
    (testing (format "Migrations %s thru %s" start-id (or end-id "end"))
      (datasets/test-drivers #{:h2 :mysql :postgres}
        (test-migrations-for-driver driver/*driver* [start-id end-id] f)))))

(defmacro test-migrations
  "Util macro for running tests for a set of Liquibase schema migration(s).

  Before invoking body, migrations up to `start-id` are automatically ran. In body, you should do the following in
  this order:

  1. Load data and check any preconditions before running migrations you're testing.
     Prefer [[t2/insert!]] with a table name or plain SQL for loading data to avoid dependencies on the current state of
     the schema that may be present in Toucan `pre-insert` functions and the like.

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
  either set the `DRIVERS` env var or use [[mt/set-test-drivers!]] from the REPL."
  {:style/indent 2}
  [migration-range [migrate!-binding] & body]
  `(do-test-migrations
    ~migration-range
    (fn [~migrate!-binding]
      ~@body)))
