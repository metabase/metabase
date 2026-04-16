(ns metabase.app-db.schema-migrations-test.impl
  "Tests for the schema migrations defined in the Liquibase YAML files. The basic idea is:

  1. Create a temporary H2/Postgres/MySQL/MariaDB database
  2. Run all migrations up to a certain point
  3. Load some arbitrary data
  4. run migration(s) after that point (verify that they actually run)
  5. verify that data looks like what we'd expect after running migration(s)

  Actual tests using this code live in [[metabase.app-db.schema-migrations-test]]."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.custom-migrations.util :as custom-migrations.util]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.test-util :as mdb.test-util]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test.data.datasets :as datasets]
   [metabase.test.data.interface :as tx]
   [metabase.test.initialize :as initialize]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (liquibase LabelExpression)
   (liquibase.changelog ChangeLogHistoryServiceFactory ChangeSet)
   (liquibase.changelog.filter ChangeSetFilter ChangeSetFilterResult)))

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
       (binding [mdb.connection/*application-db* (mdb.connection/application-db driver data-source)
                 custom-migrations.util/*allow-temp-scheduling* false]
         (f conn))))))

(defmacro with-temp-empty-app-db
  "Create a new temporary application DB of `db-type` and execute `body` with `conn-binding` bound to a
  [[java.sql.Connection]] to the database. [[toucan.db/*db-connection*]] is also bound, which means Toucan functions
  like `select` or `update!` will operate against this database.

  Made public as of x.41."
  [[conn-binding db-type] & body]
  `(do-with-temp-empty-app-db ~db-type (fn [~(vary-meta conn-binding assoc :tag 'java.sql.Connection)] ~@body)))

(defn- range-description [start-id end-id {:keys [inclusive-start? inclusive-end?]
                                           :or   {inclusive-start? true inclusive-end? true}}]
  (let [inclusive-exclusive #(if % "inclusive" "exclusive")]
    (if end-id
      (format "between %s (%s) and %s (%s)"
              start-id (inclusive-exclusive inclusive-start?)
              end-id (inclusive-exclusive inclusive-end?))
      (format "from %s (%s) until the end" start-id (inclusive-exclusive inclusive-start?)))))

(defn run-migrations-in-range!
  "Run Liquibase migrations from our migrations YAML file in the range of `start-id` -> `end-id` (inclusive) against a
  DB with `jdbc-spec`.

  Range comparison uses the actual changelog order (index-based), so all ID formats — including hex-style IDs like
  `v60.f8c3be` — are handled correctly without numeric conversion."
  {:added "0.41.0", :arglists '([conn [start-id end-id]]
                                [conn [start-id end-id] {:keys [inclusive-start? inclusive-end?]
                                                         :or {inclusive-start? true
                                                              inclusive-end? true}}])}
  [^java.sql.Connection conn [start-id end-id] & [range-options]]
  (log/debugf "Finding and running migrations %s" (range-description start-id end-id range-options))

  (liquibase/with-liquibase [liquibase conn]
    (let [database   (.getDatabase liquibase)
          id->index  (into {} (map-indexed (fn [i ^ChangeSet cs] [(.getId cs) i])
                                           (.getChangeSets (.getDatabaseChangeLog liquibase))))
          resolve-id (fn [id]
                       (or (id->index id)
                           (throw (ex-info (format "Migration ID not found in changelog: %s" id) {:id id}))))
          {:keys [inclusive-start? inclusive-end?]
           :or   {inclusive-start? true inclusive-end? true}} range-options
          start-idx  (resolve-id start-id)
          end-idx    (when end-id (resolve-id end-id))
          change-set-filters [(reify ChangeSetFilter
                                (accepts [this change-set]
                                  (let [id      (.getId ^ChangeSet change-set)
                                        idx     (id->index id)
                                        accept? (boolean
                                                 (and (some? idx)
                                                      (if inclusive-start?
                                                        (<= start-idx idx)
                                                        (< start-idx idx))
                                                      (if end-idx
                                                        (if inclusive-end?
                                                          (<= idx end-idx)
                                                          (< idx end-idx))
                                                        true)))]
                                    (log/tracef "Migration %s in range [%s ↔ %s] %s ? => %s"
                                                id start-id end-id
                                                (if inclusive-end? "(inclusive)" "(exclusive)")
                                                accept?)
                                    (ChangeSetFilterResult. accept? "decision according to range" (class this)))))]
          change-log-service (.getChangeLogService (ChangeLogHistoryServiceFactory/getInstance) database)]
      (liquibase/with-scope-locked liquibase
       ;; Calling .listUnrunChangeSets has the side effect of creating the Liquibase tables
       ;; and initializing checksums so that they match the ones generated in production.
        (.listUnrunChangeSets liquibase nil (LabelExpression.))
        (.generateDeploymentId change-log-service)
        (liquibase/update-with-change-log liquibase {:change-set-filters change-set-filters})))))

(defn test-migrations-for-driver! [driver [start-id end-id] f]
  (log/debug (u/format-color 'yellow "Testing migrations for driver %s..." driver))
  (with-temp-empty-app-db [conn driver]
    ;; sanity check: make sure the DB is actually empty
    (let [metadata  (.getMetaData conn)
          schema    (when (= :h2 driver) "PUBLIC")]
      (with-open [rs (.getTables metadata nil schema "%" (into-array String ["TABLE"]))]
        (let [tables (jdbc/result-set-seq rs)]
          (assert (zero? (count tables))
                  (str "'Empty' application DB is not actually empty. Found tables:\n"
                       (u/pprint-to-str tables))))))
    (log/debugf "Finding and running migrations before %s..." start-id)
    (run-migrations-in-range! conn ["v00.00-000" start-id] {:inclusive-end? false})
    (let [restart-id (atom nil)]
      (letfn [(migrate
                ([]
                 (migrate :up nil))
                ([direction]
                 (migrate direction nil))

                ([direction version]
                 (case direction
                   :up
                   ;; If we have rolled back earlier migrations, it's no longer safe to resume from start-id.
                   (if-let [start-after @restart-id]
                     (run-migrations-in-range! conn [start-after end-id] {:inclusive-start? false})
                     (run-migrations-in-range! conn [start-id end-id]))

                   :down
                   (do
                     (assert (int? version), "Downgrade requires a version")
                     (mdb/migrate! (mdb/data-source) :down version)
                     ;; We may have rolled back migrations prior to start-id, so its no longer safe to start from there.
                     (reset! restart-id (t2/select-one-pk (liquibase/changelog-table-name conn)
                                                          {:order-by [[:orderexecuted :desc]]}))))))]
        (f migrate))))
  (log/debug (u/format-color 'green "Done testing migrations for driver %s." driver)))

(defn do-test-migrations!
  [migration-range f]
  ;; make sure the normal Metabase application DB is set up before running the tests so things don't get confused and
  ;; try to initialize it while the mock DB is bound
  (initialize/initialize-if-needed! :db)
  (let [[start-id end-id] (if (sequential? migration-range)
                            migration-range
                            [migration-range migration-range])]
    (testing (format "Migrations %s thru %s" start-id (or end-id "end"))
      (datasets/test-drivers #{:h2 :mysql :postgres}
        (test-migrations-for-driver! driver/*driver* [start-id end-id] f)))))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
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
    (test-migrations [\"v45.00-001\" \"v45.00-005\"] [migrate!]
      ;; (Migrations before v45.00-001 are ran automatically before body is invoked)
      ;; 1. Load data
      (create-some-users!)
      ;; 2. Run migrations v45.00-001 through v45.00-005
      (migrate!)
      ;; 3. Do some test assertions
      (is (= ...)))

  For convenience `migration-range` can be either a range of migrations IDs to test (e.g. `[100 105]`) or just a
  single migration ID (e.g. `100`). A single ID in a vector (e.g. `[100]`) is treated as the start of an open-ended
  range.

  These run against the current set of test `DRIVERS` (by default H2), so if you want to run against more than H2
  either set the `DRIVERS` env var or use [[mt/set-test-drivers!]] from the REPL."
  {:style/indent 2}
  [migration-range [migrate!-binding] & body]
  `(do-test-migrations!
    ~migration-range
    (fn [~migrate!-binding]
      ~@body)))

;;; ------------------------------------------------ Range filter tests ------------------------------------------------

(defn- migrations-run
  "Return the set of migration IDs that have been executed against `conn`."
  [^java.sql.Connection conn]
  (let [table-name (liquibase/changelog-table-name conn)]
    (into #{} (map :id) (jdbc/query {:connection conn} [(format "SELECT id FROM %s" table-name)]))))

(deftest run-migrations-in-range!-boundary-test
  (testing "inclusive start + inclusive end (defaults)"
    (with-temp-empty-app-db [conn :h2]
      (run-migrations-in-range! conn ["v00.00-000" "v45.00-002"])
      (let [ran (migrations-run conn)]
        (is (contains? ran "v00.00-000") "start should be included (inclusive)")
        (is (contains? ran "v45.00-002") "end should be included (inclusive)"))))

  (testing "single-item range (start == end)"
    (with-temp-empty-app-db [conn :h2]
      (run-migrations-in-range! conn ["v45.00-001" "v45.00-001"])
      (let [ran (migrations-run conn)]
        (is (contains? ran "v45.00-001") "the single migration should be included")
        (is (not (contains? ran "v45.00-002")) "the next migration should NOT be included"))))

  (testing "exclusive end excludes the endpoint"
    (with-temp-empty-app-db [conn :h2]
      ;; Run v00.00-000 through v45.00-002 with exclusive end — v45.00-002 should NOT be run
      (run-migrations-in-range! conn ["v00.00-000" "v45.00-002"] {:inclusive-end? false})
      (let [ran (migrations-run conn)]
        (is (contains? ran "v00.00-000") "start should be included (inclusive by default)")
        (is (not (contains? ran "v45.00-002")) "end should be excluded (exclusive)")
        (is (contains? ran "v45.00-001") "migration before end should be included"))))

  (testing "exclusive start excludes the start point"
    (with-temp-empty-app-db [conn :h2]
      ;; First run all migrations up through v45.00-001 so the DB has the required schema
      (run-migrations-in-range! conn ["v00.00-000" "v45.00-001"])
      (let [ran-before (migrations-run conn)]
        ;; Now run from v45.00-001 exclusive to v45.00-011 inclusive
        (run-migrations-in-range! conn ["v45.00-001" "v45.00-011"] {:inclusive-start? false})
        (let [ran-after  (migrations-run conn)
              newly-ran  (set/difference ran-after ran-before)]
          (is (not (contains? newly-ran "v45.00-001")) "v45.00-001 should NOT be re-run (exclusive start)")
          (is (contains? newly-ran "v45.00-002") "v45.00-002 should be included (between exclusive start and end)")
          (is (contains? newly-ran "v45.00-011") "end should be included (inclusive by default)")))))

  (testing "unknown start-id throws"
    (with-temp-empty-app-db [conn :h2]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Migration ID not found in changelog"
                            (run-migrations-in-range! conn ["v99.bogus-999" "v45.00-002"])))))

  (testing "unknown end-id throws"
    (with-temp-empty-app-db [conn :h2]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Migration ID not found in changelog"
                            (run-migrations-in-range! conn ["v00.00-000" "v99.bogus-999"]))))))
