(ns metabase.app-db.setup-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.setup :as mdb.setup]
   [metabase.app-db.test-util :as mdb.test-util]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (liquibase.changelog ChangeSet)))

(set! *warn-on-reflection* true)

(deftest verify-db-connection-test
  (testing "Should be able to verify a DB connection"
    (testing "from a jdbc-spec map"
      (#'mdb.setup/verify-db-connection :h2 (mdb.data-source/broken-out-details->DataSource
                                             :h2
                                             {:subprotocol "h2"
                                              :subname     (format "mem:%s" (mt/random-name))
                                              :classname   "org.h2.Driver"})))
    (testing "from a connection URL"
      (#'mdb.setup/verify-db-connection :h2 (mdb.data-source/raw-connection-string->DataSource
                                             (format "jdbc:h2:mem:%s" (mt/random-name)))))))

(deftest supported-app-db-version?-test
  (testing "Should be able to check if an app DB is a supported version"
    (letfn [(test-supported-versions [db expected-min-version]
              (doseq [diff [nil {:major 1} {:minor 1} {:patch 1}]]
                (is (true? (#'mdb.setup/supported-app-db-version? db (merge-with + expected-min-version diff)))))
              (doseq [diff [{:major -1} {:minor -1} {:patch -1}]]
                (is (false? (#'mdb.setup/supported-app-db-version? db (merge-with + expected-min-version diff))))))]
      (test-supported-versions :h2 {:major 2 :minor 1 :patch 214})
      (test-supported-versions :postgres {:major 14 :minor 0 :patch 0})
      (test-supported-versions :mysql {:major 8 :minor 0 :patch 0})
      (test-supported-versions :mariadb {:major 10 :minor 6 :patch 0}))))

(deftest parse-db-version-test
  (testing "Can parse H2 version strings"
    (is (= {:major 2 :minor 1 :patch 214} (#'mdb.setup/parse-db-version "2.1.214 (2022-06-13)"))))
  (testing "Can parse postgres version strings"
    (is (= {:major 18 :minor 3 :patch 0} (#'mdb.setup/parse-db-version "18.3 (Debian 18.3-1.pgdg13+1)")))
    (is (= {:major 14 :minor 22 :patch 0} (#'mdb.setup/parse-db-version "14.22 (Debian 14.22-1.pgdg13+1)")))
    (is (= {:major 11 :minor 16 :patch 0} (#'mdb.setup/parse-db-version "11.16 (Debian 11.16-1.pgdg90+1)"))))
  (testing "Can parse mysql version strings"
    (is (= {:major 9 :minor 6 :patch 0} (#'mdb.setup/parse-db-version "9.6.0")))
    (is (= {:major 8 :minor 0 :patch 45} (#'mdb.setup/parse-db-version "8.0.45"))))
  (testing "Can parse mariadb version strings"
    (is (= {:major 12 :minor 2 :patch 2} (#'mdb.setup/parse-db-version "12.2.2-MariaDB-ubu2404")))))

(deftest setup-db-test
  (testing "Should be able to set up an arbitrary application DB"
    (letfn [(test* [data-source]
              (is (= :done
                     (mdb.setup/setup-db! :h2 data-source true true)))
              (is (= ["Administrators" "All Users" "All tenant users" "Data Analysts"]
                     (mapv :name (jdbc/query {:datasource data-source}
                                             "SELECT name FROM permissions_group ORDER BY name ASC;")))))]
      (let [subname (fn [] (format "mem:%s;DB_CLOSE_DELAY=10" (mt/random-name)))]
        (testing "from a jdbc-spec map"
          (test* (mdb.data-source/broken-out-details->DataSource
                  :h2
                  {:subprotocol "h2"
                   :subname     (subname)
                   :classname   "org.h2.Driver"})))
        (testing "from a connection URL"
          (test* (mdb.data-source/raw-connection-string->DataSource (str "jdbc:h2:" (subname)))))
        (testing "test `create-sample-content?` arg works"
          (doseq [create-sample-content? [true false]]
            (let [data-source (mdb.data-source/raw-connection-string->DataSource (str "jdbc:h2:" (subname)))]
              (mdb.setup/setup-db! :h2 data-source true create-sample-content?)
              (is (= (if create-sample-content?
                       ["E-commerce Insights"]
                       [])
                     (mapv :name (jdbc/query {:datasource data-source}
                                             "SELECT name FROM report_dashboard ORDER BY name ASC;")))))))))))

(deftest setup-fresh-db-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (testing "can setup a fresh db"
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (is (= :done
               (mdb.setup/setup-db! driver/*driver* (mdb.connection/data-source) true true)))
        (testing "migrations are executed in the order they are defined"
          (is (= (mdb.test-util/all-liquibase-ids false driver/*driver* conn)
                 (t2/select-pks-vec (liquibase/changelog-table-name conn) {:order-by [[:orderexecuted :asc]]}))))))))

(deftest setup-db-no-auto-migrate-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [_conn driver/*driver*]
      (testing "Running setup with `auto-migrate?`=false should pass if no migrations exist which need to be run"
        (is (= :done
               (mdb.setup/setup-db! driver/*driver* (mdb.connection/data-source) true false)))
        (is (= :done
               (mdb.setup/setup-db! driver/*driver* (mdb.connection/data-source) false false)))))
    (testing "Setting up DB with `auto-migrate?`=false should exit if any migrations exist which need to be run"
      ;; Use a migration file that intentionally errors with failOnError: false, so that a migration is still unrun
      ;; when we re-run `setup-db!`
      (with-redefs [liquibase/changelog-file "error-migration.yaml"]
        (mt/with-temp-empty-app-db [_conn driver/*driver*]
          (is (= :done
                 (mdb.setup/setup-db! driver/*driver* (mdb.connection/data-source) true false)))
          (is (thrown-with-msg?
               Exception
               #"Database requires manual upgrade."
               (mdb.setup/setup-db! driver/*driver* (mdb.connection/data-source) false false))))))))

(defn- update-to-changelog-id
  [change-log-id conn]
  (liquibase/with-liquibase [liquibase conn]
    (let [unrun-migrations (.listUnrunChangeSets liquibase nil nil)
          run-count        (loop [cnt        1
                                  changesets unrun-migrations]
                             (if (= (.getId ^ChangeSet (first changesets)) change-log-id)
                               cnt
                               (recur (inc cnt) (rest changesets))))]
      (.update liquibase ^Integer run-count nil))))

(deftest setup-a-mb-instance-running-version-lower-than-45
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (mt/with-dynamic-fn-redefs [liquibase/decide-liquibase-file (fn [& _args] @#'liquibase/changelog-legacy-file)]
        ;; set up a db in a way we have a MB instance running metabase 44
        (update-to-changelog-id "v44.00-000" conn))
      (is (= :done
             (mdb.setup/setup-db! driver/*driver* (mdb.connection/data-source) true false))))))

(deftest setup-a-mb-instance-running-version-greater-than-45
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (mt/with-dynamic-fn-redefs [liquibase/decide-liquibase-file (fn [& _args] @#'liquibase/changelog-legacy-file)]
        ;; set up a db in a way we have a MB instance running metabase 45
        (update-to-changelog-id "v45.00-001" conn))
      (is (= :done
             (mdb.setup/setup-db! driver/*driver* (mdb.connection/data-source) true false))))))

(deftest downgrade-detection-test
  ;; Simulates an existing instance that predates version tracking: it has no databasechangelog_version table, so
  ;; downgrade detection lazily backfills the recorded version from the changeset ids. A fresh DB is used per version
  ;; because `update-to-changelog-id` runs migrations without the recording listener -- the backfill snapshots the
  ;; state at first read, so reusing one DB across versions would not reflect later migrations.
  (mt/test-drivers #{:h2 :mysql :postgres}
    (doseq [version [45 46]]
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (update-to-changelog-id (format "v%d.00-001" version) conn)
        ;; pretend this binary is v0.44 -- older than the v45/v46 the DB was migrated to, so it must be a downgrade
        (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.44.0")]
          (is (thrown-with-msg?
               Exception (re-pattern (format "You must run `java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar migrate down` from version %d." version))
               (#'mdb.setup/error-if-downgrade-required! (mdb.connection/data-source)))))))))

(deftest downgrade-detection-recorded-version-test
  (testing "downgrade detection goes off the recorded version of the last deployment; a synthetic (dev) version warns"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (mdb.setup/setup-db! driver/*driver* (mdb.connection/data-source) true false)
        (liquibase/with-liquibase [liquibase conn]
          (let [db             (.getDatabase liquibase)
                versions-table liquibase/databasechangelog-versions-table
                ;; an arbitrary released major to play "this binary's version" -- every recorded version below is
                ;; fabricated relative to it (999 above it, 1000 the synthetic floor), so its exact value is irrelevant
                binary-major   64]
            (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag (format "v0.%d.0" binary-major))]
              (testing "a recorded synthetic (development) version does NOT block a real binary -- it only warns"
                (jdbc/execute! {:connection conn} [(format "UPDATE %s SET metabase_version = 'x.1000.0.0'" versions-table)])
                (is (= "x.1000.0.0" (liquibase/last-deployment-version conn db)))
                (is (nil? (#'mdb.setup/error-if-downgrade-required! (mdb.connection/data-source)))
                    "a dev build having touched the DB is the developer's problem, not a reason to refuse to boot"))
              (testing "a recorded real version newer than this binary is a genuine downgrade and blocks"
                (jdbc/execute! {:connection conn} [(format "UPDATE %s SET metabase_version = 'x.999.0'" versions-table)])
                (is (= "x.999.0" (liquibase/last-deployment-version conn db)))
                (is (thrown-with-msg?
                     Exception #"migrate down` from version 999"
                     (#'mdb.setup/error-if-downgrade-required! (mdb.connection/data-source)))))
              (testing "does not throw when the recorded version is not newer than this binary"
                (jdbc/execute! {:connection conn} [(format "UPDATE %s SET metabase_version = 'x.%d.0'" versions-table binary-major)])
                (is (nil? (#'mdb.setup/error-if-downgrade-required! (mdb.connection/data-source))))))))))))

(deftest noop-boot-of-newer-binary-preserves-downgrade-test
  (testing "a newer binary that boots without running any migrations must not block the previous binary from booting"
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        (mdb.setup/setup-db! driver/*driver* (mdb.connection/data-source) true false)
        (liquibase/with-liquibase [_liquibase conn]
          (let [versions-table liquibase/databasechangelog-versions-table
                ;; an arbitrary released major playing the installing binary's version; the newer binaries below are
                ;; fabricated relative to it, so its exact value is irrelevant
                latest         64]
            ;; make the recorded install version deterministic: this DB was installed by v0.<latest>
            (jdbc/execute! {:connection conn}
                           [(format "UPDATE %s SET metabase_version = 'x.%d.0'" versions-table latest)])
            (testing "a no-op boot of the NEXT major is recorded as history, but does not move the schema's version"
              (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag (format "v0.%d.0" (inc latest)))]
                (is (nil? (#'mdb.setup/error-if-downgrade-required! (mdb.connection/data-source))))
                (mdb.setup/migrate! (mdb.connection/data-source) :up))
              (is (= 1 (count (jdbc/query {:connection conn}
                                          [(format "SELECT 1 FROM %s WHERE metabase_version LIKE 'x.%d.%%'"
                                                   versions-table (inc latest))])))
                  "the newer major's boot is captured in history"))
            (testing "the previous binary still boots"
              (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag (format "v0.%d.0" latest))]
                (is (nil? (#'mdb.setup/error-if-downgrade-required! (mdb.connection/data-source))))))
            (testing "even a much newer stamp on the deployment cannot mask the version that ran it: the earliest row wins"
              (let [last-dep (:deployment_id (first (jdbc/query {:connection conn}
                                                                [(format "SELECT deployment_id FROM %s LIMIT 1" versions-table)])))]
                (jdbc/execute! {:connection conn}
                               [(format "INSERT INTO %s (deployment_id, metabase_version, deployed_at) VALUES (?, ?, ?)" versions-table)
                                last-dep
                                (format "x.%d.0" (+ latest 2))
                                (java.sql.Timestamp/from (.plus (java.time.Instant/now) (java.time.Duration/ofMinutes 5)))]))
              (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag (format "v0.%d.0" latest))]
                (is (nil? (#'mdb.setup/error-if-downgrade-required! (mdb.connection/data-source)))
                    "the stamp does not block the binary whose major actually ran the deployment")))))))))

(deftest downgrade-check-creates-persistent-version-table-test
  (testing "the version table lazily created during downgrade detection persists (committed) for other connections"
    ;; This guards the in-memory \"already created\" tracking in ensure-databasechangelog-versions-table!: if the
    ;; CREATE ran on a pooled, autocommit-off connection and were rolled back on close, a later connection that trusts
    ;; the in-memory flag would skip creation and then fail. Most relevant on Postgres (transactional DDL).
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        ;; simulate an existing instance (has changesets, no version table yet)
        (update-to-changelog-id "v45.00-001" conn)
        ;; latest-available >> 45, so this does NOT throw; it lazily creates + backfills the version table
        (#'mdb.setup/error-if-downgrade-required! (mdb.connection/data-source))
        (testing "version table exists and is populated when read from a separate connection"
          (is (seq (jdbc/query {:datasource (mdb.connection/data-source)}
                               [(format "SELECT deployment_id, metabase_version FROM %s"
                                        liquibase/databasechangelog-versions-table)]))))))))

(defn- versions-table-exists?*
  "Whether `databasechangelog_version` exists, checked without creating it. Unquoted DDL identifiers are folded to
  upper case by H2 and lower case by Postgres, so check both."
  [conn]
  (boolean (or (liquibase/table-exists? "databasechangelog_version" conn)
               (liquibase/table-exists? "DATABASECHANGELOG_VERSION" conn))))

(deftest migrations-sql-includes-version-tracking-test
  (testing "the manual-upgrade SQL (`migrate print`) records the version bookkeeping"
    ;; Regression: the version row and the vNN.legacy-version-tracking marker are written by the exec listener, which
    ;; only runs when Metabase itself executes the migrations. A manual `migrate print` + apply-the-SQL upgrade left
    ;; neither, silently disabling downgrade detection for both older binaries (which read the marker) and newer ones
    ;; (which read databasechangelog_version).
    (mt/test-drivers #{:h2 :mysql :postgres}
      (mt/with-temp-empty-app-db [conn driver/*driver*]
        ;; an existing pre-version-tracking install partway through history, with plenty of unrun changesets
        (update-to-changelog-id "v45.00-001" conn)
        (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.64.0")]
          (liquibase/with-liquibase [liquibase conn]
            (let [sql (liquibase/migrations-sql liquibase)]
              (testing "backfills the pre-upgrade version for the existing install"
                (is (re-find #"(?i)INSERT INTO databasechangelog_version[^;]+x\.45\.0\.0" sql)))
              (testing "records the upgrading version"
                (is (re-find #"(?i)INSERT INTO databasechangelog_version[^;]+x\.64\.0" sql)))
              (testing "adds the legacy version-tracking marker so older binaries detect downgrades"
                (is (re-find #"v64\.legacy-version-tracking" sql)))
              (testing "the version table is created by the printed SQL, not on the live database"
                (is (re-find #"(?i)CREATE TABLE IF NOT EXISTS databasechangelog_version" sql))
                (is (false? (versions-table-exists?* conn))
                    "`migrate print` must not mutate the database"))))))))
  (testing "a dev build's SQL records its synthetic version but never a marker"
    (mt/with-temp-empty-app-db [conn :h2]
      (update-to-changelog-id "v45.00-001" conn)
      (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "vLOCAL_DEV")]
        (liquibase/with-liquibase [liquibase conn]
          (let [sql (liquibase/migrations-sql liquibase)]
            (is (re-find #"(?i)INSERT INTO databasechangelog_version" sql))
            (is (not (re-find #"legacy-version-tracking" sql)))
            (is (false? (versions-table-exists?* conn))
                "computing the dev synthetic version on the print path must not create the table")))))))

(deftest changesets-from-later-version-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      ;; Run all real migrations first so the changelog table exists
      (mdb.setup/setup-db! driver/*driver* (mdb.connection/data-source) true false)
      (liquibase/with-liquibase [liquibase conn]
        (let [table    (liquibase/changelog-table-name liquibase)
              db-conn  {:connection conn}
              fake-ids ["v998.00-001" "v998.00-002" "v999.00-001"]]
          ;; Insert fake changelog entries for versions 998 and 999
          (doseq [[i id] (map-indexed vector fake-ids)]
            (jdbc/execute! db-conn
                           [(format "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype, md5sum)
                                     VALUES (?, 'test', 'test.yaml', CURRENT_TIMESTAMP, ?, 'EXECUTED', 'fake')"
                                    table)
                            id (+ 99990 i)]))
          ;; ... plus a version-less changeset applied by a later deployment: nothing in its id reveals its version,
          ;; only its deployment's recorded ran-version does
          (jdbc/execute! db-conn
                         [(format "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype, md5sum, deployment_id)
                                   VALUES ('zz_versionless_cs', 'test', 'migrations/2026/test.yaml', CURRENT_TIMESTAMP, 99993, 'EXECUTED', 'fake', 'futuredep')"
                                  table)])
          ;; ... plus an OLD changeset that merely re-ran (RERAN) under that later deployment (an edited runOnChange
          ;; changeset): it is not "from" the later version and must not be listed
          (jdbc/execute! db-conn
                         [(format "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype, md5sum, deployment_id)
                                   VALUES ('zz_reran_cs', 'test', 'migrations/2026/test.yaml', CURRENT_TIMESTAMP, 99994, 'RERAN', 'fake', 'futuredep')"
                                  table)])
          (liquibase/record-deployment-version! conn "futuredep" "x.999.1")
          (try
            (let [later (liquibase/changesets-from-later-version conn (.getDatabase liquibase) 997 999)]
              (testing "returns the versioned AND version-less changeset IDs in execution order"
                (is (= (conj fake-ids "zz_versionless_cs") later)))
              (testing "re-run (RERAN) rows of the later deployment are not listed"
                (is (not (some #{"zz_reran_cs"} later)))))
            (finally
              ;; Clean up fake rows
              (doseq [id (conj fake-ids "zz_versionless_cs" "zz_reran_cs")]
                (jdbc/execute! db-conn
                               [(format "DELETE FROM %s WHERE id = ?" table) id]))
              (jdbc/execute! db-conn
                             [(format "DELETE FROM %s WHERE deployment_id = 'futuredep'"
                                      liquibase/databasechangelog-versions-table)]))))))))

;; `delete!` below is ok in a parallel test since it's not actually executing anything
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(deftest ^:parallel build-query-dont-add-delete-from-when-query-contains-delete-test
  (testing "Workaround for https://github.com/camsaul/toucan2/issues/202"
    (is (= {:delete    [:field]
            :from      [[:metabase_field :field]]
            :left-join [[:metabase_table :table] [:= :field.table_id :table.id]]
            :where     [:= :table.db_id [:inline 0]]}
           (t2/build
             (t2/delete! :model/Field
                         {:delete    [:field]
                          :from      [[:metabase_field :field]]
                          :left-join [[:metabase_table :table]
                                      [:= :field.table_id :table.id]]
                          :where     [:= :table.db_id [:inline 0]]}))))))

;; `delete!` below is ok in a parallel test since it's not actually executing anything
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(deftest ^:parallel build-before-delete-query-test
  (testing "before-delete's select query should remove `:delete`/`:delete-from` (workaround for https://github.com/camsaul/toucan2/issues/203)"
    (is (= {:select [:*], :from [[:metabase_field :field]], :where [:= :field.id 0]}
           (t2/build
             (t2/select :model/Field
                        {:delete-from [:metabase_field :field]
                         :where       [:= :field.id 0]}))))
    (is (= {:select [:*], :from [[:metabase_field :field]], :where [:= :field.id 0]}
           (t2/build
             (t2/select :model/Field
                        {:delete [:field]
                         :from   [[:metabase_field :field]]
                         :where  [:= :field.id 0]}))))))
