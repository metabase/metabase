(ns ^:mb/driver-tests metabase.app-db.liquibase-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.liquibase.rollback :as rollback]
   [metabase.app-db.liquibase.versions :as versions]
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
      (let [data-source (->> (mt/dbdef->connection-details :mysql :db {:database-name "liquibase_test"})
                             (sql-jdbc.conn/connection-details->spec :mysql)
                             mdb.test-util/->ClojureJDBCSpecDataSource)]
        ;; the version-tracking tail of the printed SQL uses the application-db dialect, so the application db must
        ;; BE this MySQL database (as it is on every real path that prints migration SQL)
        (binding [mdb.connection/*application-db* (mdb.connection/application-db :mysql data-source)]
          (liquibase/with-liquibase [liquibase data-source]
            (testing "Make sure *every* line contains ENGINE ... CHARACTER SET ... COLLATE"
              (doseq [line  (split-migrations-sqls (liquibase/migrations-sql liquibase))
                      :when (str/starts-with? line "CREATE TABLE")]
                (is (true?
                     (or
                      (str/includes? line "ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                      (str/includes? line "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")))
                    (format "%s should include ENGINE ... CHARACTER SET ... COLLATE ..." (pr-str line)))))))))))

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
                (is (= liquibase/changelog-file (decide))
                    (str "version-less id " id " in a year directory"))))
            (testing "version-less ids -> modern changelog even without the path signal"
              (doseq [id ["aeiagus09e" "ccdevtest01" "09xyztest"]]
                (set-latest! id "f.yaml")
                (is (= liquibase/changelog-file (decide)) id)))
            (testing "genuinely pre-4.2 numeric ids and version < 45 ids -> legacy changelog (unchanged behavior)"
              (doseq [id ["316" "v44.00-042"]]
                (set-latest! id "migrations/000_legacy_migrations.yaml")
                (is (= @#'liquibase/changelog-legacy-file (decide)) id)))
            (testing "modern version ids and the v00 marker -> modern changelog (unchanged behavior)"
              (doseq [id ["v45.00-001" "v63.abc" "v00.00-000"]]
                (set-latest! id "migrations/001_update_migrations.yaml")
                (is (= liquibase/changelog-file (decide)) id)))
            (testing "version-numbered directories (060/) are NOT year directories"
              (set-latest! "v60.abc" "migrations/060/20260101_foo.yaml")
              (is (= liquibase/changelog-file (decide))))
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
              (is (= liquibase/changelog-file (decide))
                  "the v64 row (orderexecuted 2) outranks the legacy row at the same timestamp"))))))))

(defn- filename-of [conn changelog-table id]
  (:filename (first (jdbc/query {:connection conn} [(format "SELECT filename FROM %s WHERE id = ?" changelog-table) id]))))

(deftest consolidate-does-not-clobber-version-less-ids-test
  (testing "consolidate-liquibase-changesets! rewrites legacy ids' filenames but leaves version-less ids alone"
    ;; Regression: `consolidate` rewrote the filename of any id sorting before `v45.00-001`, which caught version-less
    ;; ids (e.g. `aeiagus09e` < `v45.00-001`) and pointed them at the legacy changelog file -> Liquibase then re-ran the
    ;; earliest migrations on the next boot.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [ct (liquibase/changelog-table-name liquibase)]
            ;; a legacy row (its filename ends with update_migrations.yaml) and two version-less rows in a year
            ;; directory that must not be touched
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "dep-old" :changesets [{:id "v44.00-042" :author "t" :filename "migrations/001_update_migrations.yaml"}]}
                                               {:deployment "dep-new" :changesets [{:id "aeiagus09e" :filename "migrations/2026/foo.yaml"}
                                                                                   {:id "12345"      :filename "migrations/2026/foo.yaml"}]}])
            (liquibase/consolidate-liquibase-changesets! conn liquibase)
            (is (= "migrations/000_legacy_migrations.yaml" (filename-of conn ct "v44.00-042"))
                "the legacy v44 changeset is rewritten to the consolidated legacy filename")
            (is (= "migrations/2026/foo.yaml" (filename-of conn ct "aeiagus09e"))
                "the version-less changeset's filename is left untouched")
            (is (= "migrations/2026/foo.yaml" (filename-of conn ct "12345"))
                "an all-digit version-less id in a year directory is recognized by its path, not mistaken for pre-4.2")))))))

(deftest consolidate-repairs-version-less-rows-rewritten-by-old-binaries-test
  (testing "consolidate-liquibase-changesets! restores the filename of version-less rows that a pre-version-less binary
            pointed at the legacy changelog"
    ;; Binaries before this change consolidate with an unguarded `WHEN ID < 'v45.00-001' THEN <legacy file>`, which
    ;; catches every version-less id sorting before `v` (most of them). Any `migrate` command of such a binary against
    ;; an upgraded DB -- even one that is then refused as a downgrade -- commits that rewrite via the lock release.
    ;; Left as-is, the newer binary's `migrate down` can no longer match those rows to its changelog: it clears their
    ;; bookkeeping without reversing their DDL, and the next upgrade fails with 'already exists'.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (with-redefs [liquibase/changelog-file "versionless-dev-run1.yaml"]
          (liquibase/with-liquibase [liquibase conn]
            (let [db     (.getDatabase liquibase)
                  ct     (liquibase/changelog-table-name liquibase)
                  legacy "migrations/000_legacy_migrations.yaml"]
              (versions/ensure-version-tracking! conn db)
              ;; the release deployment the dev changeset will be rolled back to, then the dev changeset itself
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d64" :ran "x.64.0.0" :changesets ["boundary_row"]}])
              (liquibase/with-scope-locked liquibase (.update liquibase ""))
              (is (= "migrations/2026/versionless_dev.yaml" (filename-of conn ct "dev_run_a")) "sanity: applied under its year-dir path")
              (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'd65' WHERE id = 'dev_run_a'" ct)])
              (versions/record-deployment-version! conn "d65" "x.65.0.0" true)
              ;; what an old binary's consolidation leaves behind, plus rows it must NOT touch: a pre-4.2 numeric id
              ;; that legitimately lives in the legacy file, the legacy-version-tracking marker, and a version-less row
              ;; that no longer exists in this changelog (nothing to repair it from)
              (jdbc/execute! {:connection conn} [(format "UPDATE %s SET filename = ? WHERE id = 'dev_run_a'" ct) legacy])
              (mdb.test-util/fabricate-history! conn ct
                                                [{:deployment "dep" :minutes-ago 0
                                                  :changesets [{:id "42" :author "legacy" :filename legacy}
                                                               {:id "v65.legacy-version-tracking" :author "version-tracking" :filename "legacy-version-tracking"}
                                                               {:id "gone_from_changelog" :filename legacy}]}])
              (liquibase/consolidate-liquibase-changesets! conn liquibase)
              (is (= "migrations/2026/versionless_dev.yaml" (filename-of conn ct "dev_run_a"))
                  "the version-less row is pointed back at the changelog file that defines it")
              (is (= legacy (filename-of conn ct "42")) "a pre-4.2 numeric id stays in the legacy file")
              (is (= "legacy-version-tracking" (filename-of conn ct "v65.legacy-version-tracking")) "the marker is untouched")
              (is (= legacy (filename-of conn ct "gone_from_changelog")) "a row with no changeset to repair from is left alone")
              (testing "and the repaired row is reversed by a rollback again"
                (jdbc/execute! {:connection conn} [(format "DELETE FROM %s WHERE deployment_id = 'dep'" ct)])
                (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.65.0")]
                  (rollback/rollback-major-version! conn liquibase false "64"))
                (is (false? (versions/table-exists? "DEV_RUN_A_TABLE" conn)) "the DDL was reversed, not orphaned")
                (is (nil? (filename-of conn ct "dev_run_a")))))))))))
