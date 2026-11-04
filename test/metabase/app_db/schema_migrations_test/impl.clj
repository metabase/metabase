(ns ^:mb/app-db-migrations-test metabase.app-db.schema-migrations-test.impl
  "Tests for the schema migrations defined in the Liquibase YAML files. The basic idea is:

  1. Create a temporary H2/Postgres/MySQL/MariaDB database
  2. Run all migrations up to a certain point
  3. Load some arbitrary data
  4. run migration(s) after that point (verify that they actually run)
  5. verify that data looks like what we'd expect after running migration(s)

  Actual tests using this code live in [[metabase.app-db.schema-migrations-test]]."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.custom-migrations.util :as custom-migrations.util]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.liquibase.versions :as versions]
   [metabase.app-db.test-util :as mdb.test-util]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test.data.datasets :as datasets]
   [metabase.test.data.interface :as tx]
   [metabase.test.initialize :as initialize]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)
   (liquibase LabelExpression)
   (liquibase.changelog  ChangeLogHistoryServiceFactory ChangeSet)
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

(def ^:private timestamp-migration-id-re
  #"^v(\d{2,})\.(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})$")

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
        (when-let [[_ major-version timestamp] (re-matches timestamp-migration-id-re id)]
          (let [unix-timestamp (-> (u.date/parse timestamp)
                                   ^OffsetDateTime (u.date/with-time-zone-same-instant (t/zone-id "UTC"))
                                   .toInstant .getEpochSecond)]
            (parse-double (format "%d.%d" (* (parse-long major-version) 100) unix-timestamp))))
        (throw (ex-info (format "Invalid migration ID: %s" id) {:id id})))))

(deftest migration->number-test
  (is (= 356
         (migration->number 356)
         (migration->number "356")))
  (is (= 4301.009
         (migration->number "v43.01-009")))
  (is (= 4301.01
         (migration->number "v43.01-010")))
  (is (= 4900.16725312
         (migration->number "v49.2023-01-01T00:00:00"))))

