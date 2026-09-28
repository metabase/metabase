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
                             versions/databasechangelog-versions-table)])))

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
        (versions/current-recorded-version)
        (is (= 1 (count (filter #(re-find #"development version" (:message %)) (messages))))
            "only once per process -- it is consulted several times per boot")))))

(deftest ^:parallel extract-numbers-special-case-test
  (testing "the v56 changesets that shipped in v55 report 55"
    (is (= 55 (first (#'versions/extract-numbers "v56.2025-06-05T16:48:48"))))
    (is (= 55 (first (#'versions/extract-numbers "v56.2025-05-19T16:48:48"))))
    (is (= 60 (first (#'versions/extract-numbers "v60.ghdf99efd"))))))

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
              backfilled      (format "x.%d.0.0" latest)]
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
              latest          (format "x.%d.0.0" (highest-versioned-major liquibase))]
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
          (testing "only the current deployment gets a ran row, with the highest vNN. major"
            (is (= [["newer" latest true]] (version-rows conn))))
          (testing "deployed_at is populated for the backfilled row"
            (is (every? :deployed_at (jdbc/query {:connection conn}
                                                 [(format "SELECT deployed_at FROM %s" versions/databasechangelog-versions-table)]))))
          (testing "ensure is idempotent"
            (versions/ensure-version-tracking! conn db)
            (is (= 1 (count (version-rows conn)))))
          (testing "the older, unrecorded deployment is still a deployment, with no version"
            (is (= ["newer" "older"] (map :deployment-id (versions/recorded-deployments conn db))))
            (is (nil? (:ran-version (second (versions/recorded-deployments conn db)))))))))))

(deftest backfill-uses-highest-version-not-latest-executed-test
  (testing "the backfill records the highest major present, even when a lower-version changeset ran last (a back-ported patch)"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (liquibase/with-liquibase [liquibase conn]
          (let [db              (.getDatabase liquibase)
                changelog-table (liquibase/changelog-table-name liquibase)
                latest          (format "x.%d.0.0" (highest-versioned-major liquibase))]
            (migrate-without-recording! liquibase)
            (jdbc/execute! {:connection conn} [(format "UPDATE %s SET deployment_id = 'main'" changelog-table)])
            ;; a back-ported patch: a much lower-version changeset that EXECUTED LAST, in its own deployment
            (mdb.test-util/fabricate-history! conn changelog-table
                                              [{:deployment "patch" :changesets ["v44.patch-backport"]}])
            (versions/ensure-version-tracking! conn db)
            (is (= [["patch" latest true]] (version-rows conn))
                "the current deployment is the patch's, but its version is the highest major in the changelog")
            (is (= latest (versions/last-deployment-version conn db)))))))))

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
        (jdbc/execute! {:connection conn} [(format "DROP TABLE %s" versions/databasechangelog-versions-table)])
        (mt/with-dynamic-fn-redefs [liquibase/migrate-up-if-needed! (fn [& _] (throw (ex-info "boom" {})))]
          (is (thrown-with-msg? Exception #"boom" (mdb/migrate! (mdb/data-source) :up))))
        (mdb/migrate! (mdb/data-source) :up)
        (is (true? (versions/versions-table-exists? conn)))))))

(deftest mysql-ran-migrations-is-bit-test
  (testing "on MySQL/MariaDB ran_migrations is bit(1), like every other boolean column (see general-schema-tests)"
    (mt/test-driver :mysql
      (mt/with-temp-empty-app-db [conn :mysql]
        (liquibase/with-liquibase [liquibase conn]
          (versions/ensure-version-tracking! conn (.getDatabase liquibase)))
        (is (= "bit"
               (-> (jdbc/query {:connection conn}
                               ["SELECT data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'ran_migrations'"
                                versions/databasechangelog-versions-table])
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
                              versions/databasechangelog-versions-table])

                 (:h2 :postgres)
                 (jdbc/query {:connection conn}
                             [(str "SELECT data_type, datetime_precision FROM information_schema.columns "
                                   "WHERE LOWER(table_name) = ? AND LOWER(column_name) = 'deployed_at'")
                              versions/databasechangelog-versions-table])))]
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
                                  versions/databasechangelog-versions-table)])
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
    ;; and know nothing about databasechangelog_version. This row keeps that signal accurate once migrations ship as
    ;; version-less changesets.
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
            (mdb.test-util/fabricate-history! conn ct [{:deployment "d64" :changesets ["c64"]}])
            (testing "records the row against the deployment that ran, and latest-applied-major-version reads it"
              (versions/record-legacy-version-tracking! db 64 "d64")
              (is (= ["v64.legacy-version-tracking"] (markers)))
              (is (= "d64" (:deployment_id (row-of "v64.legacy-version-tracking")))
                  "shares the deployment_id, so the normal rollback path removes it with its deployment")
              (is (= (inc (:orderexecuted (row-of "c64"))) (:orderexecuted (row-of "v64.legacy-version-tracking")))
                  "at the next execution position, like a changeset Liquibase ran")
              (is (= (LiquibaseUtil/getBuildVersion) (:liquibase (row-of "v64.legacy-version-tracking")))
                  "stamped with the Liquibase version, like a changeset Liquibase ran")
              (is (= "Metabase v64 version marker (not a changeset)" (:description (row-of "v64.legacy-version-tracking")))
                  "with a description saying what the row is")
              (is (re-find (re-pattern (str "legacy-version-tracking[^;]*'" (LiquibaseUtil/getBuildVersion) "'"))
                           (versions/version-tracking-sql conn db))
                  "and so is the marker in the manual-upgrade SQL")
              (is (= 64 (versions/latest-applied-major-version conn db))))
            (testing "idempotent for a major that already has a row (a pre-existing row never fails an upgrade)"
              (versions/record-legacy-version-tracking! db 64 "d64")
              (versions/record-legacy-version-tracking! db 64 "dOther")
              (is (= ["v64.legacy-version-tracking"] (markers))))
            (testing "a new major adds its own row; earlier majors' rows are deliberately kept"
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d65" :changesets ["c65"]}])
              (versions/record-legacy-version-tracking! db 65 "d65")
              (is (= ["v64.legacy-version-tracking" "v65.legacy-version-tracking"] (markers)))
              (is (= 65 (versions/latest-applied-major-version conn db))
                  "older binaries read the highest, i.e. the current major"))
            (testing "the 1-arity records the running binary's major against the current deployment"
              (mdb.test-util/fabricate-history! conn ct [{:deployment "d66" :changesets ["c66"]}])
              (with-redefs [config/mb-version-info (tag "v0.66.0")]
                (versions/record-legacy-version-tracking! db))
              (is (= "d66" (:deployment_id (row-of "v66.legacy-version-tracking")))))
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
        (with-redefs [config/mb-version-info (tag "v0.65.0")
                      liquibase/changelog-file "versionless-dev-run1.yaml"]
          (mdb/migrate! (mdb/data-source) :force))
        (let [ct     (liquibase/changelog-table-name conn)
              row    (fn [id] (first (jdbc/query {:datasource (mdb/data-source)}
                                                 [(format "SELECT deployment_id, orderexecuted FROM %s WHERE id = ?" ct) id])))
              marker (row "v65.legacy-version-tracking")]
          (is (some? marker) "force must leave the same old-binary downgrade signal as a normal upgrade")
          (is (= (:deployment_id (row "dev_run_a")) (:deployment_id marker))
              "as an ordinary row of the deployment that ran the migrations")
          (liquibase/with-liquibase [liquibase conn]
            (is (= 65 (versions/latest-applied-major-version conn (.getDatabase liquibase)))
                "a pre-versionless binary's id scan now reads the upgraded major")))))))
