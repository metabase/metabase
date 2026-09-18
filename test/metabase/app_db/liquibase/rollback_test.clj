(ns ^:mb/driver-tests metabase.app-db.liquibase.rollback-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.liquibase.rollback :as rollback]
   [metabase.app-db.liquibase.versions :as versions]
   [metabase.app-db.schema-migrations-test.impl :as schema-migrations.impl]
   [metabase.app-db.test-util :as mdb.test-util]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.test :as mt])
  (:import
   (liquibase.changelog ChangeSet)))

(set! *warn-on-reflection* true)

(defn- tag [s] (assoc config/mb-version-info :tag s))

(defn- changelog-ids
  "The ids in the changelog, in execution order."
  [conn changelog-table]
  (mapv :id (jdbc/query {:connection conn}
                        [(format "SELECT id FROM %s ORDER BY dateexecuted, orderexecuted" changelog-table)])))

(defn- has-changeset? [conn changelog-table id]
  (boolean (seq (jdbc/query {:connection conn} [(format "SELECT 1 FROM %s WHERE id = ?" changelog-table) id]))))

(defn- deployment-of [spec changelog-table id]
  (:deployment_id (first (jdbc/query spec [(format "SELECT deployment_id FROM %s WHERE id = ?" changelog-table) id]))))

(defn- changelog-deployments
  "The set of deployment_ids with any changelog row."
  [conn changelog-table]
  (set (map :deployment_id (jdbc/query {:connection conn} [(format "SELECT DISTINCT deployment_id FROM %s" changelog-table)]))))

(defn- version-deployments
  "The set of deployment_ids with any version row."
  [conn]
  (set (map :deployment_id (jdbc/query {:connection conn}
                                       [(format "SELECT DISTINCT deployment_id FROM %s" versions/databasechangelog-versions-table)]))))

(defn- versions-recorded
  "Every recorded version string, in insertion order, read on a fresh connection."
  []
  (mapv :metabase_version (jdbc/query {:datasource (mdb/data-source)}
                                      [(format "SELECT metabase_version FROM %s ORDER BY id" versions/databasechangelog-versions-table)])))

(defn- rollback-last-deployment!
  "What `dev.migrate/rollback! :last-deployment` does: roll back everything after the second-newest deployment, in
  its own transaction. Returns the boundary deployment id, or nil when there was nothing earlier to roll back to."
  []
  (with-open [conn (.getConnection ^javax.sql.DataSource (mdb/data-source))]
    (.setAutoCommit conn false)
    (liquibase/with-liquibase [liquibase conn]
      (let [db       (.getDatabase liquibase)
            _        (versions/ensure-version-tracking! conn db)
            boundary (versions/previous-deployment-id conn db)]
        (when boundary
          (rollback/rollback-to-deployment! conn liquibase boundary))
        (.commit conn)
        boundary))))

;;; ---------------------------------------------- target resolution ----------------------------------------------

