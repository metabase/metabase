(ns ^:mb/driver-tests metabase.app-db.liquibase-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.schema-migrations-test.impl :as schema-migrations.impl]
   [metabase.app-db.test-util :as mdb.test-util]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test :as mt]
   [next.jdbc :as next.jdbc]
   [toucan2.core :as t2])
  (:import
   (liquibase Liquibase)
   (liquibase.changelog ChangeSet)
   (liquibase.lockservice LockServiceFactory)))

(set! *warn-on-reflection* true)

(defn- split-migrations-sqls
  "Splits a sql migration string to multiple lines."
  [sql]
  (->> (str/split sql #"(;(\r)?\n)|(--.*\n)")
       (map str/trim)
       (remove (fn [s] (or
                        (str/blank? s)
                        (str/starts-with? s "--"))))))

(deftest mysql-engine-charset-test
  (mt/test-driver :mysql
    (testing "Make sure MySQL CREATE DATABASE statements have ENGINE/CHARACTER SET appended to them (#10691)"
      (sql-jdbc.execute/do-with-connection-with-options
       :mysql
       (sql-jdbc.conn/connection-details->spec :mysql
                                               (mt/dbdef->connection-details :mysql :server nil))
       {:write? true}
       (fn [^java.sql.Connection conn]
         (doseq [statement ["DROP DATABASE IF EXISTS liquibase_test;"
                            "CREATE DATABASE liquibase_test;"]]
           (next.jdbc/execute! conn [statement]))))
      (liquibase/with-liquibase [liquibase (->> (mt/dbdef->connection-details :mysql :db {:database-name "liquibase_test"})
                                                (sql-jdbc.conn/connection-details->spec :mysql)
                                                mdb.test-util/->ClojureJDBCSpecDataSource)]
        (testing "Make sure *every* line contains ENGINE ... CHARACTER SET ... COLLATE"
          (doseq [line  (split-migrations-sqls (liquibase/migrations-sql liquibase))
                  :when (str/starts-with? line "CREATE TABLE")]
            (is (true?
                 (or
                  (str/includes? line "ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                  (str/includes? line "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")))
                (format "%s should include ENGINE ... CHARACTER SET ... COLLATE ..." (pr-str line)))))))))

(deftest consolidate-liquibase-changesets-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      ;; fake a db where we ran all the migrations, including the legacy ones
      (mt/with-dynamic-fn-redefs [liquibase/decide-liquibase-file (fn [& _args] @#'liquibase/changelog-legacy-file)]
        (liquibase/with-liquibase [liquibase conn]
          (let [table-name (liquibase/changelog-table-name liquibase)]
            (.update liquibase "")
            (liquibase/consolidate-liquibase-changesets! conn liquibase)
            (testing "makes sure the change log filename are correctly set"
              (is (= (set (mdb.test-util/liquibase-file->included-ids "liquibase_legacy_migrations.yaml" driver/*driver* conn))
                     (t2/select-fn-set :id table-name :filename "migrations/000_legacy_migrations.yaml")))
              (is (= (set (mdb.test-util/liquibase-file->included-ids "migrations/001_update_migrations.yaml" driver/*driver* conn))
                     (t2/select-fn-set :id table-name :filename "migrations/001_update_migrations.yaml")))
              (is (= []
                     (remove #(str/starts-with? % "v56.") (t2/select-fn-set :id table-name :filename "migrations/056_update_migrations.yaml"))))
              (is (= (t2/select-fn-set :id table-name)
                     (set (mdb.test-util/all-liquibase-ids true driver/*driver* conn)))))))))))

(deftest wait-for-all-locks-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      ;; We don't need a long time for tests, keep it zippy.
      (let [sleep-ms   5
            timeout-ms 10]
        (liquibase/with-liquibase [liquibase conn]
          (testing "Will not wait if no locks are taken"
            (is (= :none (liquibase/wait-for-all-locks sleep-ms timeout-ms))))
          (testing "Will timeout if a lock is not released"
            (liquibase/with-scope-locked liquibase
              (is (= :timed-out (liquibase/wait-for-all-locks sleep-ms timeout-ms)))))
          (testing "Will return successfully if the lock is released while we are waiting"
            (let [migrate-ms 100
                  timeout-ms 500
                  locked     (promise)]
              (future
                (liquibase/with-scope-locked liquibase
                  (deliver locked true)
                  (Thread/sleep migrate-ms)))
              @locked
              (is (= :done (liquibase/wait-for-all-locks sleep-ms timeout-ms))))))))))

(deftest release-all-locks-if-needed!-test
  (mt/test-drivers #{:h2}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (testing "When we release the locks from outside the migration...\n"
          (let [locked   (promise)
                released (promise)
                locked?  (promise)]
            (future
              (liquibase/with-scope-locked liquibase
                (is (liquibase/holding-lock? liquibase))
                (deliver locked true)
                @released
                (deliver locked? (liquibase/holding-lock? liquibase))))
            @locked
            (liquibase/release-concurrent-locks! conn)
            (deliver released true)
            (testing "The lock was released before the migration finished"
              (is (not @locked?)))))))))

(deftest auto-release-session-lock-test
  (mt/test-drivers #{:mysql :postgres}
    (testing "Session lock is released on conn close"
      ;; Session lock provided automatically by the com.github.blagerweij/liquibase-sessionlock dependency
      (mt/with-temp-empty-app-db [_conn driver/*driver*]
        (let [;; use data-source so with-liquibase opens and closes the conn itself
              data-source (mdb/data-source)
              lock        (fn [^Liquibase liquibase]
                            (->> liquibase
                                 .getDatabase
                                 (.getLockService (LockServiceFactory/getInstance))
                                 .acquireLock))]
          (liquibase/with-liquibase [liquibase1 data-source]
            (is (lock liquibase1) "Can initially acquire session lock")
            (is (lock liquibase1) "Can require acquire session lock on same liquibase")
            (liquibase/with-liquibase [liquibase2 data-source]
              (is (not (lock liquibase2)) "Cannot acquire session lock on a different liquibase while it is taken")))
          (liquibase/with-liquibase [liquibase3 data-source]
            ;; This will fail if the com.github.blagerweij/liquibase-sessionlock dep is not present
            (is (lock liquibase3) "Can acquire session lock when conn closed without lock release")))))))

(deftest latest-applied-major-version
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (is (nil? (liquibase/latest-applied-major-version conn (.getDatabase liquibase))))
        (.update liquibase "")
        (is (< 52 (liquibase/latest-applied-major-version conn (.getDatabase liquibase))))))))

(defn- highest-versioned-major
  "The highest `vNN.` major in the changelog file: the major the one-time backfill stamps once these migrations have
  run. Stays meaningful after migrations become version-less -- it freezes at the last versioned major, exactly like
  the applied `vNN.` ids that [[liquibase/backfill-databasechangelog-versions!]] reads."
  [^Liquibase liquibase]
  (->> (.getChangeSets (.getDatabaseChangeLog liquibase))
       (keep (fn [^ChangeSet cs] (some-> (re-find #"^v(\d+)\." (.getId cs)) second parse-long)))
       (reduce max 0)))

(defn- migrate-with-recording!
  "Run all migrations on `liquibase`, recording deployment versions the way [[liquibase/migrate-up-if-needed!]] does."
  [^Liquibase liquibase]
  (let [db (.getDatabase liquibase)]
    (liquibase/ensure-databasechangelog-versions-table! (.getUnderlyingConnection (.getConnection db)))
    (liquibase/with-scope-locked liquibase
      (.setChangeExecListener liquibase (liquibase/recording-exec-listener db))
      (try (.update liquibase "") (finally (.setChangeExecListener liquibase nil))))))

(deftest current-recorded-version-test
  (testing "real version tags are normalized to the edition-agnostic x.{major}... form"
    (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.56.2")]
      (is (= "x.56.2" (liquibase/current-recorded-version)) "OSS")
      (is (= 56 (liquibase/current-recorded-major))))
    (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v1.56.2")]
      (is (= "x.56.2" (liquibase/current-recorded-version)) "EE records the same as OSS"))
    (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.56.0-SNAPSHOT")]
      (is (= "x.56.0-SNAPSHOT" (liquibase/current-recorded-version)) "off-head snapshot")
      (is (= 56 (liquibase/current-recorded-major)))))
  (testing "version->major parses the stored x. form"
    (is (= 55 (liquibase/version->major "x.55.2.1")))
    (is (= 1000 (liquibase/version->major "x.1000.0.0")))))

(deftest compute-synthetic-version-test
  (testing "in dev the synthetic version starts at x.1000.0.0 and is one past the highest recorded synthetic major"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (let [compute #(#'liquibase/compute-synthetic-version conn)]
          (liquibase/ensure-databasechangelog-versions-table! conn)
          (testing "empty history -> the floor"
            (is (= "x.1000.0.0" (compute))))
          (testing "each recorded deployment bumps the next one"
            (liquibase/record-deployment-version! conn "dep-1000" "x.1000.0.0")
            (is (= "x.1001.0.0" (compute)))
            (liquibase/record-deployment-version! conn "dep-1001" "x.1001.0.0")
            (is (= "x.1002.0.0" (compute))))
          (testing "always one past the max, regardless of insertion order or gaps"
            (liquibase/record-deployment-version! conn "dep-1005" "x.1005.0.0")
            (is (= "x.1006.0.0" (compute))))
          (testing "real (sub-floor) recorded majors are ignored"
            (liquibase/record-deployment-version! conn "dep-real" "x.63.1.0")
            (is (= "x.1006.0.0" (compute)))))))))

(deftest databasechangelog-versions-recording-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db             (.getDatabase liquibase)
              versions-table liquibase/databasechangelog-versions-table]
          (liquibase/ensure-databasechangelog-versions-table! conn)
          (testing "no version is recorded before any migrations have run"
            (is (nil? (liquibase/last-deployment-version conn db))))
          ;; capture the version the run will record BEFORE running: in dev the synthetic current-recorded-version
          ;; advances past a version once it is recorded (so the next run gets its own major)
          (let [run-version (liquibase/current-recorded-version)]
            (migrate-with-recording! liquibase)
            (testing "exactly one version row is recorded for the single deployment, with the running version"
              (let [rows (jdbc/query {:connection conn} [(format "SELECT deployment_id, metabase_version FROM %s" versions-table)])]
                (is (= 1 (count rows)))
                (is (= run-version (-> rows first :metabase_version)))))
            (testing "last-deployment-version returns the recorded version"
              (is (= run-version (liquibase/last-deployment-version conn db)))))
          (testing "ensure-table! and recording are idempotent across a second (no-op) run"
            (liquibase/ensure-databasechangelog-versions-table! conn)
            (migrate-with-recording! liquibase)
            (is (= 1 (count (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s" versions-table)]))))))))))

(deftest record-version-with-no-changesets-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db              (.getDatabase liquibase)
              versions-table  liquibase/databasechangelog-versions-table
              changelog-table (liquibase/changelog-table-name liquibase)
              latest          (highest-versioned-major liquibase)
              tag             (fn [s] (assoc config/mb-version-info :tag s))
              version-rows    (fn [] (jdbc/query {:connection conn}
                                                 [(format "SELECT deployment_id, metabase_version FROM %s ORDER BY id" versions-table)]))]
          ;; fully migrate WITHOUT the recording listener, then attribute the changesets to a *previous* process so the
          ;; last real deployment_id differs from this JVM's (phantom) Liquibase deployment_id
          (liquibase/with-scope-locked liquibase (.update liquibase ""))
          (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'priorrun'" changelog-table)])
          (liquibase/ensure-databasechangelog-versions-table! conn)
          (is (empty? (version-rows)) "no version recorded yet")
          (testing "in dev (synthetic version) a no-op boot records nothing -- it is not a new deployment"
            (with-redefs [config/mb-version-info (tag "vLOCAL_DEV")]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (is (empty? (version-rows)) "the synthetic counter must not advance when nothing is deployed"))
          (testing "a real-version no-op boot on a deployment with no recorded version backfills the ran-version first"
            ;; the boot's stamp must never be a deployment's first row, or it would be mistaken for the version that
            ;; ran the deployment
            (with-redefs [config/mb-version-info (tag (format "v0.%d.1" latest))]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (is (= [["priorrun" (format "x.%d.0.0" latest)]
                    ["priorrun" (format "x.%d.1" latest)]]
                   (map (juxt :deployment_id :metabase_version) (version-rows)))
                "the backfilled ran-version row comes first, then the boot's history stamp -- both on the last real deployment, not this process's phantom deployment id"))
          (testing "re-running with the same version does not add a duplicate row"
            (with-redefs [config/mb-version-info (tag (format "v0.%d.1" latest))]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (is (= 2 (count (version-rows)))))
          (testing "a NEWER major's no-op boot is recorded as history (that major shipped no migrations for this DB)"
            (with-redefs [config/mb-version-info (tag (format "v0.%d.0" (inc latest)))]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (is (= (format "x.%d.0" (inc latest)) (:metabase_version (last (version-rows))))))
          (testing "...but the stamp does not move the schema's version: the ran-version still wins for downgrade/rollback"
            (is (= latest (liquibase/current-schema-major conn db)))
            (is (= (format "x.%d.0.0" latest) (liquibase/last-deployment-version conn db))))
          (testing "an OLDER major's no-op boot records nothing (an unsupported downgrade is not history worth a row)"
            (with-redefs [config/mb-version-info (tag (format "v0.%d.0" (- latest 5)))]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (is (= 3 (count (version-rows))))))))))

(deftest backfill-databasechangelog-versions-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db              (.getDatabase liquibase)
              versions-table  liquibase/databasechangelog-versions-table
              changelog-table (liquibase/changelog-table-name liquibase)]
          (liquibase/ensure-databasechangelog-versions-table! conn)
          (liquibase/with-scope-locked liquibase (.update liquibase ""))
          ;; simulate an existing instance with no recorded versions, split across two deployments
          (jdbc/execute! {:connection conn} [(format "DELETE FROM %s" versions-table)])
          (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'older' WHERE id NOT LIKE 'v6%%'" changelog-table)])
          (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'newer' WHERE id LIKE 'v6%%'" changelog-table)])
          (liquibase/backfill-databasechangelog-versions! conn db)
          (let [rows   (jdbc/query {:connection conn} [(format "SELECT deployment_id, metabase_version, deployed_at FROM %s" versions-table)])
                by-dep (into {} (map (juxt :deployment_id :metabase_version)) rows)
                latest (format "x.%d.0.0" (highest-versioned-major liquibase))]
            (testing "only the latest deployment is stamped, with the version of the most-recently-run changeset"
              (is (= latest (get by-dep "newer")))
              (is (nil? (get by-dep "older")) "older deployments are intentionally left without a row"))
            (testing "deployed_at is populated for the backfilled deployment"
              (is (every? :deployed_at rows)))
            (testing "backfill is idempotent and does not duplicate rows"
              (liquibase/backfill-databasechangelog-versions! conn db)
              (is (= 1 (count (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s" versions-table)])))))))))))

(deftest backfill-uses-highest-version-not-latest-executed-test
  (testing "backfill stamps the highest major present, even when a lower-version changeset ran last (e.g. a back-ported patch)"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db              (.getDatabase liquibase)
                versions-table  liquibase/databasechangelog-versions-table
                changelog-table (liquibase/changelog-table-name liquibase)
                latest-major    (highest-versioned-major liquibase)]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            (liquibase/with-scope-locked liquibase (.update liquibase ""))
            (jdbc/execute! {:connection conn} [(format "DELETE FROM %s" versions-table)])
            ;; the real history (up to latest-major) ran first, in deployment 'main'
            (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'main'" changelog-table)])
            ;; now simulate a back-ported patch: a much lower-version changeset that EXECUTED LAST (latest dateexecuted),
            ;; in its own deployment 'patch'
            (let [max-oe (:m (first (jdbc/query {:connection conn} [(format "SELECT MAX(orderexecuted) AS m FROM %s" changelog-table)])))]
              (jdbc/execute! {:connection conn}
                             [(format (str "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype, deployment_id) "
                                           "VALUES ('v44.patch-backport', 'test', 'patch.yaml', CURRENT_TIMESTAMP, ?, 'EXECUTED', 'patch')")
                                      changelog-table)
                              (inc max-oe)]))
            (liquibase/backfill-databasechangelog-versions! conn db)
            (let [rows   (jdbc/query {:connection conn} [(format "SELECT deployment_id, metabase_version FROM %s" versions-table)])
                  by-dep (into {} (map (juxt :deployment_id :metabase_version)) rows)]
              (testing "the stamped version reflects the highest major in the changelog, not the last-executed v44 patch"
                (is (= (format "x.%d.0.0" latest-major) (get by-dep "patch"))))
              (testing "last-deployment-version (read path keyed off the last-executed deployment) agrees"
                (is (= latest-major
                       (liquibase/version->major (liquibase/last-deployment-version conn db))))))))))))

(deftest deployment-versions-major-window-test
  (testing "deployment-versions returns current-major deployments plus the most recent previous-major deployment"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db             (.getDatabase liquibase)
                versions-table liquibase/databasechangelog-versions-table
                mins-ago       (fn [n] (java.sql.Timestamp/from (.minus (java.time.Instant/now) (java.time.Duration/ofMinutes n))))
                insert!        (fn [dep version deployed-at]
                                 (jdbc/execute! {:connection conn}
                                                [(format "INSERT INTO %s (deployment_id, metabase_version, deployed_at) VALUES (?, ?, ?)" versions-table)
                                                 dep version deployed-at]))]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            ;; deploy history, newest first: two v60 deployments, then v59, then v58
            (insert! "d60b" "x.60.1" (mins-ago 1))
            (insert! "d60a" "x.60.0" (mins-ago 2))
            (insert! "d59"  "x.59.0" (mins-ago 3))
            (insert! "d58"  "x.58.0" (mins-ago 4))
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.60.0")]
              (is (= {"d60b" "x.60.1"
                      "d60a" "x.60.0"
                      "d59"  "x.59.0"}
                     (liquibase/deployment-versions conn db))
                  "both current-major (v60) deployments and the most recent previous-major (v59) deployment, but not the older v58")
              (is (= {"d60b" "x.60.1"
                      "d60a" "x.60.0"
                      "d59"  "x.59.0"
                      "d58"  "x.58.0"}
                     (liquibase/deployment-versions conn db true))
                  "with all? the full recorded history is returned (what a forced rollback targets)"))))))))

(deftest extract-numbers-special-case-test
  (testing "when specific migration verison is passed reports different major version"
    (is (= 55 (first (#'liquibase/extract-numbers "v56.2025-06-05T16:48:48"))))
    (is (= 55 (first (#'liquibase/extract-numbers "v56.2025-05-19T16:48:48"))))
    (is (= 60 (first (#'liquibase/extract-numbers "v60.ghdf99efd"))))))

(defn- insert-changelog-row!
  "Insert a synthetic databasechangelog row with a version-less id, belonging to `deployment-id`."
  [conn changelog-table id deployment-id orderexecuted]
  (jdbc/execute! {:connection conn}
                 [(format (str "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype, deployment_id) "
                               "VALUES (?, 'test', 'synthetic.yaml', CURRENT_TIMESTAMP, ?, 'EXECUTED', ?)")
                          changelog-table)
                  id orderexecuted deployment-id]))

(defn- insert-version-row!
  [conn versions-table deployment-id version ^java.time.Instant deployed-at]
  (jdbc/execute! {:connection conn}
                 [(format "INSERT INTO %s (deployment_id, metabase_version, deployed_at) VALUES (?, ?, ?)" versions-table)
                  deployment-id version (java.sql.Timestamp/from deployed-at)]))

(deftest rollback-version-less-by-deployment-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db              (.getDatabase liquibase)
              changelog-table (liquibase/changelog-table-name liquibase)
              versions-table  liquibase/databasechangelog-versions-table
              now             (java.time.Instant/now)
              ago             (fn [mins] (.minus now (java.time.Duration/ofMinutes mins)))]
          (liquibase/ensure-databasechangelog-versions-table! conn)
          (liquibase/with-scope-locked liquibase (.update liquibase ""))
          ;; Layer three synthetic version-less deployments on top of the real (version-prefixed) history: a prior-major
          ;; deployment d100 at x.100.5.0, then two current-major deployments d101a (x.101.1.0) and d101b (x.101.2.3).
          ;; Their changesets are not in the changelog file, so rolling them back exercises the deployment-based
          ;; selection and the supplemental delete path. Synthetic majors are kept well above the real history (~55) so
          ;; the "previous major" rollback never matches real version-prefixed changesets. (In production each upgrade
          ;; runs in its own process with its own deployment_id; within a single test JVM all real migrations share one,
          ;; so we construct the multi-deployment history directly.)
          (let [max-oe (:m (first (jdbc/query {:connection conn} [(format "SELECT MAX(orderexecuted) AS m FROM %s" changelog-table)])))]
            (insert-changelog-row! conn changelog-table "aaa111" "d100"  (inc max-oe))
            (insert-changelog-row! conn changelog-table "bbb222" "d100"  (+ max-oe 2))
            (insert-changelog-row! conn changelog-table "ccc333" "d101a" (+ max-oe 3))
            (insert-changelog-row! conn changelog-table "ddd444" "d101a" (+ max-oe 4))
            (insert-changelog-row! conn changelog-table "eee555" "d101b" (+ max-oe 5))
            (insert-changelog-row! conn changelog-table "fff666" "d101b" (+ max-oe 6))
            ;; deployed oldest-first so deployment-versions walks the current major (d101b, d101a) then stops at the
            ;; prior major (d100)
            (insert-version-row! conn versions-table "d100"  "x.100.5.0" (ago 30))
            (insert-version-row! conn versions-table "d101a" "x.101.1.0" (ago 20))
            (insert-version-row! conn versions-table "d101b" "x.101.2.3" (ago 10))
            ;; current major is 101 (d101b ran last); 100 is the previous major (the upgrade boundary)
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.101.2.3")]
              (testing "valid-rollback-target? accepts recorded majors in the window"
                (is (true? (liquibase/valid-rollback-target? conn db "101")) "the current major")
                (is (true? (liquibase/valid-rollback-target? conn db "100")) "the previous major version")
                (is (false? (liquibase/valid-rollback-target? conn db "99")) "a major outside the window (only reachable with force)")
                (is (false? (liquibase/valid-rollback-target? conn db "102")) "a never-recorded major")
                (is (false? (liquibase/valid-rollback-target? conn db "101.1.0")) "point-release targets are not supported"))
              (testing "rolling back to an unsupported point-release target is rejected"
                (is (thrown-with-msg? IllegalArgumentException #"not a valid rollback target"
                                      (liquibase/rollback-major-version! conn liquibase false "101.1.0"))))
              (testing "rolling back to the current major is a no-op: its latest deployment is the boundary"
                (liquibase/rollback-major-version! conn liquibase false "101")
                (is (= 2 (count (jdbc/query {:connection conn} [(format "SELECT id FROM %s WHERE deployment_id = 'd101b'" changelog-table)])))
                    "the latest current-major deployment (d101b) is retained")
                (is (= 2 (count (jdbc/query {:connection conn} [(format "SELECT id FROM %s WHERE deployment_id = 'd101a'" changelog-table)])))
                    "the earlier current-major deployment (d101a) is retained"))
              (testing "rolling back to the previous major drops every current-major deployment"
                (liquibase/rollback-major-version! conn liquibase false "100")
                (is (empty? (jdbc/query {:connection conn} [(format "SELECT id FROM %s WHERE deployment_id = 'd101b'" changelog-table)]))
                    "the d101b changesets were removed")
                (is (empty? (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s WHERE deployment_id = 'd101b'" versions-table)]))
                    "the d101b version row was deleted")
                (is (empty? (jdbc/query {:connection conn} [(format "SELECT id FROM %s WHERE deployment_id = 'd101a'" changelog-table)]))
                    "the remaining current-major (d101a) changesets were removed")
                (is (= 2 (count (jdbc/query {:connection conn} [(format "SELECT id FROM %s WHERE deployment_id = 'd100'" changelog-table)])))
                    "the previous-major (d100) changesets are retained")
                (is (empty? (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s WHERE deployment_id = 'd101a'" versions-table)]))
                    "the d101a version row was deleted")
                (is (= 1 (count (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s WHERE deployment_id = 'd100'" versions-table)])))
                    "the d100 version row is retained")))))))))

(deftest rollback-after-upgrade-backfill-test
  (testing "an install upgraded from 53 to 55 backfills the old major, records the new one, and downgrades back to 53"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db              (.getDatabase liquibase)
                changelog-table (liquibase/changelog-table-name liquibase)
                versions-table  liquibase/databasechangelog-versions-table]
            (liquibase/with-scope-locked liquibase (.update liquibase ""))
            (liquibase/ensure-databasechangelog-versions-table! conn)
            ;; Replace the real history with a synthetic "v53 install" upgraded over time: an older deployment (the
            ;; 51->52 upgrade) plus the most recent one whose last changeset is a v53.* id. (The changesets' own ids are
            ;; not in the changelog file, so the rollback clears them via the supplemental DELETE -- exactly the
            ;; version-prefixed-but-removed case.)
            (jdbc/execute! {:connection conn} [(format "DELETE FROM %s" changelog-table)])
            (insert-changelog-row! conn changelog-table "v51.2023-06-01T00:00:00" "d52older"   1)
            (insert-changelog-row! conn changelog-table "v52.2023-12-01T00:00:00" "d52older"   2)
            (insert-changelog-row! conn changelog-table "v53.2024-06-01T00:00:00" "d53install" 3)
            (testing "on 55 startup the production backfill stamps only the latest deployment from its last changeset id"
              (liquibase/backfill-databasechangelog-versions! conn db)
              (is (= [["d53install" "x.53.0.0"]]
                     (map (juxt :deployment_id :metabase_version)
                          (jdbc/query {:connection conn} [(format "SELECT deployment_id, metabase_version FROM %s" versions-table)])))
                  "the most recent deployment is recorded as x.53.0.0; older history is left unstamped"))
            ;; then the 55 upgrade runs as its own deployment and records its version like a normal run
            (insert-changelog-row! conn changelog-table "v55.2024-10-01T00:00:00" "d55" 4)
            (liquibase/record-deployment-version! conn "d55" "x.55.2.0")
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.55.2.0")]
              (testing "53 is a valid rollback target (the previous major)"
                (is (true? (liquibase/valid-rollback-target? conn db "53"))))
              (testing "downgrading to 53 rolls back the 55 deployment and keeps the rest of history"
                (liquibase/rollback-major-version! conn liquibase false "53")
                (is (empty? (jdbc/query {:connection conn} [(format "SELECT id FROM %s WHERE deployment_id = 'd55'" changelog-table)]))
                    "the 55 changesets were removed")
                (is (= 3 (count (jdbc/query {:connection conn} [(format "SELECT id FROM %s WHERE deployment_id <> 'd55'" changelog-table)])))
                    "the 53 install's changesets (including older unstamped history) are retained")
                (is (empty? (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s WHERE deployment_id = 'd55'" versions-table)]))
                    "the 55 version row was deleted")
                (is (= 1 (count (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s WHERE deployment_id = 'd53install'" versions-table)])))
                    "the 53 version row is retained")))))))))

(deftest migrate-up-backfills-pre-tracking-install-test
  (testing "the first `migrate up` on an install that predates version tracking backfills the pre-upgrade version,
            so `migrate down` still has a boundary to roll back to (CLI upgrades skip the boot-time checks)"
    ;; Regression: the recording listener used to insert the upgrade's version as the table's FIRST row, so the lazy
    ;; empty-table backfill never ran and the pre-upgrade rollback boundary was silently lost -- `migrate down`
    ;; no-opped and no explicit target could ever be valid.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db      (.getDatabase liquibase)
                ct      (liquibase/changelog-table-name liquibase)
                vt      liquibase/databasechangelog-versions-table
                all-ids (mapv (fn [^ChangeSet cs] (.getId cs))
                              (.getChangeSets (.getDatabaseChangeLog liquibase)))
                last-id (peek all-ids)
                stop-id (nth all-ids (- (count all-ids) 2))]
            ;; install everything except the last changeset, as a pre-version-tracking binary would have left it
            (schema-migrations.impl/run-migrations-in-range! conn ["v00.00-000" stop-id])
            ;; ... which had no version rows at all
            (jdbc/execute! {:connection conn} [(format "DELETE FROM %s" vt)])
            (let [pre-major (liquibase/latest-applied-major-version conn db)
                  versions  (fn [] (set (map :metabase_version
                                             (jdbc/query {:connection conn}
                                                         [(format "SELECT metabase_version FROM %s" vt)]))))]
              (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag (format "v0.%d.0" (inc pre-major)))]
                (testing "migrate up records both the backfilled pre-upgrade version and the upgrade's own version"
                  (mdb/migrate! (mdb/data-source) :up)
                  (is (contains? (versions) (format "x.%d.0.0" pre-major))
                      "the pre-upgrade schema version was backfilled")
                  (is (contains? (versions) (format "x.%d.0" (inc pre-major)))
                      "the upgrade recorded its own version"))
                (testing "migrate down (default) rolls the upgrade back"
                  (mdb/migrate! (mdb/data-source) :down)
                  (is (empty? (jdbc/query {:connection conn} [(format "SELECT 1 FROM %s WHERE id = ?" ct) last-id]))
                      "the upgrade's changeset was rolled back")
                  (is (not (contains? (versions) (format "x.%d.0" (inc pre-major))))
                      "the upgrade's version row was removed"))))))))))

(deftest rollback-force-widens-to-full-history-test
  (testing "force widens the rollback window from the recent history to the full recorded history"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db              (.getDatabase liquibase)
                changelog-table (liquibase/changelog-table-name liquibase)
                versions-table  liquibase/databasechangelog-versions-table
                now             (java.time.Instant/now)
                ago             (fn [m] (.minus now (java.time.Duration/ofMinutes m)))
                remaining-deps  (fn [] (set (map :deployment_id
                                                 (jdbc/query {:connection conn}
                                                             [(format "SELECT DISTINCT deployment_id FROM %s" changelog-table)]))))]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            (liquibase/with-scope-locked liquibase (.update liquibase ""))
            (jdbc/execute! {:connection conn} [(format "DELETE FROM %s" changelog-table)])
            ;; three majors deployed; 43 is two majors back from current, so it is outside the default window
            (insert-changelog-row! conn changelog-table "c43" "d43" 1)
            (insert-changelog-row! conn changelog-table "c44" "d44" 2)
            (insert-changelog-row! conn changelog-table "c45" "d45" 3)
            (insert-version-row! conn versions-table "d43" "x.43.0.0" (ago 30))
            (insert-version-row! conn versions-table "d44" "x.44.0.0" (ago 20))
            (insert-version-row! conn versions-table "d45" "x.45.0.0" (ago 10))
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.45.0.0")]
              (testing "43 is outside the default window (current 45 + previous-major boundary 44) but inside it with force"
                (is (false? (liquibase/valid-rollback-target? conn db "43")))
                (is (true? (liquibase/valid-rollback-target? conn db "43" true))))
              (testing "without force, a target outside the window is rejected and nothing is dropped"
                (is (thrown-with-msg? IllegalArgumentException #"not a valid rollback target"
                                      (liquibase/rollback-major-version! conn liquibase false "43")))
                (is (= #{"d43" "d44" "d45"} (remaining-deps))))
              (testing "with force, the further-back target is reachable and drops the later majors"
                (liquibase/rollback-major-version! conn liquibase true "43")
                (is (= #{"d43"} (remaining-deps))
                    "only the major-43 deployment remains")
                (is (= #{"d43"} (set (map :deployment_id
                                          (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s" versions-table)]))))
                    "the rolled-back deployments' version rows were also removed")))))))))

(deftest rollback-from-older-binary-guard-test
  (testing "a binary older than the schema refuses to roll back: its changelog cannot reverse the newer changesets,
            so proceeding would delete their bookkeeping and leave the schema silently corrupted"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [ct  (liquibase/changelog-table-name liquibase)
                vt  liquibase/databasechangelog-versions-table
                now (java.time.Instant/now)
                ago (fn [m] (.minus now (java.time.Duration/ofMinutes m)))]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            (liquibase/with-scope-locked liquibase (.update liquibase ""))
            ;; this binary's own history: one deployment, recorded as v0.64
            (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'd64'" ct)])
            (insert-version-row! conn vt "d64" "x.64.0" (ago 20))
            ;; a NEWER v65 binary ran a changeset that is NOT in this binary's changelog file
            (insert-changelog-row! conn ct "future65cs" "d65" 999999)
            (insert-version-row! conn vt "d65" "x.65.0" (ago 10))
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.64.0")]
              (testing "default `migrate down` throws instead of silently deleting the newer deployment's history"
                (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                      #"Cannot downgrade a database at version 65 from Metabase version 64"
                                      (liquibase/rollback-major-version! conn liquibase false))))
              (testing "an explicit target throws too"
                (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                      #"Cannot downgrade a database at version 65"
                                      (liquibase/rollback-major-version! conn liquibase false "64"))))
              (is (seq (jdbc/query {:connection conn} [(format "SELECT 1 FROM %s WHERE id = 'future65cs'" ct)]))
                  "nothing was deleted")
              (testing "force still allows it (the operator explicitly accepts the risk)"
                (liquibase/rollback-major-version! conn liquibase true "64")
                (is (empty? (jdbc/query {:connection conn} [(format "SELECT 1 FROM %s WHERE id = 'future65cs'" ct)])))))))))))

(deftest bare-major-rollback-targets-latest-deployment-of-major-test
  (testing "a bare-major target rolls back to the LATEST deployment of that major, whatever the recorded version format"
    ;; Regression: version strings of different lengths (a backfilled `x.64.0.0` vs a real-tag `x.64.9`) used to be
    ;; compared with Clojure's count-first vector sort, which resolved "64" to 64.0.0 and rolled back the 64.9 hotfix.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [ct   (liquibase/changelog-table-name liquibase)
                vt   liquibase/databasechangelog-versions-table
                now  (java.time.Instant/now)
                ago  (fn [m] (.minus now (java.time.Duration/ofMinutes m)))
                has? (fn [id] (boolean (seq (jdbc/query {:connection conn}
                                                        [(format "SELECT 1 FROM %s WHERE id = ?" ct) id]))))]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            ;; a pre-tracking install backfilled as x.64.0.0, then a 64.9 hotfix deployment, then the 65 upgrade
            (insert-changelog-row! conn ct "c64base"   "d64a" 1)
            (insert-changelog-row! conn ct "c64hotfix" "d64b" 2)
            (insert-changelog-row! conn ct "c65"       "d65"  3)
            (insert-version-row! conn vt "d64a" "x.64.0.0" (ago 30))
            (insert-version-row! conn vt "d64b" "x.64.9"   (ago 20))
            (insert-version-row! conn vt "d65"  "x.65.0"   (ago 10))
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.65.0")]
              (liquibase/rollback-major-version! conn liquibase false "64"))
            (is (not (has? "c65")) "the 65 changeset was rolled back")
            (is (has? "c64hotfix") "the 64.9 hotfix (the latest 64 deployment) is retained")
            (is (has? "c64base") "the original 64 changesets are retained")
            (is (= #{"d64a" "d64b"}
                   (set (map :deployment_id (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s" vt)]))))
                "only the 65 version row was removed")))))))

(deftest stamped-major-rollback-target-test
  (testing "a major recorded only as a no-op boot stamp (it shipped no migrations) is still a valid rollback boundary"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db  (.getDatabase liquibase)
                ct  (liquibase/changelog-table-name liquibase)
                vt  liquibase/databasechangelog-versions-table
                now (java.time.Instant/now)
                ago (fn [m] (.minus now (java.time.Duration/ofMinutes m)))]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            ;; d56 ran under x.56.0 and was later stamped x.57.0 by a no-op 57 boot; d58 is the current major
            (insert-changelog-row! conn ct "cs56" "d56" 1)
            (insert-changelog-row! conn ct "cs58" "d58" 2)
            (insert-version-row! conn vt "d56" "x.56.0" (ago 30))
            (insert-version-row! conn vt "d56" "x.57.0" (ago 20))
            (insert-version-row! conn vt "d58" "x.58.0" (ago 10))
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.58.0")]
              (is (true? (liquibase/valid-rollback-target? conn db "57"))
                  "57 never ran migrations here but is still a recorded boundary")
              (is (true? (liquibase/valid-rollback-target? conn db "56")))
              (liquibase/rollback-major-version! conn liquibase false "57")
              (is (empty? (jdbc/query {:connection conn} [(format "SELECT 1 FROM %s WHERE id = 'cs58'" ct)]))
                  "the current-major deployment was rolled back")
              (is (seq (jdbc/query {:connection conn} [(format "SELECT 1 FROM %s WHERE id = 'cs56'" ct)]))
                  "the stamped deployment is retained"))))))))

(deftest decide-liquibase-file-version-less-ids-test
  (testing "decide-liquibase-file treats version-less (year-directory) ids as modern, not as a pre-4.2 install"
    ;; Regression: a version-less latest changeset id (e.g. `aeiagus09e`) has no leading `v`, so the old heuristic
    ;; mistook a modern install for pre-4.2 and loaded the legacy changelog, re-running the earliest migrations and
    ;; bricking the instance on its next boot.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          ;; with-liquibase creates the databasechangelog table, so we are no longer a "fresh install"
          (let [db              (.getDatabase liquibase)
                changelog-table (liquibase/changelog-table-name liquibase)
                decide          #(#'liquibase/decide-liquibase-file conn db)
                set-latest!     (fn [id filename]
                                  (jdbc/execute! {:connection conn} [(format "DELETE FROM %s" changelog-table)])
                                  (jdbc/execute! {:connection conn}
                                                 [(format (str "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype) "
                                                               "VALUES (?, 't', ?, CURRENT_TIMESTAMP, 1, 'EXECUTED')")
                                                          changelog-table) id filename]))]
            (testing "a year-based directory positively identifies a modern version-less migration"
              ;; this is the case the id-shape heuristic alone cannot get right: an all-digit version-less id would
              ;; otherwise look exactly like a pre-4.2 changeset
              (doseq [id ["aeiagus09e" "12345" "09xyztest"]]
                (set-latest! id "migrations/2026/20260703_workspaces.yaml")
                (is (= @#'liquibase/changelog-file (decide))
                    (str "version-less id " id " in a year directory"))))
            (testing "version-less ids -> modern changelog even without the path signal"
              (doseq [id ["aeiagus09e" "ccdevtest01" "09xyztest"]]
                (set-latest! id "f.yaml")
                (is (= @#'liquibase/changelog-file (decide)) id)))
            (testing "genuinely pre-4.2 numeric ids and version < 45 ids -> legacy changelog (unchanged behavior)"
              (doseq [id ["316" "v44.00-042"]]
                (set-latest! id "migrations/000_legacy_migrations.yaml")
                (is (= @#'liquibase/changelog-legacy-file (decide)) id)))
            (testing "modern version ids and the v00 marker -> modern changelog (unchanged behavior)"
              (doseq [id ["v45.00-001" "v63.abc" "v00.00-000"]]
                (set-latest! id "migrations/001_update_migrations.yaml")
                (is (= @#'liquibase/changelog-file (decide)) id)))
            (testing "version-numbered directories (060/) are NOT year directories"
              (set-latest! "v60.abc" "migrations/060/20260101_foo.yaml")
              (is (= @#'liquibase/changelog-file (decide))))
            (testing "rows with the same dateexecuted (e.g. MySQL second precision): higher orderexecuted decides"
              ;; the 'latest changeset' must be resolved on the [dateexecuted orderexecuted] pair like the rest of the
              ;; version machinery, not on dateexecuted alone (which leaves the winner arbitrary among ties)
              (jdbc/execute! {:connection conn} [(format "DELETE FROM %s" changelog-table)])
              (doseq [[id filename oe] [["316" "migrations/000_legacy_migrations.yaml" 1]
                                        ["v64.abc" "migrations/064/20260101_foo.yaml" 2]]]
                (jdbc/execute! {:connection conn}
                               [(format (str "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype) "
                                             "VALUES (?, 't', ?, TIMESTAMP '2020-01-01 00:00:00', ?, 'EXECUTED')")
                                        changelog-table) id filename oe]))
              (is (= @#'liquibase/changelog-file (decide))
                  "the v64 row (orderexecuted 2) outranks the legacy row at the same timestamp"))))))))

(deftest consolidate-does-not-clobber-version-less-ids-test
  (testing "consolidate-liquibase-changesets! rewrites legacy ids' filenames but leaves version-less ids alone"
    ;; Regression: `consolidate` rewrote the filename of any id sorting before `v45.00-001`, which caught version-less
    ;; ids (e.g. `aeiagus09e` < `v45.00-001`) and pointed them at the legacy changelog file -> Liquibase then re-ran the
    ;; earliest migrations on the next boot.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [changelog-table (liquibase/changelog-table-name liquibase)
                filename-of      (fn [id] (:filename (first (jdbc/query {:connection conn}
                                                                        [(format "SELECT filename FROM %s WHERE id = ?" changelog-table) id]))))]
            ;; a legacy row (its filename ends with update_migrations.yaml, so consolidate's guard fires) and two
            ;; version-less rows in a year directory that must not be touched
            (insert-changelog-row! conn changelog-table "aeiagus09e" "dep-new" 2)
            (insert-changelog-row! conn changelog-table "12345" "dep-new" 3)
            (jdbc/execute! {:connection conn}
                           [(format (str "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype, deployment_id) "
                                         "VALUES ('v44.00-042', 't', 'migrations/001_update_migrations.yaml', CURRENT_TIMESTAMP, 1, 'EXECUTED', 'dep-old')")
                                    changelog-table)])
            (jdbc/execute! {:connection conn}
                           [(format "UPDATE %s SET filename = 'migrations/2026/foo.yaml' WHERE id IN ('aeiagus09e', '12345')" changelog-table)])
            (liquibase/consolidate-liquibase-changesets! conn liquibase)
            (is (= "migrations/000_legacy_migrations.yaml" (filename-of "v44.00-042"))
                "the legacy v44 changeset is rewritten to the consolidated legacy filename")
            (is (= "migrations/2026/foo.yaml" (filename-of "aeiagus09e"))
                "the version-less changeset's filename is left untouched")
            (is (= "migrations/2026/foo.yaml" (filename-of "12345"))
                "an all-digit version-less id in a year directory is recognized by its path, not mistaken for pre-4.2")))))))

(deftest dev-default-rollback-targets-previous-deployment-test
  (testing "in dev (synthetic versions) `migrate down` with no target rolls back the last deployment, not a no-op"
    ;; Regression: dev's synthetic current-recorded-major is max(recorded)+1, so `dec` of it targeted the *current*
    ;; state (a no-op). The default target now steps back from the schema's latest recorded major instead.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db              (.getDatabase liquibase)
                changelog-table (liquibase/changelog-table-name liquibase)
                versions-table  liquibase/databasechangelog-versions-table
                now             (java.time.Instant/now)
                ago             (fn [m] (.minus now (java.time.Duration/ofMinutes m)))]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            ;; two dev "restarts": a base deployment and then a new-migration deployment with the next synthetic version
            (insert-changelog-row! conn changelog-table "base01"   "dev1000" 1)
            (insert-changelog-row! conn changelog-table "newmig01" "dev1001" 2)
            (insert-version-row! conn versions-table "dev1000" "x.1000.0.0" (ago 20))
            (insert-version-row! conn versions-table "dev1001" "x.1001.0.0" (ago 10))
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "vLOCAL_DEV")]
              (testing "current-schema-major is the latest recorded major, not the next synthetic one"
                (is (= 1001 (liquibase/current-schema-major conn db)))
                (is (< 1001 (liquibase/current-recorded-major)) "current-recorded-major is the next synthetic version"))
              (liquibase/rollback-major-version! conn liquibase false)
              (is (empty? (jdbc/query {:connection conn} [(format "SELECT 1 FROM %s WHERE id = 'newmig01'" changelog-table)]))
                  "the most recent deployment's changeset was rolled back")
              (is (seq (jdbc/query {:connection conn} [(format "SELECT 1 FROM %s WHERE id = 'base01'" changelog-table)]))
                  "the earlier deployment is retained"))))))))

(deftest record-legacy-version-tracking-test
  (testing "record-legacy-version-tracking! tags the deployment that ran migrations, so older binaries read the right major"
    ;; Older (pre-version-less) binaries detect an unsupported downgrade via latest-applied-major-version (id LIKE 'v%')
    ;; and know nothing about databasechangelog_version. This row keeps that signal accurate once migrations ship as
    ;; version-less changesets.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db      (.getDatabase liquibase)
                ct      (liquibase/changelog-table-name liquibase)
                rows    (fn [] (mapv :id (jdbc/query {:connection conn}
                                                     [(format "SELECT id FROM %s WHERE id LIKE 'v%%.legacy-version-tracking' ORDER BY id" ct)])))
                dep-of  (fn [id] (:deployment_id (first (jdbc/query {:connection conn}
                                                                    [(format "SELECT deployment_id FROM %s WHERE id = ?" ct) id]))))]
            (insert-changelog-row! conn ct "c64" "d64" 1)
            (testing "records the row against the deployment that ran, and latest-applied-major-version reads it"
              (liquibase/record-legacy-version-tracking! db 64 "d64")
              (is (= ["v64.legacy-version-tracking"] (rows)))
              (is (= "d64" (dep-of "v64.legacy-version-tracking"))
                  "shares the deployment_id, so the normal rollback path removes it with its deployment")
              (is (= 64 (liquibase/latest-applied-major-version conn db))))
            (testing "idempotent for a major that already has a row (a pre-existing row never fails an upgrade)"
              (liquibase/record-legacy-version-tracking! db 64 "d64")
              (liquibase/record-legacy-version-tracking! db 64 "dOther")
              (is (= ["v64.legacy-version-tracking"] (rows))))
            (testing "a new major adds its own row; earlier majors' rows are deliberately kept"
              (insert-changelog-row! conn ct "c65" "d65" 2)
              (liquibase/record-legacy-version-tracking! db 65 "d65")
              (is (= ["v64.legacy-version-tracking" "v65.legacy-version-tracking"] (rows)))
              (is (= 65 (liquibase/latest-applied-major-version conn db))
                  "older binaries read the highest, i.e. the current major"))
            (testing "synthetic/dev majors are skipped -- no older binaries to protect"
              (liquibase/record-legacy-version-tracking! db 1000 "d65")
              (is (= ["v64.legacy-version-tracking" "v65.legacy-version-tracking"] (rows))))))))))

(deftest legacy-version-tracking-removed-by-rollback-test
  (testing "rolling back several majors (65 -> 63) removes the v64 and v65 rows with their deployments, leaving v63"
    ;; No special handling: each row belongs to the deployment that created it, so delete-deployment-rows! sweeps it up.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)
                vt liquibase/databasechangelog-versions-table
                now (java.time.Instant/now)
                ago (fn [m] (.minus now (java.time.Duration/ofMinutes m)))
                rows (fn [] (mapv :id (jdbc/query {:connection conn}
                                                  [(format "SELECT id FROM %s WHERE id LIKE 'v%%.legacy-version-tracking' ORDER BY id" ct)])))
                deps (fn [] (set (map :deployment_id
                                      (jdbc/query {:connection conn} [(format "SELECT DISTINCT deployment_id FROM %s" ct)]))))]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            ;; three upgrades, each its own deployment, each tagging itself
            (insert-changelog-row! conn ct "c63" "d63" 1)
            (liquibase/record-legacy-version-tracking! db 63 "d63")
            (insert-changelog-row! conn ct "c64" "d64" 2)
            (liquibase/record-legacy-version-tracking! db 64 "d64")
            (insert-changelog-row! conn ct "c65" "d65" 3)
            (liquibase/record-legacy-version-tracking! db 65 "d65")
            (insert-version-row! conn vt "d63" "x.63.0.0" (ago 30))
            (insert-version-row! conn vt "d64" "x.64.0.0" (ago 20))
            (insert-version-row! conn vt "d65" "x.65.0.0" (ago 10))
            (is (= ["v63.legacy-version-tracking" "v64.legacy-version-tracking" "v65.legacy-version-tracking"] (rows)))
            (is (= 65 (liquibase/latest-applied-major-version conn db)) "older binaries see 65 before the downgrade")
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.65.0")]
              ;; 63 is two majors back, so it is outside the default window -- force widens it to the full history
              (liquibase/rollback-major-version! conn liquibase true "63"))
            (is (= ["v63.legacy-version-tracking"] (rows))
                "the v64 and v65 rows were removed along with their deployments -- no special handling needed")
            (is (= 63 (liquibase/latest-applied-major-version conn db)) "older binaries now correctly see 63")
            (is (= #{"d63"} (deps)) "only the v63 deployment remains")))))))

(deftest rollback-failure-preserves-history-test
  (testing "a rollback that cannot reverse a changeset throws and leaves the deployment's history intact"
    ;; Otherwise we would clear the deployment's rows -- including its legacy-version-tracking row -- while the schema
    ;; is still (partly) at the higher major, so an older binary would read the lower major and start against it.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)
                vt liquibase/databasechangelog-versions-table
                now (java.time.Instant/now)
                ago (fn [m] (.minus now (java.time.Duration/ofMinutes m)))
                has? (fn [id] (boolean (seq (jdbc/query {:connection conn}
                                                        [(format "SELECT 1 FROM %s WHERE id = ?" ct) id]))))]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            (insert-changelog-row! conn ct "c63" "d63" 1)
            (insert-changelog-row! conn ct "c64" "d64" 2)
            (liquibase/record-legacy-version-tracking! db 64 "d64")
            (insert-version-row! conn vt "d63" "x.63.0.0" (ago 20))
            (insert-version-row! conn vt "d64" "x.64.0.0" (ago 10))
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.64.0")
                          ;; simulate Liquibase failing to reverse one of the changesets
                          liquibase/run-liquibase-rollback! (fn [& _] ["c64"])]
              (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"could not roll back changeset"
                                            (liquibase/rollback-major-version! conn liquibase false "63")))]
                (if (= driver/*driver* :postgres)
                  (is (re-find #"left unchanged" (ex-message e))
                      "transactional DDL: the transaction rollback really does leave the database unchanged")
                  (is (re-find #"may (already )?have been committed" (ex-message e))
                      "auto-committing DDL: the error must not claim the database is unchanged"))))
            (testing "the deployment's history is left alone, so the changelog does not claim a rollback that failed"
              (is (has? "c64"))
              (is (has? "v64.legacy-version-tracking"))
              (is (= 64 (liquibase/latest-applied-major-version conn db))
                  "older binaries still see 64 -- the schema really is still at 64"))))))))

(deftest version-table-ordering-tiebreak-test
  (testing "current-schema-major resolves ties on deployed_at using the autoincrement id (the row inserted last wins)"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db   (.getDatabase liquibase)
                vt   liquibase/databasechangelog-versions-table
                same (java.time.Instant/parse "2020-01-01T00:00:00Z")]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            ;; identical deployed_at (this is all MySQL's second-precision timestamp can promise); the newer major is
            ;; inserted last, so its higher id must break the tie -- without it the "current major" would be arbitrary
            (insert-version-row! conn vt "old" "x.64.0.0" same)
            (insert-version-row! conn vt "new" "x.65.0.0" same)
            (is (= 65 (liquibase/current-schema-major conn db)))))))))

(deftest default-rollback-targets-previous-recorded-major-test
  (testing "the default `migrate down` target is the previous *recorded* major, even across a skipped major (63 -> 65)"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db  (.getDatabase liquibase)
                vt  liquibase/databasechangelog-versions-table
                now (java.time.Instant/now)
                ago (fn [m] (.minus now (java.time.Duration/ofMinutes m)))]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            ;; instance ran 63, then upgraded directly to 65 -- 64 was never a recorded deployment
            (insert-version-row! conn vt "d63" "x.63.0.0" (ago 20))
            (insert-version-row! conn vt "d65" "x.65.0.0" (ago 10))
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.65.0")]
              (is (= 63 (liquibase/previous-recorded-major conn db false))
                  "previous recorded major is 63, not (dec 65)=64 which was never deployed and would fail to resolve"))))))))

(deftest default-rollback-no-earlier-version-test
  (testing "the default `migrate down` no-ops (rather than throwing) when there is no earlier recorded major"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                vt liquibase/databasechangelog-versions-table]
            (liquibase/ensure-databasechangelog-versions-table! conn)
            ;; a single (e.g. fresh dev) deployment -- there is nothing earlier to roll back to
            (insert-version-row! conn vt "only" "x.1000.0.0" (java.time.Instant/now))
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "vLOCAL_DEV")]
              (is (nil? (liquibase/previous-recorded-major conn db false)))
              (is (nil? (liquibase/rollback-major-version! conn liquibase false))
                  "no earlier recorded version -> logs and returns without throwing"))))))))

(defn- versions-table-exists?*
  "Whether `databasechangelog_version` exists, checked without creating it. Unquoted DDL identifiers are folded to
  upper case by H2 and lower case by Postgres, so check both."
  [^java.sql.Connection conn]
  (boolean (or (liquibase/table-exists? "databasechangelog_version" conn)
               (liquibase/table-exists? "DATABASECHANGELOG_VERSION" conn))))

(deftest dev-consecutive-migration-runs-are-separate-deployments-test
  (testing "two `migrate up` runs in ONE process (a long-lived dev REPL) create separate deployments with successive
            synthetic versions, so `migrate down` reverts exactly the last run"
    ;; Regression: the deployment id was generated once per process (Liquibase root Scope) and the synthetic version
    ;; was memoized per process, so a fresh install plus a later dev migration in the same JVM merged into a single
    ;; deployment at x.1000 -- `migrate down` then had no earlier boundary and could not undo the added migration.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "vLOCAL_DEV")]
          (let [ct       (liquibase/changelog-table-name conn)
                applied? (fn [id] (boolean (seq (jdbc/query {:connection conn}
                                                            [(format "SELECT 1 FROM %s WHERE id = ?" ct) id]))))
                versions (fn [] (mapv :metabase_version
                                      (jdbc/query {:connection conn}
                                                  [(format "SELECT metabase_version FROM %s ORDER BY id"
                                                           liquibase/databasechangelog-versions-table)])))
                dep-of   (fn [id] (:deployment_id (first (jdbc/query {:connection conn}
                                                                     [(format "SELECT deployment_id FROM %s WHERE id = ?" ct) id]))))]
            (with-redefs [liquibase/changelog-file "versionless-dev-run1.yaml"]
              (mdb/migrate! (mdb/data-source) :up))
            (is (true? (applied? "dev_run_a")))
            (is (= ["x.1000.0.0"] (versions)))
            ;; the developer adds a migration and runs `migrate up` again in the same process
            (with-redefs [liquibase/changelog-file "versionless-dev-run2.yaml"]
              (mdb/migrate! (mdb/data-source) :up)
              (is (true? (applied? "dev_run_b")))
              (is (= ["x.1000.0.0" "x.1001.0.0"] (versions))
                  "the second run computes and records the next synthetic version")
              (is (not= (dep-of "dev_run_a") (dep-of "dev_run_b"))
                  "each run is its own deployment, even within one process")
              (mdb/migrate! (mdb/data-source) :down)
              (is (false? (applied? "dev_run_b")) "migrate down reverts exactly the second run")
              (is (true? (applied? "dev_run_a")) "the first run's migration survives")
              (is (= ["x.1000.0.0"] (versions)) "the second run's version row is gone"))))))))

(deftest migrate-failure-clears-version-table-memo-test
  (testing "a failed migrate! forgets the in-memory 'version table already created' marker"
    ;; On Postgres DDL is transactional: when migrate!'s transaction rolls back, the lazily-created
    ;; databasechangelog_version table is rolled back with it. If the in-memory marker survived, every later insert
    ;; in this process would fail with 'relation does not exist'. The DROP below simulates that rollback so the
    ;; mechanism is testable on every driver.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/ensure-databasechangelog-versions-table! conn)
        (is (true? (versions-table-exists?* conn)))
        (jdbc/execute! {:connection conn} [(format "DROP TABLE %s" liquibase/databasechangelog-versions-table)])
        (mt/with-dynamic-fn-redefs [liquibase/migrate-up-if-needed! (fn [& _] (throw (ex-info "boom" {})))]
          (is (thrown-with-msg? Exception #"boom" (mdb/migrate! (mdb/data-source) :up))))
        (liquibase/ensure-databasechangelog-versions-table! conn)
        (is (true? (versions-table-exists?* conn))
            "after a failed migrate!, ensure-databasechangelog-versions-table! must re-create the table instead of trusting the stale marker")))))

(deftest compute-synthetic-version-read-only-test
  (testing "computing the synthetic version never creates the version table (it may run on read-only paths like `migrate print`)"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (is (= "x.1000.0.0" (#'liquibase/compute-synthetic-version conn))
            "a missing version table computes the floor")
        (is (false? (versions-table-exists?* conn))
            "the table must not be created as a side effect")))))

(deftest synthetic-version-advances-after-recording-test
  (testing "the dev synthetic version is always one past the highest recorded major, even within one process"
    ;; Deliberate design change: this used to be memoized per process ('stable within process'), but then a second
    ;; migration run in the same process recorded the SAME synthetic major as the first, collapsing the rollback
    ;; boundary between them. Each run must see the previous run's recording and compute the next major.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [_liquibase conn]
          (liquibase/ensure-databasechangelog-versions-table! conn)
          (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "vLOCAL_DEV")]
            (let [v (liquibase/current-recorded-version)]
              (is (= "x.1000.0.0" v) "first dev boot against an empty history")
              (is (= 1000 (liquibase/current-recorded-major)))
              (liquibase/record-deployment-version! conn "dep" v)
              (is (= "x.1001.0.0" (liquibase/current-recorded-version))
                  "after a run records its version, the next run computes the next synthetic major"))))))))

(deftest record-deployment-version-nil-guard-test
  (testing "recording with a nil deployment id (empty changelog) is a no-op instead of a NOT NULL violation"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/ensure-databasechangelog-versions-table! conn)
        (liquibase/record-deployment-version! conn nil "x.1.0")
        (is (empty? (jdbc/query {:connection conn}
                                [(format "SELECT 1 FROM %s" liquibase/databasechangelog-versions-table)])))))))

(deftest prod-synthetic-version-fallback-warns-test
  (testing "a prod-mode binary that cannot parse its own version tag logs loudly before recording synthetic versions"
    (mt/with-temp-empty-app-db [conn :h2]
      (liquibase/ensure-databasechangelog-versions-table! conn)
      (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "vUNKNOWN")
                    config/is-prod?        true]
        (mt/with-log-messages-for-level [messages :error]
          (is (= "x.1000.0.0" (liquibase/current-recorded-version))
              "still falls back to the synthetic version so the instance can run")
          (is (some #(re-find #"synthetic" (:message %)) (messages))
              "and logs an error explaining the degraded version tracking"))))))

(deftest rollback-does-not-reverse-reran-changesets-test
  (testing "migrate down must not reverse changesets that merely re-ran (RERAN) in the newer deployment"
    ;; Liquibase moves a re-executed changeset (runOnChange whose checksum changed, or anything re-run by `migrate
    ;; force`) into the CURRENT run's deployment: new deployment_id, new dateexecuted, exectype RERAN. Those rows are
    ;; positioned after the rollback boundary, but reversing them would strip schema objects that the rollback target
    ;; still needs (regression vs the id-major-based rollback on master, which never touched them). They must instead
    ;; be retained and reassigned to the boundary deployment, so the deployment bookkeeping stays consistent.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (let [ct       (liquibase/changelog-table-name conn)
              row-of   (fn [id] (first (jdbc/query {:connection conn}
                                                   [(format "SELECT deployment_id, exectype FROM %s WHERE id = ?" ct) id])))
              view-x   (fn [] (:x (first (jdbc/query {:connection conn} ["SELECT x FROM v_roc"]))))
              versions (fn [] (mapv :metabase_version
                                    (jdbc/query {:connection conn}
                                                [(format "SELECT metabase_version FROM %s ORDER BY id"
                                                         liquibase/databasechangelog-versions-table)])))]
          (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.65.0")
                        liquibase/changelog-file "versionless-roc-run1.yaml"]
            (mdb/migrate! (mdb/data-source) :up))
          (is (= 1 (view-x)))
          (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.66.0")
                        liquibase/changelog-file "versionless-roc-run2.yaml"]
            (mdb/migrate! (mdb/data-source) :up)
            (is (= 2 (view-x)))
            (is (= "RERAN" (:exectype (row-of "roc_view")))
                "sanity: the edited runOnChange changeset re-ran")
            (is (= (:deployment_id (row-of "roc_new")) (:deployment_id (row-of "roc_view")))
                "sanity: Liquibase moved the re-run changeset into the newer deployment")
            (mdb/migrate! (mdb/data-source) :down)
            (testing "the newer release's own changeset is reversed"
              (is (nil? (row-of "roc_new")))
              (is (thrown? Exception (jdbc/query {:connection conn} ["SELECT 1 FROM roc_new_table"]))))
            (testing "the re-run changeset is NOT reversed"
              (is (= 2 (view-x))
                  "the view survives (the rollback-target binary's own runOnChange update will restore its content)")
              (is (some? (row-of "roc_view")) "its changelog row is retained"))
            (testing "bookkeeping is consistent after the rollback"
              (is (= (:deployment_id (row-of "roc_base")) (:deployment_id (row-of "roc_view")))
                  "the retained row was reassigned to the boundary deployment")
              (is (= ["x.65.0"] (versions)) "the newer deployment's version row is gone")))
          (testing "booting the rollback-target binary heals the view content via normal runOnChange semantics"
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.65.0")
                          liquibase/changelog-file "versionless-roc-run1.yaml"]
              (mdb/migrate! (mdb/data-source) :up))
            (is (= 1 (view-x)))))))))

(deftest rollback-of-reran-only-deployment-test
  (testing "a deployment consisting ONLY of a re-run changeset can still be rolled back: the boundary steps back and
            the deployment's version row is removed, even though there is nothing to reverse"
    ;; The dev flow that produces this: edit just a runOnChange changeset (no new changesets) and re-run migrate up.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (let [ct       (liquibase/changelog-table-name conn)
              row-of   (fn [id] (first (jdbc/query {:connection conn}
                                                   [(format "SELECT deployment_id, exectype FROM %s WHERE id = ?" ct) id])))
              view-x   (fn [] (:x (first (jdbc/query {:connection conn} ["SELECT x FROM v_roc"]))))
              versions (fn [] (mapv :metabase_version
                                    (jdbc/query {:connection conn}
                                                [(format "SELECT metabase_version FROM %s ORDER BY id"
                                                         liquibase/databasechangelog-versions-table)])))]
          (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "vLOCAL_DEV")]
            (with-redefs [liquibase/changelog-file "versionless-roc-run1.yaml"]
              (mdb/migrate! (mdb/data-source) :up))
            (is (= ["x.1000.0.0"] (versions)))
            (with-redefs [liquibase/changelog-file "versionless-roc-run3.yaml"]
              (mdb/migrate! (mdb/data-source) :up)
              (is (= ["x.1000.0.0" "x.1001.0.0"] (versions)))
              (is (= "RERAN" (:exectype (row-of "roc_view")))
                  "sanity: the second run consists of exactly the re-run changeset")
              (mdb/migrate! (mdb/data-source) :down)
              (is (= ["x.1000.0.0"] (versions))
                  "the re-run-only deployment dissolves; the boundary steps back")
              (is (= (:deployment_id (row-of "roc_base")) (:deployment_id (row-of "roc_view")))
                  "the retained re-run row joins the boundary deployment")
              (is (= 3 (view-x)) "the view is not reversed")
              (mdb/migrate! (mdb/data-source) :down)
              (is (= ["x.1000.0.0"] (versions))
                  "a further down with no earlier boundary is a clean no-op"))))))))

(deftest force-migrate-writes-legacy-marker-test
  (testing "migrate force records the vNN.legacy-version-tracking marker just like a normal upgrade, so
            pre-versionless binaries can still detect a downgrade after a force upgrade"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.65.0")
                      liquibase/changelog-file "versionless-dev-run1.yaml"]
          (mdb/migrate! (mdb/data-source) :force))
        (let [ct     (liquibase/changelog-table-name conn)
              row    (fn [id] (first (jdbc/query {:connection conn}
                                                 [(format "SELECT deployment_id, orderexecuted FROM %s WHERE id = ?" ct) id])))
              marker (row "v65.legacy-version-tracking")]
          (is (some? marker) "force must leave the same old-binary downgrade signal as a normal upgrade")
          (is (= (:deployment_id (row "dev_run_a")) (:deployment_id marker))
              "as an ordinary in-range row of the deployment that ran the migrations")
          (liquibase/with-liquibase [liquibase conn]
            (is (= 65 (liquibase/latest-applied-major-version conn (.getDatabase liquibase)))
                "a pre-versionless binary's id scan now reads the upgraded major")))))))

(deftest rollback-failure-message-test
  (testing "the rollback-failure message only claims 'left unchanged' where transactional DDL makes that true"
    (let [msg (fn [db-type] (#'liquibase/rollback-failure-message db-type "64" ["c1" "c2"]))]
      (testing "every variant names the failed changesets"
        (doseq [db-type [:postgres :h2 :mysql]]
          (is (re-find #"could not roll back changeset\(s\) c1, c2" (msg db-type)) db-type)))
      (testing "Postgres rolls DDL back transactionally, so the database really is unchanged"
        (is (re-find #"left unchanged" (msg :postgres))))
      (testing "H2 and MySQL auto-commit DDL, so earlier steps may have persisted"
        (doseq [db-type [:h2 :mysql]]
          (is (not (re-find #"left unchanged" (msg db-type))) db-type)
          (is (re-find #"may (already )?have been committed" (msg db-type)) db-type))))))
