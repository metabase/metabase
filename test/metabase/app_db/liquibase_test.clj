(ns ^:mb/driver-tests metabase.app-db.liquibase-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.liquibase :as liquibase]
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

(deftest latest-available-major-version
  (mt/test-drivers #{:h2}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (is (< 52 (liquibase/latest-available-major-version liquibase)))))))

(deftest latest-applied-major-version
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (is (nil? (liquibase/latest-applied-major-version conn (.getDatabase liquibase))))
        (.update liquibase "")
        (is (< 52 (liquibase/latest-applied-major-version conn (.getDatabase liquibase))))))))

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

(deftest synthetic-version-stable-within-process-test
  (testing "current-recorded-version is memoized per app DB, so it stays stable even after the version is recorded"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [_liquibase conn]
          (liquibase/ensure-databasechangelog-versions-table! conn)
          (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "vLOCAL_DEV")]
            (let [v (liquibase/current-recorded-version)]
              (is (= "x.1000.0.0" v) "first dev boot against an empty history")
              (is (= 1000 (liquibase/current-recorded-major)))
              (liquibase/record-deployment-version! conn "dep" v)
              (is (= v (liquibase/current-recorded-version))
                  "same process keeps reporting its version, not max+1, after recording it"))))))))

(deftest databasechangelog-versions-recording-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db             (.getDatabase liquibase)
              versions-table liquibase/databasechangelog-versions-table]
          (liquibase/ensure-databasechangelog-versions-table! conn)
          (testing "no version is recorded before any migrations have run"
            (is (nil? (liquibase/last-deployment-version conn db))))
          (migrate-with-recording! liquibase)
          (testing "exactly one version row is recorded for the single deployment, with the running version"
            (let [rows (jdbc/query {:connection conn} [(format "SELECT deployment_id, metabase_version FROM %s" versions-table)])]
              (is (= 1 (count rows)))
              (is (= (liquibase/current-recorded-version) (-> rows first :metabase_version)))))
          (testing "last-deployment-version returns the recorded version"
            (is (= (liquibase/current-recorded-version) (liquibase/last-deployment-version conn db))))
          (testing "ensure-table! and recording are idempotent across a second (no-op) run"
            (liquibase/ensure-databasechangelog-versions-table! conn)
            (migrate-with-recording! liquibase)
            (is (= 1 (count (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s" versions-table)]))))))))))

(deftest record-version-with-no-changesets-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [versions-table  liquibase/databasechangelog-versions-table
              changelog-table (liquibase/changelog-table-name liquibase)
              version-rows    (fn [] (jdbc/query {:connection conn}
                                                 [(format "SELECT deployment_id, metabase_version FROM %s ORDER BY metabase_version" versions-table)]))]
          ;; fully migrate WITHOUT the recording listener, then attribute the changesets to a *previous* process so the
          ;; last real deployment_id differs from this JVM's (phantom) Liquibase deployment_id
          (liquibase/with-scope-locked liquibase (.update liquibase ""))
          (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'priorrun'" changelog-table)])
          (liquibase/ensure-databasechangelog-versions-table! conn)
          (is (empty? (version-rows)) "no version recorded yet")
          (testing "in dev (synthetic version) a no-op boot records nothing -- it is not a new deployment"
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "vLOCAL_DEV")]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (is (empty? (version-rows)) "the synthetic counter must not advance when nothing is deployed"))
          (testing "with a real version, a no-op boot marks the last real deployment with that version"
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.55.0")]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source))
              (let [rows (version-rows)]
                (is (= 1 (count rows)) "a version row is recorded even though no changesets ran")
                (is (= "priorrun" (-> rows first :deployment_id))
                    "the last real deployment is recorded, not this process's phantom deployment id")
                (is (= "x.55.0" (-> rows first :metabase_version))))
              (testing "running again with the same version does not add a duplicate row"
                (liquibase/migrate-up-if-needed! liquibase (mdb/data-source))
                (is (= 1 (count (version-rows)))))))
          (testing "a new real version on the same deployment adds another row (many versions per deployment_id)"
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.56.0")]
              (liquibase/migrate-up-if-needed! liquibase (mdb/data-source)))
            (let [rows (version-rows)]
              (is (= 2 (count rows)))
              (is (every? #(= "priorrun" (:deployment_id %)) rows)
                  "both versions are tied to the same deployment_id"))))))))

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
                latest (format "x.%d.0.0" (liquibase/latest-available-major-version liquibase))]
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
                latest-major    (liquibase/latest-available-major-version liquibase)]
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
            ;; current major is 101: x.101.2.3 is the current version, x.101.1.0 an earlier current-major patch, and
            ;; 100 the previous major (the upgrade boundary)
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.101.2.3")]
              (testing "valid-rollback-target? reflects the recorded deployment history"
                (is (true? (liquibase/valid-rollback-target? conn db "101.1.0")) "a full version recorded for the current major")
                (is (true? (liquibase/valid-rollback-target? conn db "101.2.3")) "the current version (a no-op)")
                (is (true? (liquibase/valid-rollback-target? conn db "100")) "the previous major version")
                (is (true? (liquibase/valid-rollback-target? conn db "101")) "a bare current major (resolves to the latest current-major deployment)")
                (is (false? (liquibase/valid-rollback-target? conn db "101.9.9")) "a current-major version that was never deployed")
                (is (false? (liquibase/valid-rollback-target? conn db "99")) "a major outside the window (only reachable with force)"))
              (testing "rolling back to an invalid target that would drop version-less changesets is rejected"
                (is (thrown-with-msg? IllegalArgumentException #"not a valid rollback target"
                                      (liquibase/rollback-major-version! conn liquibase false "101.9.9"))))
              (testing "rolling back to a full current-major version drops only the later deployment"
                (liquibase/rollback-major-version! conn liquibase false "101.1.0")
                (is (empty? (jdbc/query {:connection conn} [(format "SELECT id FROM %s WHERE deployment_id = 'd101b'" changelog-table)]))
                    "the d101b changesets (after x.101.1.0) were removed")
                (is (= 2 (count (jdbc/query {:connection conn} [(format "SELECT id FROM %s WHERE deployment_id = 'd101a'" changelog-table)])))
                    "the d101a changesets (the rollback target's deployment) are retained")
                (is (empty? (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s WHERE deployment_id = 'd101b'" versions-table)]))
                    "the d101b version row was deleted")
                (is (= 1 (count (jdbc/query {:connection conn} [(format "SELECT deployment_id FROM %s WHERE deployment_id = 'd101a'" versions-table)])))
                    "the d101a version row is retained"))
              (testing "rolling back to the previous major drops every current-major deployment"
                (liquibase/rollback-major-version! conn liquibase false "100")
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
              (is (= @#'liquibase/changelog-file (decide))))))))))

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
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"could not roll back changeset"
                                    (liquibase/rollback-major-version! conn liquibase false "63"))))
            (testing "the deployment's history is left alone, so the changelog does not claim a rollback that failed"
              (is (has? "c64"))
              (is (has? "v64.legacy-version-tracking"))
              (is (= 64 (liquibase/latest-applied-major-version conn db))
                  "older binaries still see 64 -- the schema really is still at 64"))))))))