(deftest rollback-target-resolution-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db (.getDatabase liquibase)
              ct (liquibase/changelog-table-name liquibase)]
          (versions/ensure-version-tracking! conn db)
          ;; a prior-major deployment, then two current-major ones
          (mdb.test-util/fabricate-history! conn ct
                                            [{:deployment "d99"   :ran "x.99.0.0"  :changesets ["z99"]}
                                             {:deployment "d100"  :ran "x.100.5.0" :changesets ["aaa111" "bbb222"]}
                                             {:deployment "d101a" :ran "x.101.1.0" :changesets ["ccc333" "ddd444"]}
                                             {:deployment "d101b" :ran "x.101.2.3" :changesets ["eee555" "fff666"]}])
          (testing "recorded majors in the window resolve"
            (is (= 101 (rollback/resolve-rollback-target conn db "101")) "the current major")
            (is (= 100 (rollback/resolve-rollback-target conn db 100)) "the previous major, as an integer too"))
          (testing "majors outside the window do not, unless forced"
            (is (nil? (rollback/resolve-rollback-target conn db "99")))
            (is (= 99 (rollback/resolve-rollback-target conn db "99" true))))
          (testing "never-recorded majors and point-release targets do not"
            (is (nil? (rollback/resolve-rollback-target conn db "102")))
            (is (nil? (rollback/resolve-rollback-target conn db "101.1.0")))
            (is (nil? (rollback/resolve-rollback-target conn db :nope))))
          (with-redefs [config/mb-version-info (tag "v0.101.2.3")]
            (testing "rolling back to an unsupported target is rejected"
              (is (thrown-with-msg? IllegalArgumentException #"not a valid rollback target"
                                    (rollback/rollback-major-version! conn liquibase false "101.1.0")))
              (is (thrown-with-msg? IllegalArgumentException #"not a valid rollback target"
                                    (rollback/rollback-major-version! conn liquibase false "99")))
              (is (= #{"d99" "d100" "d101a" "d101b"} (changelog-deployments conn ct)) "and nothing is dropped"))
            (testing "rolling back to the current major is a no-op: its latest deployment is the boundary"
              (rollback/rollback-major-version! conn liquibase false "101")
              (is (= #{"d99" "d100" "d101a" "d101b"} (changelog-deployments conn ct))))
            (testing "rolling back to the previous major drops every current-major deployment (their changesets are not
                      in the changelog file, so this exercises the supplemental delete path)"
              (rollback/rollback-major-version! conn liquibase false "100")
              (is (= #{"d99" "d100"} (changelog-deployments conn ct)))
              (is (= #{"d99" "d100"} (version-deployments conn)) "the dropped deployments' version rows go with them"))))))))

(deftest bare-major-rollback-targets-latest-deployment-of-major-test
  (testing "a bare-major target rolls back to the LATEST deployment of that major, whatever the recorded version format"
    ;; Regression: version strings of different lengths (a backfilled `x.64.0.0` vs a real-tag `x.64.9`) used to be
    ;; compared with Clojure's count-first vector sort, which resolved "64" to 64.0.0 and rolled back the 64.9 hotfix.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            ;; a pre-tracking install backfilled as x.64.0.0, then a 64.9 hotfix deployment, then the 65 upgrade
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "d64a" :ran "x.64.0.0" :changesets ["c64base"]}
                                               {:deployment "d64b" :ran "x.64.9"   :changesets ["c64hotfix"]}
                                               {:deployment "d65"  :ran "x.65.0"   :changesets ["c65"]}])
            (with-redefs [config/mb-version-info (tag "v0.65.0")]
              (rollback/rollback-major-version! conn liquibase false "64"))
            (is (= ["c64base" "c64hotfix"] (changelog-ids conn ct))
                "the 65 changeset was rolled back; the 64.9 hotfix (the latest 64 deployment) is retained")
            (is (= #{"d64a" "d64b"} (version-deployments conn)) "only the 65 version row was removed")))))))

(deftest booted-major-is-a-rollback-target-test
  (testing "a major recorded only as a boot row (it shipped no migrations) is still a valid rollback boundary"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            ;; d56 ran under x.56.0 and was later booted by 57 without migrations; d58 is the current major
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "d56" :ran "x.56.0" :booted ["x.57.0"] :changesets ["cs56"]}
                                               {:deployment "d58" :ran "x.58.0" :changesets ["cs58"]}])
            (with-redefs [config/mb-version-info (tag "v0.58.0")]
              (is (= 57 (rollback/resolve-rollback-target conn db "57"))
                  "57 never ran migrations here but is still a recorded boundary")
              (is (= 56 (rollback/resolve-rollback-target conn db "56")))
              (rollback/rollback-major-version! conn liquibase false "57")
              (is (= ["cs56"] (changelog-ids conn ct))
                  "the current-major deployment was rolled back and the booted deployment retained"))))))))

(deftest default-rollback-target-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (liquibase/with-liquibase [liquibase conn]
        (let [db (.getDatabase liquibase)
              ct (liquibase/changelog-table-name liquibase)]
          (versions/ensure-version-tracking! conn db)
          (mdb.test-util/fabricate-history! conn ct [{:deployment "only" :ran "x.65.0.0" :changesets ["c65"]}])
          (with-redefs [config/mb-version-info (tag "v0.65.0")]
            (testing "with no earlier recorded major the default `migrate down` no-ops rather than throwing"
              (is (nil? (rollback/rollback-major-version! conn liquibase false)))
              (is (= ["c65"] (changelog-ids conn ct))))
            (testing "otherwise it steps back to the previous recorded major, even across a skipped one (63 -> 65)"
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d66" :ran "x.66.0" :changesets ["c66"]}])
              (with-redefs [config/mb-version-info (tag "v0.66.0")]
                (rollback/rollback-major-version! conn liquibase false))
              (is (= ["c65"] (changelog-ids conn ct)))
              (is (= ["x.65.0.0"] (versions-recorded))))))))))

(deftest rollback-force-widens-to-full-history-test
  (testing "force widens the rollback window from the recent history to the full recorded history"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            ;; three majors deployed; 43 is two majors back from current, so it is outside the default window
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "d43" :ran "x.43.0.0" :changesets ["c43"]}
                                               {:deployment "d44" :ran "x.44.0.0" :changesets ["c44"]}
                                               {:deployment "d45" :ran "x.45.0.0" :changesets ["c45"]}])
            (with-redefs [config/mb-version-info (tag "v0.45.0.0")]
              (testing "without force, a target outside the window is rejected and nothing is dropped"
                (is (thrown-with-msg? IllegalArgumentException #"not a valid rollback target"
                                      (rollback/rollback-major-version! conn liquibase false "43")))
                (is (= #{"d43" "d44" "d45"} (changelog-deployments conn ct))))
              (testing "with force, the further-back target is reachable and drops the later majors"
                (rollback/rollback-major-version! conn liquibase true "43")
                (is (= #{"d43"} (changelog-deployments conn ct)) "only the major-43 deployment remains")
                (is (= #{"d43"} (version-deployments conn)) "the rolled-back deployments' version rows were also removed")))))))))

(deftest rollback-from-older-binary-guard-test
  (testing "a binary older than the schema refuses to roll back: its changelog cannot reverse the newer changesets,
            so proceeding would delete their bookkeeping and leave the schema silently corrupted"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "d64" :ran "x.64.0" :changesets ["c64"]}
                                               ;; a NEWER v65 binary ran a changeset that is NOT in this binary's changelog
                                               {:deployment "d65" :ran "x.65.0" :changesets ["future65cs"]}])
            (with-redefs [config/mb-version-info (tag "v0.64.0")]
              (testing "default `migrate down` throws instead of silently deleting the newer deployment's history"
                (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                      #"Cannot downgrade a database at version 65 from Metabase version 64"
                                      (rollback/rollback-major-version! conn liquibase false))))
              (testing "an explicit target throws too"
                (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                      #"Cannot downgrade a database at version 65"
                                      (rollback/rollback-major-version! conn liquibase false "64"))))
              (is (has-changeset? conn ct "future65cs") "nothing was deleted")
              (testing "force still allows it (the operator explicitly accepts the risk)"
                (rollback/rollback-major-version! conn liquibase true "64")
                (is (not (has-changeset? conn ct "future65cs")))))))))))

;;; ------------------------------------------ rolling back real deployments ----------------------------------------

(deftest rollback-after-upgrade-backfill-test
  (testing "an install upgraded from 53 to 55 backfills the old major, records the new one, and downgrades back to 53"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            ;; a "v53 install" upgraded over time: an older deployment (the 51->52 upgrade) plus the most recent one
            ;; whose last changeset is a v53.* id -- all from before version tracking, so nothing is recorded yet
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "d52older"   :changesets ["v51.2023-06-01T00:00:00" "v52.2023-12-01T00:00:00"]}
                                               {:deployment "d53install" :changesets ["v53.2024-06-01T00:00:00"]}])
            (testing "on 55 startup the backfill records only the current deployment, from its highest changeset id"
              (versions/ensure-version-tracking! conn db)
              (is (= #{"d53install"} (version-deployments conn)))
              (is (= "x.53.0.0" (versions/last-deployment-version conn db))))
            ;; then the 55 upgrade runs as its own deployment and records its version like a normal run
            (mdb.test-util/fabricate-history! conn ct [{:deployment "d55" :ran "x.55.2.0" :changesets ["v55.2024-10-01T00:00:00"]}])
            (with-redefs [config/mb-version-info (tag "v0.55.2.0")]
              (testing "53 is a valid rollback target (the previous major)"
                (is (= 53 (rollback/resolve-rollback-target conn db "53"))))
              (testing "downgrading to 53 rolls back the 55 deployment and keeps the rest of history"
                (rollback/rollback-major-version! conn liquibase false "53")
                (is (= #{"d52older" "d53install"} (changelog-deployments conn ct))
                    "the 53 install's changesets (including older unrecorded history) are retained")
                (is (= #{"d53install"} (version-deployments conn)) "the 55 version row was deleted")))))))))

(deftest migrate-up-backfills-pre-tracking-install-test
  (testing "the first `migrate up` on an install that predates version tracking backfills the pre-upgrade version,
            so `migrate down` still has a boundary to roll back to (CLI upgrades skip the boot-time checks)"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db      (.getDatabase liquibase)
                ct      (liquibase/changelog-table-name liquibase)
                all-ids (mapv (fn [^ChangeSet cs] (.getId cs))
                              (.getChangeSets (.getDatabaseChangeLog liquibase)))
                last-id (peek all-ids)
                stop-id (nth all-ids (- (count all-ids) 2))]
            ;; install everything except the last changeset, as a pre-version-tracking binary would have left it
            (schema-migrations.impl/run-migrations-in-range! conn ["v00.00-000" stop-id])
            (mdb.test-util/age-changelog-rows! {:datasource (mdb/data-source)} ct)
            ;; ... which had no version rows at all. The DELETE and all later reads use fresh autocommit connections:
            ;; on MySQL the shared non-autocommit `conn` would leave the DELETE invisible to the migration's own
            ;; connection and serve later reads from a stale REPEATABLE READ snapshot.
            (jdbc/execute! {:datasource (mdb/data-source)} [(format "DELETE FROM %s" versions/databasechangelog-versions-table)])
            (let [pre-major (versions/latest-applied-major-version conn db)]
              (with-redefs [config/mb-version-info (tag (format "v0.%d.0" (inc pre-major)))]
                (testing "migrate up records both the backfilled pre-upgrade version and the upgrade's own version"
                  (mdb/migrate! (mdb/data-source) :up)
                  (is (= [(format "x.%d.0.0" pre-major) (format "x.%d.0" (inc pre-major))] (versions-recorded))))
                (testing "migrate down (default) rolls the upgrade back"
                  (mdb/migrate! (mdb/data-source) :down)
                  (is (empty? (jdbc/query {:datasource (mdb/data-source)} [(format "SELECT 1 FROM %s WHERE id = ?" ct) last-id]))
                      "the upgrade's changeset was rolled back")
                  (is (= [(format "x.%d.0.0" pre-major)] (versions-recorded))
                      "the upgrade's version row was removed"))))))))))

(deftest legacy-version-tracking-removed-by-rollback-test
  (testing "rolling back several majors (65 -> 63) removes the v64 and v65 markers with their deployments, leaving v63"
    ;; No special handling: each marker belongs to the deployment that created it, so delete-deployment-rows! sweeps it up.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db      (.getDatabase liquibase)
                ct      (liquibase/changelog-table-name liquibase)
                markers (fn [] (filterv #(re-find #"legacy-version-tracking$" %) (changelog-ids conn ct)))]
            (versions/ensure-version-tracking! conn db)
            (doseq [major [63 64 65]
                    :let [dep (str "d" major)]]
              (mdb.test-util/fabricate-history! conn ct [{:deployment dep :ran (format "x.%d.0.0" major) :changesets [(str "c" major)]}])
              (versions/record-legacy-version-tracking! db major dep))
            (is (= ["v63.legacy-version-tracking" "v64.legacy-version-tracking" "v65.legacy-version-tracking"] (markers)))
            (is (= 65 (versions/latest-applied-major-version conn db)) "older binaries see 65 before the downgrade")
            (with-redefs [config/mb-version-info (tag "v0.65.0")]
              ;; 63 is two majors back, so it is outside the default window -- force widens it to the full history
              (rollback/rollback-major-version! conn liquibase true "63"))
            (is (= ["v63.legacy-version-tracking"] (markers)))
            (is (= 63 (versions/latest-applied-major-version conn db)) "older binaries now correctly see 63")
            (is (= #{"d63"} (changelog-deployments conn ct)) "only the v63 deployment remains")))))))

(deftest rollback-failure-preserves-history-test
  (testing "a rollback that cannot reverse a changeset throws and leaves the deployment's history intact"
    ;; Otherwise we would clear the deployment's rows -- including its legacy-version-tracking row -- while the schema
    ;; is still (partly) at the higher major, so an older binary would read the lower major and start against it.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "d63" :ran "x.63.0.0" :changesets ["c63"]}
                                               {:deployment "d64" :ran "x.64.0.0" :changesets ["c64"]}])
            (versions/record-legacy-version-tracking! db 64 "d64")
            (with-redefs [config/mb-version-info (tag "v0.64.0")
                          ;; simulate Liquibase failing to reverse one of the changesets
                          rollback/run-liquibase-rollback! (fn [& _] ["c64"])]
              (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"could not roll back changeset"
                                            (rollback/rollback-major-version! conn liquibase false "63")))]
                (if (= driver/*driver* :postgres)
                  (is (re-find #"left unchanged" (ex-message e))
                      "transactional DDL: the transaction rollback really does leave the database unchanged")
                  (is (re-find #"may (already )?have been committed" (ex-message e))
                      "auto-committing DDL: the error must not claim the database is unchanged"))))
            (testing "the deployment's history is left alone, so the changelog does not claim a rollback that failed"
              (is (has-changeset? conn ct "c64"))
              (is (has-changeset? conn ct "v64.legacy-version-tracking"))
              (is (= 64 (versions/latest-applied-major-version conn db))
                  "older binaries still see 64 -- the schema really is still at 64"))))))))

(deftest ^:parallel rollback-failure-message-test
  (testing "the rollback-failure message only claims 'left unchanged' where transactional DDL makes that true"
    (let [msg (fn [db-type] (#'rollback/rollback-failure-message db-type "64" ["c1" "c2"]))]
      (testing "every variant names the failed changesets"
        (doseq [db-type [:postgres :h2 :mysql]]
          (is (re-find #"could not roll back changeset\(s\) c1, c2" (msg db-type)) db-type)))
      (testing "Postgres rolls DDL back transactionally, so the database really is unchanged"
        (is (re-find #"left unchanged" (msg :postgres))))
      (testing "H2 and MySQL auto-commit DDL, so earlier steps may have persisted"
        (doseq [db-type [:h2 :mysql]]
          (is (not (re-find #"left unchanged" (msg db-type))) db-type)
          (is (re-find #"may (already )?have been committed" (msg db-type)) db-type))))))

(deftest rollback-warns-about-rows-it-cannot-reverse-test
  (testing "rows cleared by a rollback without a matching changeset to reverse are called out, not silently dropped"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "d64" :ran "x.64.0.0" :changesets ["base"]}
                                               {:deployment "d65" :ran "x.65.0.0" :changesets ["unknown_to_this_changelog"]}])
            (with-redefs [config/mb-version-info (tag "v0.65.0")]
              (mt/with-log-messages-for-level [messages :warn]
                (rollback/rollback-major-version! conn liquibase false "64")
                (is (some #(re-find #"could not be reversed.*unknown_to_this_changelog" (:message %)) (messages))
                    "names the row whose DDL (if any) is now orphaned")))
            (is (not (has-changeset? conn ct "unknown_to_this_changelog"))
                "its bookkeeping row is still cleared, as before")))))))

;;; ---------------------------------------------- the development rollback ----------------------------------------

(deftest rollback-to-deployment-test
  (testing "rollback-to-deployment! rolls back everything after the given deployment, whatever versions are recorded"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            ;; three dev "restarts", each its own deployment at the same constant dev version
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "dev1" :ran versions/dev-version :changesets ["base01"]}
                                               {:deployment "dev2" :ran versions/dev-version :changesets ["mig02"]}
                                               {:deployment "dev3" :ran versions/dev-version :changesets ["newmig03"]}])
            (with-redefs [config/mb-version-info (tag "vLOCAL_DEV")]
              (testing "the release rollback refuses a dev-migrated schema and points at the dev tooling"
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"development build.*dev.migrate"
                                      (rollback/rollback-major-version! conn liquibase false)))
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"development build.*dev.migrate"
                                      (rollback/rollback-major-version! conn liquibase true "9999"))
                    "even with force and an explicit target")
                (is (= ["base01" "mig02" "newmig03"] (changelog-ids conn ct)) "and changed nothing"))
              (testing "previous-deployment-id is the second-newest deployment"
                (is (= "dev2" (versions/previous-deployment-id conn db))))
              (rollback/rollback-to-deployment! conn liquibase "dev2")
              (is (= ["base01" "mig02"] (changelog-ids conn ct)) "only the newest deployment was rolled back")
              (is (= #{"dev1" "dev2"} (version-deployments conn)) "the rolled-back deployment's version row is gone")
              (testing "a second step back"
                (rollback/rollback-to-deployment! conn liquibase (versions/previous-deployment-id conn db))
                (is (= ["base01"] (changelog-ids conn ct)))
                (is (= #{"dev1"} (version-deployments conn))))
              (testing "with only one deployment left there is nothing earlier"
                (is (nil? (versions/previous-deployment-id conn db))))
              (testing "an unknown deployment id is refused"
                (is (thrown-with-msg? IllegalArgumentException #"nope.*not a deployment"
                                      (rollback/rollback-to-deployment! conn liquibase "nope")))))))))))

(deftest rollback-to-deployment-onto-a-release-install-test
  (testing "rolling a dev deployment back onto a release install leaves a schema the release rollback accepts again"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db (.getDatabase liquibase)
                ct (liquibase/changelog-table-name liquibase)]
            (versions/ensure-version-tracking! conn db)
            ;; a real v65 install, then a developer points a dev build at it and runs a new migration
            (mdb.test-util/fabricate-history! conn ct
                                              [{:deployment "d65"  :ran "x.65.0.0"           :changesets ["real65"]}
                                               {:deployment "dev1" :ran versions/dev-version :changesets ["devmig"]}])
            (with-redefs [config/mb-version-info (tag "vLOCAL_DEV")]
              (is (= "d65" (versions/previous-deployment-id conn db)))
              (rollback/rollback-to-deployment! conn liquibase "d65")
              (is (= ["real65"] (changelog-ids conn ct)) "the dev deployment was rolled back, the real install kept")
              (is (= 65 (versions/current-schema-major conn db)))
              (testing "the schema is at a real major again, so the release rollback works (nothing earlier here: no-op)"
                (is (nil? (rollback/rollback-major-version! conn liquibase false)))))))))))

(deftest rollback-to-deployment-repairs-rewritten-filenames-test
  (testing "the deployment rollback repairs version-less filenames an older binary rewrote, without relying on the
            release migrate! path having consolidated first (dev.migrate/rollback! does not go through migrate!)"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (with-redefs [liquibase/changelog-file "versionless-dev-run1.yaml"]
          (liquibase/with-liquibase [liquibase conn]
            (let [db (.getDatabase liquibase)
                  ct (liquibase/changelog-table-name liquibase)]
              (versions/ensure-version-tracking! conn db)
              ;; an earlier dev deployment to roll back to, then the dev changeset itself
              (mdb.test-util/fabricate-history! conn ct [{:deployment "dev1" :ran versions/dev-version :changesets ["boundary_row"]}])
              (liquibase/with-scope-locked liquibase (.update liquibase ""))
              (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'dev2' WHERE id = 'dev_run_a'" ct)])
              (versions/record-deployment-version! conn "dev2" versions/dev-version true)
              ;; what an old binary's consolidation leaves behind
              (jdbc/execute! {:connection conn} [(format "UPDATE %s SET filename = 'migrations/000_legacy_migrations.yaml' WHERE id = 'dev_run_a'" ct)])
              (mt/with-log-messages-for-level [messages :warn]
                (rollback/rollback-to-deployment! conn liquibase "dev1")
                (is (some #(re-find #"Restoring the changelog filename of version-less changeset dev_run_a" (:message %)) (messages)))
                (is (not-any? #(re-find #"could not be reversed" (:message %)) (messages))))
              (is (false? (versions/table-exists? "DEV_RUN_A_TABLE" conn)) "the DDL was reversed, not orphaned"))))))))

(deftest dev-consecutive-migration-runs-are-separate-deployments-test
  (testing "two `migrate up` runs in ONE process (a long-lived dev REPL) create separate deployments, so `migrate down`
            reverts exactly the last run"
    ;; Regression: the deployment id was generated once per process (Liquibase root Scope), so a fresh install plus a
    ;; later dev migration in the same JVM merged into a single deployment -- `migrate down` then had no earlier
    ;; boundary and could not undo the added migration.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (with-redefs [config/mb-version-info (tag "vLOCAL_DEV")]
          ;; reads use fresh autocommit connections: on MySQL the shared non-autocommit `conn` would serve reads
          ;; after the second migration from a stale REPEATABLE READ snapshot
          (let [ct       (liquibase/changelog-table-name conn)
                spec     {:datasource (mdb/data-source)}
                applied? (fn [id] (boolean (seq (jdbc/query spec [(format "SELECT 1 FROM %s WHERE id = ?" ct) id]))))]
            (with-redefs [liquibase/changelog-file "versionless-dev-run1.yaml"]
              (mdb/migrate! (mdb/data-source) :up))
            (is (true? (applied? "dev_run_a")))
            (is (= [versions/dev-version] (versions-recorded)))
            (mdb.test-util/age-changelog-rows! spec ct)
            ;; the developer adds a migration and runs `migrate up` again in the same process
            (with-redefs [liquibase/changelog-file "versionless-dev-run2.yaml"]
              (mdb/migrate! (mdb/data-source) :up)
              (is (true? (applied? "dev_run_b")))
              (is (= [versions/dev-version versions/dev-version] (versions-recorded))
                  "the second run records the same constant dev version against its own deployment")
              (is (not= (deployment-of spec ct "dev_run_a") (deployment-of spec ct "dev_run_b"))
                  "each run is its own deployment, even within one process")
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"development build.*dev.migrate"
                                    (mdb/migrate! (mdb/data-source) :down))
                  "the release `migrate down` refuses a dev-migrated schema and points at the dev tooling")
              (is (true? (applied? "dev_run_b")) "...without touching anything")
              (is (= (deployment-of spec ct "dev_run_a") (rollback-last-deployment!)))
              (is (false? (applied? "dev_run_b")) "the dev rollback reverts exactly the second run")
              (is (true? (applied? "dev_run_a")) "the first run's migration survives")
              (is (= [versions/dev-version] (versions-recorded)) "the second run's version row is gone"))))))))

;;; ------------------------------------------------- re-run changesets --------------------------------------------

(deftest rollback-does-not-reverse-reran-changesets-test
  (testing "migrate down must not reverse changesets that merely re-ran (RERAN) in the newer deployment"
    ;; Liquibase moves a re-executed changeset (runOnChange whose checksum changed, or anything re-run by `migrate
    ;; force`) into the CURRENT run's deployment: new deployment_id, new dateexecuted, exectype RERAN. Those rows are
    ;; positioned after the rollback boundary, but reversing them would strip schema objects that the rollback target
    ;; still needs. They must instead be retained and reassigned to the boundary deployment, so the deployment
    ;; bookkeeping stays consistent.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        ;; all reads go through a fresh autocommit connection: a read on the shared non-autocommit `conn` leaves an
        ;; open transaction whose lock on v_roc deadlocks the next migration's CREATE OR REPLACE VIEW on Postgres
        (let [ct     (liquibase/changelog-table-name conn)
              spec   {:datasource (mdb/data-source)}
              row-of (fn [id] (first (jdbc/query spec [(format "SELECT deployment_id, exectype FROM %s WHERE id = ?" ct) id])))
              view-x (fn [] (:x (first (jdbc/query spec ["SELECT x FROM v_roc"]))))]
          (with-redefs [config/mb-version-info (tag "v0.65.0")
                        liquibase/changelog-file "versionless-roc-run1.yaml"]
            (mdb/migrate! (mdb/data-source) :up))
          (is (= 1 (view-x)))
          (mdb.test-util/age-changelog-rows! spec ct)
          (with-redefs [config/mb-version-info (tag "v0.66.0")
                        liquibase/changelog-file "versionless-roc-run2.yaml"]
            (mdb/migrate! (mdb/data-source) :up)
            (is (= 2 (view-x)))
            (is (= "RERAN" (:exectype (row-of "roc_view"))) "sanity: the edited runOnChange changeset re-ran")
            (is (= (:deployment_id (row-of "roc_new")) (:deployment_id (row-of "roc_view")))
                "sanity: Liquibase moved the re-run changeset into the newer deployment")
            (mdb/migrate! (mdb/data-source) :down)
            (testing "the newer release's own changeset is reversed"
              (is (nil? (row-of "roc_new")))
              (is (thrown? Exception (jdbc/query spec ["SELECT 1 FROM roc_new_table"]))))
            (testing "the re-run changeset is NOT reversed"
              (is (= 2 (view-x)) "the view survives (the rollback-target binary's own runOnChange update will restore its content)")
              (is (some? (row-of "roc_view")) "its changelog row is retained"))
            (testing "bookkeeping is consistent after the rollback"
              (is (= (:deployment_id (row-of "roc_base")) (:deployment_id (row-of "roc_view")))
                  "the retained row was reassigned to the boundary deployment")
              (is (= ["x.65.0"] (versions-recorded)) "the newer deployment's version row is gone")))
          (testing "booting the rollback-target binary heals the view content via normal runOnChange semantics"
            (with-redefs [config/mb-version-info (tag "v0.65.0")
                          liquibase/changelog-file "versionless-roc-run1.yaml"]
              (mdb/migrate! (mdb/data-source) :up))
            (is (= 1 (view-x)))))))))

(deftest rollback-of-reran-only-deployment-test
  (testing "a deployment consisting ONLY of a re-run changeset can still be rolled back: the boundary steps back and
            the deployment's version row is removed, even though there is nothing to reverse"
    ;; The dev flow that produces this: edit just a runOnChange changeset (no new changesets) and re-run migrate up.
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        ;; reads use fresh autocommit connections -- see rollback-does-not-reverse-reran-changesets-test
        (let [ct     (liquibase/changelog-table-name conn)
              spec   {:datasource (mdb/data-source)}
              row-of (fn [id] (first (jdbc/query spec [(format "SELECT deployment_id, exectype FROM %s WHERE id = ?" ct) id])))
              view-x (fn [] (:x (first (jdbc/query spec ["SELECT x FROM v_roc"]))))]
          (with-redefs [config/mb-version-info (tag "vLOCAL_DEV")]
            (with-redefs [liquibase/changelog-file "versionless-roc-run1.yaml"]
              (mdb/migrate! (mdb/data-source) :up))
            (is (= [versions/dev-version] (versions-recorded)))
            (mdb.test-util/age-changelog-rows! spec ct)
            (with-redefs [liquibase/changelog-file "versionless-roc-run3.yaml"]
              (mdb/migrate! (mdb/data-source) :up)
              (is (= [versions/dev-version versions/dev-version] (versions-recorded)))
              (is (= "RERAN" (:exectype (row-of "roc_view"))) "sanity: the second run consists of exactly the re-run changeset")
              (rollback-last-deployment!)
              (is (= [versions/dev-version] (versions-recorded)) "the re-run-only deployment dissolves; the boundary steps back")
              (is (= (:deployment_id (row-of "roc_base")) (:deployment_id (row-of "roc_view")))
                  "the retained re-run row joins the boundary deployment")
              (is (= 3 (view-x)) "the view is not reversed")
              (is (nil? (rollback-last-deployment!)) "a further rollback with no earlier deployment is a clean no-op")
              (is (= [versions/dev-version] (versions-recorded))))))))))