(defn- migration-id-in-range?
  "Whether `id` should be considered to be between `start-id` and `end-id`, inclusive. Handles both legacy plain-integer
  and new-style `vMM.mm-NNN` style IDs."
  [start-id id end-id & [{:keys [inclusive-start? inclusive-end?]
                          :or   {inclusive-start? true
                                 inclusive-end? true}}]]

  (let [start (migration->number start-id)
        id    (migration->number id)
        ;; end-id can be nil (meaning, unbounded)
        end   (if end-id
                (migration->number end-id)
                Integer/MAX_VALUE)]
    (and
     (if inclusive-start?
       (<= start id)
       (< start id))
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

(defn- range-description [start-id end-id {:keys [inclusive-start? inclusive-end?]}]
  (let [inclusive-exclusive #(if % "inclusive" "exclusive")]
    (if end-id
      (format "between %s (%s) and %s (%s)"
              start-id (inclusive-exclusive inclusive-start?)
              end-id (inclusive-exclusive inclusive-end?))
      (format "from %s (%s) until the end" start-id (inclusive-exclusive inclusive-start?)))))

(defn- changelog-position
  "The position of `id` in `changesets`, the changelog in order. An id the changelog does not have (some tests name
  changesets that were removed later) sits half a step before the first versioned changeset it sorts before, or after
  the last versioned one, so it is in a range exactly where its changeset used to be. Version-less ids sort by
  position only: they have no number, and come after every versioned changeset."
  [changesets id->index id]
  (or (id->index (str id))
      (let [n        (migration->number id)
            numbered (keep-indexed (fn [i ^ChangeSet cs]
                                     (when-let [m (try (migration->number (.getId cs))
                                                       (catch clojure.lang.ExceptionInfo _ nil))]
                                       [i m]))
                                   changesets)]
        (if-let [[i] (first (filter (fn [[_ m]] (> m n)) numbered))]
          (- i 0.5)
          (+ (or (first (last numbered)) -1) 0.5)))))

(deftest ^:parallel changelog-position-test
  (let [changesets (mapv #(ChangeSet. ^String % "t" false false "f.yaml" nil nil nil)
                         ["v50.2024-01-01T00:00:00" "v50.2024-03-01T00:00:00" "v58.2025-01-01T00:00:00" "q7m2xd" "b4n9wz"])
        id->index  (into {} (map-indexed (fn [i ^ChangeSet cs] [(.getId cs) i]) changesets))
        position   (partial changelog-position changesets id->index)]
    (testing "an id in the changelog is at its own position, version-less ones included"
      (is (= [0 1 2 3 4] (map position ["v50.2024-01-01T00:00:00" "v50.2024-03-01T00:00:00" "v58.2025-01-01T00:00:00"
                                        "q7m2xd" "b4n9wz"]))))
    (testing "an id the changelog no longer has is half a step before the first changeset it sorts before"
      (is (= 0.5 (position "v50.2024-02-01T00:00:00")))
      (is (= -0.5 (position "v00.00-000")))
      (is (= 1.5 (position "v57.2024-12-01T00:00:00"))))
    (testing "an id after every versioned one is before the version-less ones"
      (is (= 2.5 (position "v59.2026-01-01T00:00:00"))))))

(defn run-migrations-in-range!
  "Run Liquibase migrations from our migrations YAML file in the range of `start-id` -> `end-id` (inclusive) against a
  DB with `jdbc-spec`.

  Range comparison uses the actual changelog order, so version-less ids (which carry no number) are handled too; see
  [[changelog-position]] for ids the changelog no longer has.

  After the update, the legacy `vNN.` changesets are split by Metabase major into one synthetic deployment each, with
  a `databasechangelog_version` row apiece (see [[mdb.test-util/split-legacy-majors-into-deployments!]]): a single
  update run covers many majors but records only one deployment, and the deployment-based rollback needs a boundary
  at every major for `migrate! :down N` to find."
  {:added "0.41.0", :arglists '([conn [start-id end-id]]
                                [conn [start-id end-id] {:keys [inclusive-start? inclusive-end?]
                                                         :or {inclusive-start? true
                                                              inclusive-end? true}}])}
  [^java.sql.Connection conn [start-id end-id] & [range-options]]
  (log/debugf "Finding and running migrations %s" (range-description start-id end-id range-options))

  (liquibase/with-liquibase [liquibase conn]
    (let [database         (.getDatabase liquibase)
          changelog-table  (.getDatabaseChangeLogTableName database)
          changesets       (vec (.getChangeSets (.getDatabaseChangeLog liquibase)))
          id->index        (into {} (map-indexed (fn [i ^ChangeSet cs] [(.getId cs) i]) changesets))
          {:keys [inclusive-start? inclusive-end?]
           :or   {inclusive-start? true inclusive-end? true}} range-options
          start-idx        (changelog-position changesets id->index start-id)
          end-idx          (when end-id (changelog-position changesets id->index end-id))
          in-range?        (fn [idx]
                             (and (some? idx)
                                  (if inclusive-start? (<= start-idx idx) (< start-idx idx))
                                  (if end-idx (if inclusive-end? (<= idx end-idx) (< idx end-idx)) true)))
          change-set-filters [(reify ChangeSetFilter
                                (accepts [this change-set]
                                  (let [id      (.getId ^ChangeSet change-set)
                                        accept? (boolean (in-range? (id->index id)))]
                                    (log/tracef "Migration %s in range [%s ↔ %s] %s ? => %s"
                                                id start-id end-id
                                                (if inclusive-end? "(inclusive)" "(exclusive)")
                                                accept?)
                                    (ChangeSetFilterResult. accept? "decision according to range" (class this)))))]
          change-log-service (.getChangeLogService (ChangeLogHistoryServiceFactory/getInstance) database)]
      (versions/ensure-version-tracking! conn database)
      (liquibase/with-scope-locked liquibase
        ;; Calling .listUnrunChangeSets has the side effect of creating the Liquibase tables
        ;; and initializing checksums so that they match the ones generated in production.
        (.listUnrunChangeSets liquibase nil (LabelExpression.))
        (.generateDeploymentId change-log-service)
        (liquibase/update-with-change-log liquibase {:change-set-filters change-set-filters}))
      (mdb.test-util/split-legacy-majors-into-deployments! conn changelog-table))))

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
                     ;; force: these legacy tests roll back to arbitrary majors, often further back than the default
                     ;; rollback window (current major + previous-major boundary). force widens that window to the full
                     ;; recorded history; each major is recorded by run-migrations-in-range! above, so every such target
                     ;; is a valid recorded version. The default-window rule itself is covered in metabase.app-db.liquibase-test.
                     (mdb/migrate! (mdb/data-source) :down-force version)
                     ;; We may have rolled back migrations prior to start-id, so its no longer safe to start from there.
                     ;; The rollback ends with a version-tracking marker row, which is not a changeset to restart from.
                     (reset! restart-id (t2/select-one-pk (liquibase/changelog-table-name conn)
                                                          {:where    [:not= :filename "legacy-version-tracking"]
                                                           :order-by [[:orderexecuted :desc]]}))))))]
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
    (test-migrations [100 105] [migrate!]
      ;; (Migrations 1-99 are ran automatically before body is invoked)
      ;; 1. Load data
      (create-some-users!)
      ;; 2. Run migrations 100-105
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
