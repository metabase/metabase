(ns ^:mb/driver-tests metabase.app-db.liquibase.versions-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.liquibase.versions :as versions]
   [metabase.app-db.test-util :as mdb.test-util]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.util :as u])
  (:import
   (liquibase Liquibase)
   (liquibase.changelog ChangeSet)
   (liquibase.lockservice LockServiceFactory)
   (liquibase.util LiquibaseUtil)))

(set! *warn-on-reflection* true)

(defn- tag [s] (assoc config/mb-version-info :tag s))

(defn- version-rows
  "`[deployment_id metabase_version ran?]` for every version row, in insertion order."
  [conn]
  (mapv (fn [{:keys [deployment_id metabase_version ran_migrations]}]
          [deployment_id metabase_version (or (true? ran_migrations) (= 1 ran_migrations))])
        (jdbc/query {:connection conn}
                    [(format "SELECT deployment_id, metabase_version, ran_migrations FROM %s ORDER BY id"
                             (versions/versions-table-name))])))

(defn- highest-versioned-major
  "The highest `vNN.` major in the changelog file: the major the one-time backfill records once these migrations have
  run. Stays meaningful after migrations become version-less -- it freezes at the last versioned major, exactly like
  the applied `vNN.` ids the backfill reads."
  [^Liquibase liquibase]
  (->> (.getChangeSets (.getDatabaseChangeLog liquibase))
       (keep (fn [^ChangeSet cs] (some-> (re-find #"^v(\d+)\." (.getId cs)) second parse-long)))
       (reduce max 0)))

(defn- migrate-without-recording!
  "Run every migration WITHOUT the recording listener, as a binary that predates version tracking would have."
  [^Liquibase liquibase]
  (liquibase/with-scope-locked liquibase (.update liquibase "")))

;;; ------------------------------------------- the version being recorded ----------------------------------------

(deftest current-recorded-version-test
  (testing "real version tags are normalized to the edition-agnostic x.{major}... form"
    (with-redefs [config/mb-version-info (tag "v0.56.2")]
      (is (= "x.56.2" (versions/current-recorded-version)) "OSS")
      (is (= 56 (versions/current-recorded-major))))
    (with-redefs [config/mb-version-info (tag "v1.56.2")]
      (is (= "x.56.2" (versions/current-recorded-version)) "EE records the same as OSS"))
    (with-redefs [config/mb-version-info (tag "v0.56.0-SNAPSHOT")]
      (is (= "x.56.0-SNAPSHOT" (versions/current-recorded-version)) "off-head snapshot")
      (is (= 56 (versions/current-recorded-major)))))
  (testing "version->major parses the stored x. form"
    (is (= 55 (versions/version->major "x.55.2.1")))
    (is (= 9999 (versions/version->major versions/dev-version)))
    (is (nil? (versions/version->major nil)))))

(deftest dev-version-test
  (testing "a build with no real release version records the constant dev version"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (with-redefs [config/mb-version-info (tag "vLOCAL_DEV")]
          (is (= "x.9999.0.0" versions/dev-version (versions/current-recorded-version)))
          (is (= 9999 versions/dev-major (versions/current-recorded-major)))
          (is (false? (versions/versions-table-exists? conn))
              "computing it touches no state, so read-only paths like `migrate print` never create the version table")))))
  (testing "synthetic-dev-major? recognises exactly the dev major"
    (is (true? (versions/synthetic-dev-major? versions/dev-major)))
    (is (false? (versions/synthetic-dev-major? 65)))
    (is (false? (versions/synthetic-dev-major? nil)))))

(deftest prod-synthetic-version-fallback-warns-test
  (testing "a prod-mode binary that cannot parse its own version tag logs loudly before recording synthetic versions"
    (with-redefs [config/mb-version-info (tag "vUNKNOWN")
                  config/is-prod?        true]
      (reset! @#'versions/dev-version-fallback-logged? false)
      (mt/with-log-messages-for-level [messages :error]
        (is (= versions/dev-version (versions/current-recorded-version))
            "still falls back to the dev version so the instance can run")
        (is (= 1 (count (filter #(re-find #"development version" (:message %)) (messages))))
            "and logs an error explaining the degraded version tracking")
        (let [message (:message (first (filter #(re-find #"development version" (:message %)) (messages))))]
          (testing "the message names the bad tag, the version recorded, and what a release binary will do later"
            (is (re-find #"\"vUNKNOWN\"" message))
            (is (re-find #"x\.9999\.0\.0" message))
            (is (re-find #"Development build detected" message))
            (is (re-find #"version\.properties" message))))
        (versions/current-recorded-version)
        (is (= 1 (count (filter #(re-find #"development version" (:message %)) (messages))))
            "only once per process -- it is consulted several times per boot")))))

(deftest ^:parallel extract-numbers-special-case-test
  (testing "the v56 changesets that shipped in v55 report 55"
    (is (= 55 (first (#'versions/extract-numbers "v56.2025-06-05T16:48:48"))))
    (is (= 55 (first (#'versions/extract-numbers "v56.2025-05-19T16:48:48")))))
  (testing "the v65 view changesets that 1.64.2.1 ran, and 64 ships again, report 64"
    (is (= 64 (first (#'versions/extract-numbers "v65.2026-10-07T12:00:00"))))
    (is (= 64 (first (#'versions/extract-numbers "v65.2026-10-07T12:00:01")))))
  (is (= 60 (first (#'versions/extract-numbers "v60.ghdf99efd")))))

;;; ------------------------------------------------- recording runs ----------------------------------------------

(deftest record-deployment-version-nil-guard-test
  (testing "recording with a nil deployment id (empty changelog) is a no-op instead of a NOT NULL violation"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (versions/ensure-version-tracking! conn (.getDatabase liquibase))
          (versions/record-deployment-version! conn nil "x.1.0" true)
          (is (= [] (version-rows conn))))))))

(deftest record-deployment-version-is-idempotent-test
  (testing "an already-present (deployment, version) pair is left alone, so a boot row never overwrites a ran row"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (versions/ensure-version-tracking! conn (.getDatabase liquibase))
          (versions/record-deployment-version! conn "dep" "x.65.0" true)
          (versions/record-deployment-version! conn "dep" "x.65.0" false)
          (versions/record-deployment-version! conn "dep" "x.65.0" true)
          (is (= [["dep" "x.65.0" true]] (version-rows conn))))))))

(deftest recording-listener-records-the-run-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db (.getDatabase liquibase)]
          (versions/ensure-version-tracking! conn db)
          (testing "no version is recorded before any migrations have run"
            (is (nil? (versions/last-deployment-version conn db)))
            (is (= [] (versions/recorded-deployments conn db))))
          (let [run-version (versions/current-recorded-version)]
            (liquibase/migrate-up-if-needed! liquibase (mdb/data-source))
            (testing "exactly one ran row is recorded for the single deployment, with the running version"
              (is (= [run-version] (map second (version-rows conn))))
              (is (= [true] (map peek (version-rows conn)))))
            (testing "last-deployment-version returns the recorded version"
              (is (= run-version (versions/last-deployment-version conn db))))
            (testing "a second (no-op) run of the same version records nothing new"
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source))
              (is (= 1 (count (version-rows conn)))))))))))

(deftest record-boot-version-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db              (.getDatabase liquibase)
              changelog-table (liquibase/changelog-table-name liquibase)
              latest          (highest-versioned-major liquibase)
              backfilled      (versions/major->version latest)]
          ;; migrate as a pre-tracking binary would have, attributing the changesets to a *previous* process so the
          ;; deployment differs from this JVM's Liquibase deployment id
          (migrate-without-recording! liquibase)
          (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'priorrun'" changelog-table)])
          (versions/ensure-version-tracking! conn db)
          (is (= [["priorrun" backfilled true]] (version-rows conn))
              "ensure-version-tracking! backfills the version the vNN. ids imply as the deployment's ran version")
          (testing "a no-op boot of a real version records a boot row against the current deployment"
            (with-redefs [config/mb-version-info (tag (format "v0.%d.1" latest))]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (is (= [["priorrun" backfilled true]
                    ["priorrun" (format "x.%d.1" latest) false]]
                   (version-rows conn))))
          (testing "re-booting the same version does not add a duplicate row"
            (with-redefs [config/mb-version-info (tag (format "v0.%d.1" latest))]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (is (= 2 (count (version-rows conn)))))
          (testing "a NEWER major's no-op boot is recorded (that major shipped no migrations for this database)..."
            (with-redefs [config/mb-version-info (tag (format "v0.%d.0" (inc latest)))]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (is (= ["priorrun" (format "x.%d.0" (inc latest)) false] (last (version-rows conn)))))
          (testing "...but does not move the schema's version: the ran version still decides"
            (is (= latest (versions/current-schema-major conn db)))
            (is (= backfilled (versions/last-deployment-version conn db))))
          (testing "an OLDER major's no-op boot records nothing (an unsupported downgrade is not history worth a row)"
            (with-redefs [config/mb-version-info (tag (format "v0.%d.0" (- latest 5)))]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (is (= 3 (count (version-rows conn)))))
          (testing "a development build's no-op boot records nothing: its constant version carries no information"
            (with-redefs [config/mb-version-info (tag "vLOCAL_DEV")]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (is (= 3 (count (version-rows conn))))
            (is (= latest (versions/current-schema-major conn db)))))))))

;;; --------------------------------------------- table creation and backfill ---------------------------------------

(deftest ensure-backfills-the-current-deployment-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db              (.getDatabase liquibase)
              changelog-table (liquibase/changelog-table-name liquibase)
              latest          (versions/major->version (highest-versioned-major liquibase))]
          (migrate-without-recording! liquibase)
          ;; an existing instance with no recorded versions, split across two deployments by execution position (not
          ;; by id: the most recent changesets may be version-less, which carry no major in their id)
          (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'older'" changelog-table)])
          ;; MySQL can't UPDATE a table that a subquery of the same statement reads, so find the boundary first
          (let [boundary (-> (jdbc/query {:connection conn} [(format "SELECT MAX(orderexecuted) - 10 AS boundary FROM %s" changelog-table)])
                             first
                             :boundary)]
            (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'newer' WHERE orderexecuted > ?" changelog-table)
                                               boundary]))
          (versions/ensure-version-tracking! conn db)
          (testing "the current deployment gets a ran row with the highest vNN. major, and the older one the major its
                    own rows put the schema at"
            (is (= [["newer" latest true] ["older" latest true]] (version-rows conn))))
          (testing "deployed_at is populated for the backfilled row"
            (is (every? :deployed_at (jdbc/query {:connection conn}
                                                 [(format "SELECT deployed_at FROM %s" (versions/versions-table-name))]))))
          (testing "ensure is idempotent"
            (versions/ensure-version-tracking! conn db)
            (is (= 2 (count (version-rows conn)))))
          (testing "the deployments keep their changelog order"
            (is (= ["newer" "older"] (map :deployment-id (versions/recorded-deployments conn db))))))))))

(deftest backfill-uses-highest-version-not-latest-executed-test
  (testing "the backfill records the highest major present, even when a lower-version changeset ran last (a back-ported patch)"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db              (.getDatabase liquibase)
                changelog-table (liquibase/changelog-table-name liquibase)
                latest          (versions/major->version (highest-versioned-major liquibase))]
            (migrate-without-recording! liquibase)
            (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'main'" changelog-table)])
            ;; a back-ported patch: a much lower-version changeset that EXECUTED LAST, in its own deployment
            (mdb.test-util/fabricate-history! conn changelog-table
                                              [{:deployment "patch" :changesets ["v44.patch-backport"]}])
            (versions/ensure-version-tracking! conn db)
            (is (= [["patch" latest true] ["main" latest true]] (version-rows conn))
                "the current deployment is the patch's, but its version is the highest major in the changelog")
            (is (= latest (versions/last-deployment-version conn db)))))))))

(deftest backfill-counts-the-v65-changesets-64-ships-as-64-test
  (testing "a 64 database that ran the two v65 view changesets 64 ships again is backfilled as 64, not 65 -- otherwise
            every later 64 patch would refuse to boot against it"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "d64" :changesets ["v64.2026-07-22T00:00:00"
                                                                               "v65.2026-10-07T12:00:00"
                                                                               "v65.2026-10-07T12:00:01"]}])
            (versions/ensure-version-tracking! conn db)
            (is (= [["d64" "x.64.0.0" true]] (version-rows conn)))
            (is (= 64 (versions/current-schema-major conn db)))))))))

(deftest first-backfill-records-every-legacy-deployment-test
  (testing "the first backfill records each legacy deployment at the major its vNN. ids put the schema at, so the
            major before the current one stays a `migrate down` target"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "d63" :changesets ["v63.2026-01-01T00:00:00"]}
                                               {:deployment "d64a" :changesets ["v64.2026-05-01T00:00:00"]}
                                               {:deployment "d64b" :changesets ["v64.2026-06-01T00:00:00"]}])
            (versions/ensure-version-tracking! conn db)
            (is (= [["d64b" "x.64.0.0" true]
                    ["d64a" "x.64.0.0" true]
                    ["d63" "x.63.0.0" true]]
                   (version-rows conn)))
            (testing "ensure stays idempotent"
              (versions/ensure-version-tracking! conn db)
              (is (= 3 (count (version-rows conn)))))
            (is (= 63 (versions/previous-recorded-major (versions/recorded-deployments conn db) false)))))))))

(deftest version-tracking-sql-backfills-every-legacy-deployment-test
  (testing "the manual-upgrade SQL backfills every legacy deployment, like the first boot does: once it is applied the
            versions are tracked, and no later backfill records the older deployments"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "d63" :changesets ["v63.2026-01-01T00:00:00"]}
                                               {:deployment "d64" :changesets ["v64.2026-05-01T00:00:00"]}])
            (is (false? (versions/versions-table-exists? conn)) "sanity: a pre-tracking install")
            (with-redefs [config/mb-version-info (tag "v0.65.0")]
              (let [sql (versions/version-tracking-sql conn db 65)]
                (is (re-find #"'d64', 'x\.64\.0\.0'" sql))
                (is (re-find #"'d63', 'x\.63\.0\.0'" sql))))))))))

(deftest migrate-up-repairs-legacy-rollbacks-under-the-lock-test
  (testing "migrate up repairs a legacy rollback once it holds the migration lock, and not when there is nothing to run"
    (mt/with-temp-empty-app-db [_conn :h2]
      (let [lock-held-at-repair (atom [])
            repair              (dynamic-redefs/original-fn #'versions/repair-legacy-rollback!)]
        (mt/with-dynamic-fn-redefs [versions/repair-legacy-rollback!
                                    (fn [conn database unrun-change-sets]
                                      (swap! lock-held-at-repair conj
                                             (.hasChangeLogLock (.getLockService (LockServiceFactory/getInstance) database)))
                                      (repair conn database unrun-change-sets))]
          (mdb/migrate! (mdb/data-source) :up)
          (is (= [true] @lock-held-at-repair))
          (mdb/migrate! (mdb/data-source) :up)
          (is (= [true] @lock-held-at-repair)))))))

(deftest migrate-recreates-version-table-after-failure-test
  (testing "the version table is (re)created at the start of every migrate!, so a rolled-back CREATE (transactional DDL) is simply redone"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (versions/ensure-version-tracking! conn (.getDatabase liquibase)))
        (is (true? (versions/versions-table-exists? conn)))
        (jdbc/execute! {:connection conn} [(format "DROP TABLE %s" (versions/versions-table-name))])
        (mt/with-dynamic-fn-redefs [liquibase/migrate-up-if-needed! (fn [& _] (throw (ex-info "boom" {})))]
          (is (thrown-with-msg? Exception #"boom" (mdb/migrate! (mdb/data-source) :up))))
        (mdb/migrate! (mdb/data-source) :up)
        (is (true? (versions/versions-table-exists? conn)))))))

(defn- ddl-statements!
  "Run `f` with [[versions/ensure-version-tracking!]]'s statements spied on; returns the CREATE TABLE statements run."
  [f]
  (let [orig       (dynamic-redefs/original-fn #'versions/execute-ddl!)
        statements (atom [])]
    (mt/with-dynamic-fn-redefs [versions/execute-ddl! (fn [conn ddl]
                                                        (swap! statements conj ddl)
                                                        (orig conn ddl))]
      (f))
    @statements))

(deftest ensure-version-tracking-skips-ddl-when-table-exists-test
  (testing "once the version tables exist, boots run no DDL: a Postgres user without CREATE on the schema can still boot"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)]
            (is (= 2 (count (ddl-statements! #(versions/ensure-version-tracking! conn db))))
                "the first call creates the version and first-run tables")
            (is (= [] (ddl-statements! #(versions/ensure-version-tracking! conn db)))
                "later calls see it and skip the CREATE")))))))

(deftest ensure-version-tracking-tolerates-losing-create-race-test
  (testing "a CREATE that fails because a concurrent boot created the table first is not an error"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db     (.getDatabase liquibase)
                orig   (dynamic-redefs/original-fn #'versions/execute!)
                checks (atom {})]
            ;; the other instance's CREATEs land between our existence checks and our own CREATEs
            (orig conn [(#'versions/table-ddl)])
            (orig conn [(#'versions/first-runs-table-ddl)])
            (mt/with-dynamic-fn-redefs [versions/table-exists? (fn [table-name _conn] ; stale on each table's first check only
                                                                 (> (get (swap! checks update table-name (fnil inc 0)) table-name) 1))
                                        versions/execute-ddl!  (fn [_conn _ddl]
                                                                 (throw (java.sql.SQLException. "duplicate key value violates unique constraint \"pg_type_typname_nsp_index\"")))]
              (is (nil? (versions/ensure-version-tracking! conn db))))
            (testing "but a CREATE failure with no table behind it still propagates"
              (mt/with-dynamic-fn-redefs [versions/table-exists? (constantly false)
                                          versions/execute-ddl!  (fn [_conn _ddl]
                                                                   (throw (java.sql.SQLException. "permission denied for schema public")))]
                (is (thrown-with-msg? java.sql.SQLException #"permission denied"
                                      (versions/ensure-version-tracking! conn db)))))))))))

(deftest ensure-version-tracking-tolerates-losing-create-race-in-a-transaction-test
  (testing "on Postgres, inside the caller's transaction, a CREATE that loses the race is rolled back to its savepoint
            and the transaction goes on (two instances upgrading the same install at once)"
    (mt/test-drivers #{:postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db     (.getDatabase liquibase)
                checks (atom {})]
            (.setAutoCommit ^java.sql.Connection conn false)
            ;; the other instance's CREATE commits between our existence check and our own CREATE, which then fails
            (mt/with-dynamic-fn-redefs [versions/table-exists? (fn [table-name _conn]
                                                                 (> (get (swap! checks update table-name (fnil inc 0)) table-name) 1))
                                        versions/table-ddl     (constantly "CREATE TABLE databasechangelog_version (this is not valid")]
              (with-open [other (.getConnection ^javax.sql.DataSource (mdb/data-source))]
                (jdbc/execute! {:connection other} [((dynamic-redefs/original-fn #'versions/table-ddl))]))
              (is (nil? (versions/ensure-version-tracking! conn db))))
            (is (= [{:one 1}] (jdbc/query {:connection conn} ["SELECT 1 AS one"]))
                "the caller's transaction is still usable")))))))

(deftest versions-table-name-matches-changelog-casing-test
  (testing "the version table is cased like Liquibase's DATABASECHANGELOG: upper case on H2 and MySQL, lower on Postgres"
    ;; MySQL table names are case-sensitive on Linux, and other code (the audit app, h2 dump comparisons) looks it up
    ;; by the same spelling as the changelog table
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (versions/ensure-version-tracking! conn (.getDatabase liquibase))
          (let [expected (str (liquibase/changelog-table-name liquibase)
                              (if (= :postgres driver/*driver*) "_version" "_VERSION"))
                actual   (->> (jdbc/metadata-result (.getTables (.getMetaData conn) (.getCatalog conn) nil "%"
                                                                (u/varargs String ["TABLE"])))
                              (map :table_name)
                              (filter #(= "databasechangelog_version" (u/lower-case-en %))))]
            (is (= expected (versions/versions-table-name)))
            (is (= [expected] actual))))))))

(deftest mysql-ran-migrations-is-bit-test
  (testing "on MySQL/MariaDB ran_migrations is bit(1), like every other boolean column (see general-schema-tests)"
    (mt/test-driver :mysql
      (mt/with-temp-empty-app-db [conn :mysql]
        (liquibase/with-liquibase [liquibase conn]
          (versions/ensure-version-tracking! conn (.getDatabase liquibase)))
        (is (= "bit"
               (-> (jdbc/query {:connection conn}
                               ["SELECT data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'ran_migrations'"
                                (versions/versions-table-name)])
                   first
                   :data_type)))
        (testing "and still reads back as a ran row"
          (versions/record-deployment-version! conn "dep1" "x.64.0" true)
          (is (= [["dep1" "x.64.0" true]] (version-rows conn))))))))

(deftest deployed-at-uses-unified-timestamp-type-test
  (testing "the version table starts with the post-UnifyTimeColumnsType type on both fresh installs and upgrades"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (versions/ensure-version-tracking! conn (.getDatabase liquibase)))
        (let [{:keys [data_type datetime_precision]}
              (first
               (case driver/*driver*
                 :mysql
                 (jdbc/query {:connection conn}
                             [(str "SELECT data_type, datetime_precision FROM information_schema.columns "
                                   "WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'deployed_at'")
                              (versions/versions-table-name)])

                 (:h2 :postgres)
                 (jdbc/query {:connection conn}
                             [(str "SELECT data_type, datetime_precision FROM information_schema.columns "
                                   "WHERE LOWER(table_name) = ? AND LOWER(column_name) = 'deployed_at'")
                              (u/lower-case-en (versions/versions-table-name))])))]
          (case driver/*driver*
            :h2      (is (= "timestamp with time zone" (some-> data_type u/lower-case-en)))
            :postgres (is (= "timestamp with time zone" data_type))
            :mysql   (do
                       (is (= "timestamp" data_type))
                       (is (= 6 datetime_precision)))))))))

(deftest repair-corrects-a-deployment-trimmed-by-a-legacy-rollback-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db              (.getDatabase liquibase)
              changelog-table (liquibase/changelog-table-name liquibase)]
          (versions/ensure-version-tracking! conn db)
          (testing "a pre-tracking binary's `migrate down` removes changesets but leaves their version rows"
            ;; upgraded 62 -> 64 in one run (backfilled as 64 by the first 65 boot), then rolled back to 63 by 64
            (mdb.test-util/fabricate-history! conn changelog-table
                                              [{:deployment "d1"
                                                :ran        "x.64.0.0"
                                                :booted     ["x.64.2" "x.63.1"]
                                                ;; The old binary does not know this synthetic row, so it survives
                                                ;; when that binary rolls the real v64 changeset back.
                                                :changesets ["v62.00-001" "v63.00-001"
                                                             {:id       "v64.legacy-version-tracking"
                                                              :author   "version-tracking"
                                                              :filename "legacy-version-tracking"}]}])
            (versions/ensure-version-tracking! conn db)
            (versions/repair-legacy-rollback! conn db ["v64.00-001"])
            (is (= #{["d1" "x.63.0.0" true] ["d1" "x.63.1" false]} (set (version-rows conn)))
                "the ran row is lowered to the highest remaining major, and newer boot rows are dropped")
            (is (= 63 (versions/current-schema-major conn db)))))))))

(deftest repair-leaves-tracked-deployments-alone-test
  (testing "a ran version above the changelog's highest vNN. major is only corrected for a legacy-only deployment"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (doseq [[desc {:keys [ran changesets]}]
              {"the binary's legacy marker keeps the major"  {:ran "x.65.0" :changesets ["v64.00-001" "v65.legacy-version-tracking"]}
               "version-less changesets were run by a tracking binary" {:ran "x.66.0" :changesets ["v65.00-001" "2026-10-01-add-thing"]}
               "a development build's version is never corrected" {:ran versions/dev-version :changesets ["v64.00-001"]}}]
        (testing desc
          (mt/with-temp-empty-app-db [conn driver/*driver*]
            (liquibase/with-liquibase [liquibase conn]
              (let [db              (.getDatabase liquibase)
                    changelog-table (liquibase/changelog-table-name liquibase)]
                (versions/ensure-version-tracking! conn db)
                (mdb.test-util/fabricate-history! conn changelog-table
                                                  [{:deployment "d1" :ran ran :changesets changesets}])
                (versions/ensure-version-tracking! conn db)
                (versions/repair-legacy-rollback! conn db [])
                (is (= [["d1" ran true]] (version-rows conn)))))))))))

;;; ------------------------------------------------- deployment reads ---------------------------------------------

(deftest recorded-deployments-follow-the-changelog-test
  (testing "the current deployment is the one owning the newest changelog row, whatever order the version rows were written in"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db              (.getDatabase liquibase)
                changelog-table (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            ;; version rows land newest-major first, but d64's changeset is the most recently executed one
            (mdb.test-util/fabricate-history! conn changelog-table
                                              [{:deployment "d65" :ran "x.65.0" :changesets ["c65"] :minutes-ago 10}
                                               {:deployment "d64" :ran "x.64.0" :changesets ["c64"] :minutes-ago 5}])
            (is (= ["d64" "d65"] (map :deployment-id (versions/recorded-deployments conn db))))
            (is (= 64 (versions/current-schema-major conn db)))
            (is (= "x.64.0" (versions/last-deployment-version conn db)))
            (is (= "d65" (versions/previous-deployment-id conn db)))))))))

(deftest rollback-window-test
  (testing "the window is every current-major deployment plus the most recent previous-major one; `all?` is the whole history"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db              (.getDatabase liquibase)
                changelog-table (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn changelog-table
                                              [{:deployment "d58"  :ran "x.58.0" :changesets ["c58"]}
                                               {:deployment "d59"  :ran "x.59.0" :changesets ["c59"] :booted ["x.59.3"]}
                                               {:deployment "d60a" :ran "x.60.0" :changesets ["c60a"]}
                                               {:deployment "d60b" :ran "x.60.1" :changesets ["c60b"]}])
            (let [deployments (versions/recorded-deployments conn db)]
              (is (= ["d60b" "d60a" "d59" "d58"] (map :deployment-id deployments)) "newest first")
              (is (= 60 (versions/schema-major deployments)))
              (is (= ["d60b" "d60a" "d59"] (map :deployment-id (versions/rollback-window deployments false)))
                  "both current-major (v60) deployments and the most recent previous-major (v59) deployment, not the older v58")
              (is (= ["d60b" "d60a" "d59" "d58"] (map :deployment-id (versions/rollback-window deployments true)))
                  "with all? the full recorded history (what a forced rollback targets)")
              (is (= #{58 59 60} (versions/recorded-majors deployments)))
              (is (= ["x.59.0" "x.59.3"] (:versions (nth deployments 2))) "ran and booted versions alike")
              (is (= "x.59.0" (:ran-version (nth deployments 2)))))))))))

(deftest previous-recorded-major-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db              (.getDatabase liquibase)
              changelog-table (liquibase/changelog-table-name liquibase)
              deployments     #(versions/recorded-deployments conn db)]
          (versions/ensure-version-tracking! conn db)
          (mdb.test-util/fabricate-history! conn changelog-table
                                            [{:deployment "d63" :ran "x.63.0" :changesets ["c63"]}])
          (testing "a single deployment has nothing earlier"
            (is (nil? (versions/previous-recorded-major (deployments) false))))
          (testing "a release that booted without migrations steps back to the schema-bearing release, not past it"
            (versions/record-deployment-version! conn "d63" "x.64.0" false)
            (is (= 63 (versions/previous-recorded-major (deployments) false))))
          (jdbc/execute! {:connection conn}
                         [(format "DELETE FROM %s WHERE metabase_version = 'x.64.0'"
                                  (versions/versions-table-name))])
          ;; the instance then upgraded directly to 65 -- 64 was never a recorded deployment
          (mdb.test-util/fabricate-history! conn changelog-table
                                            [{:deployment "d65" :ran "x.65.0" :changesets ["c65"]}])
          (testing "the previous *recorded* major, not (dec current), which was never deployed and could not resolve"
            (is (= 63 (versions/previous-recorded-major (deployments) false))))
          (testing "a major recorded only as a boot row counts: it is a nameable boundary at the same deployment"
            (versions/record-deployment-version! conn "d63" "x.64.0" false)
            (is (= 64 (versions/previous-recorded-major (deployments) false)))))))))

;;; ---------------------------------------- the legacy-version-tracking marker -------------------------------------

(deftest latest-applied-major-version-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (is (nil? (versions/latest-applied-major-version conn (.getDatabase liquibase))))
        (migrate-without-recording! liquibase)
        (is (< 52 (versions/latest-applied-major-version conn (.getDatabase liquibase))))))))

(deftest record-legacy-version-tracking-test
  (testing "record-legacy-version-tracking! tags the deployment that ran migrations, so older binaries read the right major"
    ;; Older (pre-version-less) binaries detect an unsupported downgrade via latest-applied-major-version (id LIKE 'v%')
    ;; and know nothing about databasechangelog_version. For a version-less major this row is the only signal.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db      (.getDatabase liquibase)
                ct      (liquibase/changelog-table-name liquibase)
                markers (fn [] (mapv :id (jdbc/query {:connection conn}
                                                     [(format "SELECT id FROM %s WHERE id LIKE 'v%%.legacy-version-tracking' ORDER BY id" ct)])))
                row-of  (fn [id] (first (jdbc/query {:connection conn}
                                                    [(format "SELECT deployment_id, orderexecuted, liquibase, description FROM %s WHERE id = ?" ct) id])))]
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn ct [{:deployment "d66" :changesets ["c66"]}])
            (testing "records the row against the deployment that ran, and latest-applied-major-version reads it"
              (versions/record-legacy-version-tracking! db 66 "d66")
              (is (= ["v66.legacy-version-tracking"] (markers)))
              (is (= "d66" (:deployment_id (row-of "v66.legacy-version-tracking")))
                  "shares the deployment_id, so the normal rollback path removes it with its deployment")
              (is (= (inc (:orderexecuted (row-of "c66"))) (:orderexecuted (row-of "v66.legacy-version-tracking")))
                  "at the next execution position, like a changeset Liquibase ran")
              (is (= (LiquibaseUtil/getBuildVersion) (:liquibase (row-of "v66.legacy-version-tracking")))
                  "stamped with the Liquibase version, like a changeset Liquibase ran")
              (is (= "Metabase v66 version marker (not a changeset)" (:description (row-of "v66.legacy-version-tracking")))
                  "with a description saying what the row is")
              (with-redefs [config/mb-version-info (tag "v0.66.0")]
                (is (re-find (re-pattern (str "legacy-version-tracking[^;]*'" (LiquibaseUtil/getBuildVersion) "'"))
                             (versions/version-tracking-sql conn db 0))
                    "and so is the marker in the manual-upgrade SQL"))
              (is (= 66 (versions/latest-applied-major-version conn db))))
            (testing "idempotent when the marker already ends the changelog"
              (versions/record-legacy-version-tracking! db 66 "d66")
              (is (= ["v66.legacy-version-tracking"] (markers)))
              (is (= "d66" (:deployment_id (row-of "v66.legacy-version-tracking")))))
            (testing "a later deployment of the same major moves the row to itself"
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d66b" :changesets ["c66b"]}])
              (versions/record-legacy-version-tracking! db 66 "d66b")
              (is (= ["v66.legacy-version-tracking"] (markers)))
              (is (= "d66b" (:deployment_id (row-of "v66.legacy-version-tracking")))))
            (testing "a new major adds its own row; earlier majors' rows are deliberately kept"
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d67" :changesets ["c67"]}])
              (versions/record-legacy-version-tracking! db 67 "d67")
              (is (= ["v66.legacy-version-tracking" "v67.legacy-version-tracking"] (markers)))
              (is (= 67 (versions/latest-applied-major-version conn db))
                  "older binaries read the highest, i.e. the current major"))
            (testing "the 1-arity records the running binary's major against the current deployment"
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d68" :changesets ["c68"]}])
              (with-redefs [config/mb-version-info (tag "v0.68.0")]
                (versions/record-legacy-version-tracking! db))
              (is (= "d68" (:deployment_id (row-of "v68.legacy-version-tracking")))))
            (testing "a dev deployment gets a marker too: a pre-version-less binary pointed at a dev DB must refuse
                      cleanly (its id scan reads v9999) instead of picking the legacy changelog off the version-less
                      id and crashing on re-running changeset 1"
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d9999" :changesets ["devmig"]}])
              (versions/record-legacy-version-tracking! db versions/dev-major "d9999")
              (is (= versions/dev-major (versions/latest-applied-major-version conn db))
                  "older binaries read the dev major and refuse"))))))))

(deftest force-migrate-writes-legacy-marker-test
  (testing "migrate force records the vNN.legacy-version-tracking marker just like a normal upgrade, so
            pre-versionless binaries can still detect a downgrade after a force upgrade"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (with-redefs [config/mb-version-info (tag "v0.66.0")
                      liquibase/changelog-file "versionless-dev-run1.yaml"]
          (mdb/migrate! (mdb/data-source) :force))
        (let [ct     (liquibase/changelog-table-name conn)
              row    (fn [id] (first (jdbc/query {:datasource (mdb/data-source)}
                                                 [(format "SELECT deployment_id, orderexecuted FROM %s WHERE id = ?" ct) id])))
              marker (row "v66.legacy-version-tracking")]
          (is (some? marker) "force must leave the same old-binary downgrade signal as a normal upgrade")
          (is (= (:deployment_id (row "dev_run_a")) (:deployment_id marker))
              "as an ordinary row of the deployment that ran the migrations")
          (liquibase/with-liquibase [liquibase conn]
            (is (= 66 (versions/latest-applied-major-version conn (.getDatabase liquibase)))
                "a pre-versionless binary's id scan now reads the upgraded major")))))))

;;; ---------------------------------------------- first runs of re-run changesets ----------------------------------

(deftest re-run-records-where-the-changeset-first-ran-test
  (testing "a re-run keeps where the changeset first ran, which Liquibase overwrites on its changelog row"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (let [ct       (liquibase/changelog-table-name conn)
              spec     {:datasource (mdb/data-source)}
              row-of   (fn [id] (first (jdbc/query spec [(format "SELECT deployment_id, dateexecuted, orderexecuted FROM %s WHERE id = ?" ct) id])))
              first-of (fn [] (with-open [c (.getConnection ^javax.sql.DataSource (mdb/data-source))]
                                (get (versions/first-runs c) ["migrations/2026/versionless_roc.yaml" "test" "roc_view"])))
              migrate! (fn [changelog]
                         (with-redefs [config/mb-version-info   (tag "v0.66.0")
                                       liquibase/changelog-file changelog]
                           (mdb/migrate! (mdb/data-source) :up)))]
          (migrate! "versionless-roc-run1.yaml")
          (is (nil? (first-of)) "a changeset that only ran once needs no record")
          (mdb.test-util/age-changelog-rows! spec ct)
          (let [original (row-of "roc_view")]
            (migrate! "versionless-roc-run3.yaml")
            (is (not= (:deployment_id original) (:deployment_id (row-of "roc_view"))) "sanity: the row moved")
            (is (= original (first-of)) "the first run is recorded as the row was before the re-run")
            (mdb.test-util/age-changelog-rows! spec ct)
            (migrate! "versionless-roc-run1.yaml")
            (is (= (:deployment_id original) (:deployment_id (first-of)))
                "a second re-run keeps the first run")))))))

(deftest run-always-records-where-the-changeset-first-ran-test
  (testing "a runAlways changeset re-runs on every update run, so it gets a first-run record too"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (let [ct       (liquibase/changelog-table-name conn)
              spec     {:datasource (mdb/data-source)}
              row-of   (fn [id] (first (jdbc/query spec [(format "SELECT deployment_id, dateexecuted, orderexecuted FROM %s WHERE id = ?" ct) id])))
              first-of (fn [] (with-open [c (.getConnection ^javax.sql.DataSource (mdb/data-source))]
                                (get (versions/first-runs c) ["migrations/2026/versionless_always.yaml" "test" "always_view"])))
              migrate! (fn []
                         (with-redefs [config/mb-version-info   (tag "v0.66.0")
                                       liquibase/changelog-file "versionless-always.yaml"]
                           (mdb/migrate! (mdb/data-source) :up)))]
          (migrate!)
          (mdb.test-util/age-changelog-rows! spec ct)
          (let [original (row-of "always_view")]
            (migrate!)
            (is (not= (:deployment_id original) (:deployment_id (row-of "always_view"))) "sanity: the view re-ran")
            (is (= original (first-of)))))))))

(deftest first-runs-keep-the-changelog-timestamp-type-test
  (testing "a fresh install, which runs UnifyTimeColumnsType over the tables already there, leaves the copied
            dateexecuted with the changelog's type, so the two still compare"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (mdb/migrate! (mdb/data-source) :up)
        (let [column-type (fn [table]
                            (-> (jdbc/query {:connection conn}
                                            [(str "SELECT data_type FROM information_schema.columns "
                                                  "WHERE LOWER(table_name) = ? AND LOWER(column_name) = 'dateexecuted'"
                                                  (when (= :mysql driver/*driver*) " AND table_schema = DATABASE()"))
                                             (u/lower-case-en table)])
                                first :data_type u/lower-case-en))]
          (is (some? (column-type (versions/first-runs-table-name))))
          (is (= (column-type (liquibase/changelog-table-name conn))
                 (column-type (versions/first-runs-table-name)))))))))

;;; ------------------------------- binaries from before version-less support (58 - 65) ------------------------------
;;; Version-less support is backported to patch releases of every supported major, so customers move between those
;;; patches and the earlier ("old") patches of the same majors, which know nothing about version tracking.

(defn- old-binary-latest-row
  "The changelog row an old binary's `decide-liquibase-file` reads to pick its changelog: `ORDER BY dateexecuted DESC`
  with no tiebreak. A tie for newest is returned as `::tie`, since the database may then return either row."
  [conn changelog-table]
  (let [newest (jdbc/query {:connection conn}
                           [(format "SELECT id FROM %s WHERE dateexecuted = (SELECT MAX(dateexecuted) FROM %s)"
                                    changelog-table changelog-table)])]
    (if (= 1 (count newest)) (:id (first newest)) ::tie)))

(defn- marker-rows [conn changelog-table]
  (mapv (juxt :id :deployment_id)
        (jdbc/query {:connection conn}
                    [(format "SELECT id, deployment_id FROM %s WHERE filename = 'legacy-version-tracking' ORDER BY id"
                             changelog-table)])))

(deftest tail-marker-keeps-old-binaries-on-the-current-changelog-test
  (testing "old binaries take a version-less newest row for a pre-4.2 install, so every run ends with a marker they read safely"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn ct [{:deployment "d58" :ran "x.58.9" :changesets ["v58.2025-01-01T00:00:00" "glossary_entity_id"]}])
            (testing "a versioned major gets the position marker, which never raises the major old binaries read"
              (versions/record-legacy-version-tracking! db 58 "d58")
              (is (= "v56.legacy-version-tracking" (old-binary-latest-row conn ct)))
              (is (= [["v56.legacy-version-tracking" "d58"]] (marker-rows conn ct)))
              (is (= 58 (versions/latest-applied-major-version conn db))))
            (testing "a later patch of the same major moves the marker to its own deployment"
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d58b" :ran "x.58.10" :changesets ["thing_two"]}])
              (versions/record-legacy-version-tracking! db 58 "d58b")
              (is (= "v56.legacy-version-tracking" (old-binary-latest-row conn ct)))
              (is (= [["v56.legacy-version-tracking" "d58b"]] (marker-rows conn ct))))
            (testing "the marker lands strictly after a row stored in the future (MySQL rounds sub-second timestamps up)"
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d58c" :ran "x.58.11" :changesets ["thing_three"]}])
              (jdbc/execute! {:connection conn} [(format "UPDATE %s SET dateexecuted = CURRENT_TIMESTAMP + INTERVAL '1' SECOND WHERE id = 'thing_three'" ct)])
              (versions/record-legacy-version-tracking! db 58 "d58c")
              (is (= "v56.legacy-version-tracking" (old-binary-latest-row conn ct)))
              (is (= ["d58c"] (map :deployment-id (take 1 (versions/recorded-deployments conn db))))
                  "and stays part of the deployment that ran"))
            (testing "a version-less major gets its own major marker, so old binaries read it as newer"
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d66" :ran "x.66.0" :changesets ["thing_four"]}])
              (versions/record-legacy-version-tracking! db 66 "d66")
              (is (= "v66.legacy-version-tracking" (old-binary-latest-row conn ct)))
              (is (= 66 (versions/latest-applied-major-version conn db)))
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d66b" :ran "x.66.1" :changesets ["thing_five"]}])
              (versions/record-legacy-version-tracking! db 66 "d66b")
              (is (= "v66.legacy-version-tracking" (old-binary-latest-row conn ct)))
              (is (= [["v56.legacy-version-tracking" "d58c"] ["v66.legacy-version-tracking" "d66b"]] (marker-rows conn ct))))))))))

(deftest ensure-backfills-deployments-old-binaries-ran-test
  (testing "deployments an old binary ran after version tracking started are recorded from their vNN. ids"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            ;; 58.9 (tracking) -> 59.0 (old) -> 60.0 (old) -> back to a tracking binary
            (mdb.test-util/fabricate-history! conn ct [{:deployment "d58" :ran "x.58.9" :changesets ["v58.2025-01-01T00:00:00" "thing_one"]}
                                                       {:deployment "d59" :changesets ["v59.2025-02-01T00:00:00"]}
                                                       {:deployment "d60" :changesets ["v60.2025-03-01T00:00:00"]}])
            (versions/ensure-version-tracking! conn db)
            (is (= [["d58" "x.58.9" true] ["d59" "x.59.0.0" true] ["d60" "x.60.0.0" true]]
                   (sort (version-rows conn))))
            (is (= 59 (versions/previous-recorded-major (versions/recorded-deployments conn db) false))
                "so `migrate down` steps back to the major the old binary left, not past it")))))))

(deftest ensure-repairs-a-deployment-an-old-binary-rolled-back-test
  (testing "an old binary's `migrate down` removes a major's vNN. changesets but not the version rows recording that major"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            ;; 58 -> 59.9 (tracking: v59 ids, a version-less changeset, the marker), then 59.0 (old) ran `migrate down`,
            ;; which removed the v59 ids and nothing else
            (mdb.test-util/fabricate-history! conn ct [{:deployment "d58" :ran "x.58.0.0" :changesets ["v58.2025-01-01T00:00:00"]}
                                                       {:deployment "d59" :ran "x.59.9" :booted ["x.59.10"]
                                                        :changesets ["thing_one"
                                                                     {:id "v56.legacy-version-tracking" :author "version-tracking" :filename "legacy-version-tracking"}]}])
            (versions/ensure-version-tracking! conn db)
            (is (= [["d58" "x.58.0.0" true] ["d59" "x.58.0.0" true]] (sort (version-rows conn)))
                "recorded as the major its changesets are back at, so a 58 binary boots against it")
            (is (= 58 (versions/current-schema-major conn db)))))))
    (testing "a deployment whose major's vNN. changesets are still there is left alone"
      (mt/test-drivers #{:h2 :mysql :postgres}
        (mt/with-temp-empty-app-db [conn driver/*driver*]
          (liquibase/with-liquibase [liquibase conn]
            (let [db (.getDatabase liquibase)
                  ct (liquibase/changelog-table-name liquibase)]
              (versions/ensure-version-tracking! conn db)
              ;; 59.0 (old) ran the v59 ids; 59.9 later ran only a version-less changeset
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d59" :ran "x.59.0.0" :changesets ["v59.2025-01-01T00:00:00"]}
                                                         {:deployment "d59b" :ran "x.59.9" :changesets ["thing_one"]}
                                                         {:deployment "d66" :ran "x.66.0" :changesets ["thing_two"]}])
              (versions/ensure-version-tracking! conn db)
              (is (= [["d59" "x.59.0.0" true] ["d59b" "x.59.9" true] ["d66" "x.66.0" true]] (sort (version-rows conn)))
                  "and so is a version-less major, which has no vNN. changesets at all"))))))))

(deftest deployments-are-ordered-like-liquibase-orders-them-test
  (testing "rows are ordered by dateexecuted, then orderexecuted, like Liquibase: orderexecuted only increases within
            an update run and can restart, so a later deployment may have lower values"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn ct [{:deployment "d58" :ran "x.58.0" :changesets ["v58.2025-01-01T00:00:00"]}
                                                       {:deployment "d59" :ran "x.59.0" :changesets ["v59.2025-01-01T00:00:00"]}])
            (jdbc/execute! {:connection conn} [(format "UPDATE %s SET orderexecuted = 0 WHERE deployment_id = 'd59'" ct)])
            (is (= ["d59" "d58"] (map :deployment-id (versions/recorded-deployments conn db))))
            (is (= "d59" (versions/last-deployment-id conn db)))
            (is (= 59 (versions/current-schema-major conn db)))))))))

(deftest ensure-heals-a-version-less-newest-row-test
  (testing "whatever left a version-less row newest, the next entry point puts a marker after it"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn ct [{:deployment "d58" :ran "x.58.99" :changesets ["v58.2025-01-01T00:00:00" "thing_one"]}])
            (versions/ensure-version-tracking! conn db)
            (is (= "v56.legacy-version-tracking" (old-binary-latest-row conn ct)))
            (testing "and leaves a newest row old binaries already read safely alone"
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d59" :ran "x.59.0.0" :changesets ["v59.2025-01-01T00:00:00"]}])
              (versions/ensure-version-tracking! conn db)
              (is (= "v59.2025-01-01T00:00:00" (old-binary-latest-row conn ct)))
              (is (= [["v56.legacy-version-tracking" "d58"]] (marker-rows conn ct))))))))))

(deftest which-majors-are-versioned-comes-from-the-changelog-test
  (testing "a major is versioned when its own vNN. changesets are in the changelog -- however late a major still shipped some"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn ct [{:deployment "d65" :ran "x.65.0" :changesets ["v65.abc123"]}
                                                       {:deployment "d66" :ran "x.66.9" :changesets ["v66.def456" "thing_one"]}])
            (testing "its own ids tell old binaries the major, so it gets the position marker"
              (versions/record-legacy-version-tracking! db 66 "d66")
              (is (= [["v56.legacy-version-tracking" "d66"]] (marker-rows conn ct)))
              (is (= 66 (versions/latest-applied-major-version conn db))))
            (testing "an old 66 binary's `migrate down` removed v66.def456: the deployment is repaired to 65"
              (jdbc/execute! {:connection conn} [(format "DELETE FROM %s WHERE id = 'v66.def456'" ct)])
              (versions/ensure-version-tracking! conn db)
              (is (= [["d65" "x.65.0" true] ["d66" "x.65.0.0" true]] (sort (version-rows conn))))
              (is (= 65 (versions/current-schema-major conn db))))))))))
