(ns metabase.app-db.liquibase.sqlite-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.liquibase.sqlite :as sqlite])
  (:import
   (java.nio.file Files)
   (java.sql Connection DriverManager)
   (java.util Properties)
   (liquibase LabelExpression)
   (liquibase.change.core RawSQLChange)
   (liquibase.changelog ChangeSet DatabaseChangeLog)))

(set! *warn-on-reflection* true)

(defn- connection ^Connection [path]
  (DriverManager/getConnection
   (str "jdbc:sqlite:" path)
   (doto (Properties.)
     (.setProperty "foreign_keys" "true")
     (.setProperty "busy_timeout" "1000")
     (.setProperty "transaction_mode" "IMMEDIATE"))))

(defn- query [conn sql]
  (jdbc/query {:connection conn} [sql]))

(defn- sql-change ^ChangeSet [^DatabaseChangeLog log id sql]
  (doto (ChangeSet. id "sqlite-test" false false "migrations/065/sqlite-tail-test.yaml" nil nil log)
    (.addChange (doto (RawSQLChange.) (.setSql sql)))))

(deftest baseline-and-reopen-test
  (let [path (Files/createTempFile "metabase-sqlite-baseline-" ".db" (make-array java.nio.file.attribute.FileAttribute 0))]
    (try
      (with-open [conn (connection path)]
        (liquibase/with-liquibase [lb conn]
          (.update lb "")
          (testing "one real baseline changeset, no fabricated historical history"
            (is (= [{:id "v65.2026-09-24T00:00:00-sqlite-baseline"}]
                   (query conn "SELECT id FROM DATABASECHANGELOG"))))
          (testing "the baseline version is the supported upgrade/downgrade floor"
            (is (= 65 (liquibase/latest-available-major-version lb)))
            (is (= 65 (liquibase/latest-applied-major-version conn (.getDatabase lb))))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot be downgraded"
                                  (liquibase/rollback-major-version! conn lb true 64))))
          (testing "constraints, seeds, Quartz tables, and every analytics view are present"
            (is (= [{:integrity_check "ok"}] (query conn "PRAGMA integrity_check")))
            (is (empty? (query conn "PRAGMA foreign_key_check")))
            (is (= [{:name "Trash"}] (query conn "SELECT name FROM collection WHERE type='trash'")))
            (is (= 11 (:n (first (query conn "SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name LIKE 'qrtz_%'")))))
            (is (= 20 (:n (first (query conn "SELECT count(*) AS n FROM sqlite_schema WHERE type='view'")))))
            (doseq [{:keys [name]} (query conn "SELECT name FROM sqlite_schema WHERE type='view'")]
              (is (vector? (vec (query conn (str "SELECT * FROM \"" name "\" LIMIT 1")))) name))
            (is (thrown? java.sql.SQLException
                         (jdbc/execute! {:connection conn}
                                        ["INSERT INTO permissions_group_membership (user_id,group_id) VALUES (-1,1)"]))))
          (testing "new changesets in an older directory still run normally on populated SQLite"
            (let [log (.getDatabaseChangeLog lb)]
              (.addChangeSet log (sql-change log "v65.2026-09-25T00:00:00"
                                             "ALTER TABLE collection ADD COLUMN sqlite_upgrade_test TEXT"))
              (.addChangeSet log (sql-change log "v65.2026-09-25T00:00:01"
                                             "UPDATE collection SET sqlite_upgrade_test='preserved' WHERE type='trash'"))
              (sqlite/remove-baselined-changesets! log)
              (.update lb "")
              (is (= [{:sqlite_upgrade_test "preserved"}]
                     (query conn "SELECT sqlite_upgrade_test FROM collection WHERE type='trash'")))))))
      (with-open [conn (connection path)]
        (liquibase/with-liquibase [lb conn]
          (testing "reopening preserves data and does not replay the baseline"
            (is (empty? (.listUnrunChangeSets lb nil (LabelExpression.))))
            (.update lb "")
            (is (= [{:sqlite_upgrade_test "preserved"}]
                   (query conn "SELECT sqlite_upgrade_test FROM collection WHERE type='trash'")))
            (is (= 3 (:n (first (query conn "SELECT count(*) AS n FROM DATABASECHANGELOG"))))))))
      (finally
        (Files/deleteIfExists path)))))

(deftest failed-migration-rollback-test
  (with-open [conn (connection ":memory:")]
    (liquibase/with-liquibase [lb conn]
      (.update lb "")
      (let [log (.getDatabaseChangeLog lb)
            change (sql-change log "v65.2026-09-25T00:00:02"
                               "CREATE TABLE failed_migration_probe (id INTEGER); INSERT INTO missing_table VALUES (1)")]
        (.addChangeSet log change)
        (is (thrown? liquibase.exception.LiquibaseException (.update lb "")))
        (is (empty? (query conn "SELECT name FROM sqlite_schema WHERE name='failed_migration_probe'")))
        (is (= 1 (:n (first (query conn "SELECT count(*) AS n FROM DATABASECHANGELOG")))))
        (.setSql ^RawSQLChange (first (.getChanges change)) "CREATE TABLE failed_migration_probe (id INTEGER)")
        (.update lb "")
        (is (= [{:name "failed_migration_probe"}]
               (query conn "SELECT name FROM sqlite_schema WHERE name='failed_migration_probe'")))))))

(deftest exact-baseline-identity-test
  (let [log (DatabaseChangeLog.)
        historical (ChangeSet. "v00.00-000" "qnkhuat" false false "migrations/001_update_migrations.yaml" nil nil log)
        same-id-other-author (ChangeSet. "v00.00-000" "new-author" false false "migrations/001_update_migrations.yaml" nil nil log)
        new-tail (sql-change log "v65.2026-09-25T00:00:03" "SELECT 1")]
    (doseq [change [historical same-id-other-author new-tail]] (.addChangeSet log change))
    (sqlite/remove-baselined-changesets! log)
    (is (= [same-id-other-author new-tail] (vec (.getChangeSets log))))))

(deftest single-writer-migration-test
  (with-open [conn (connection ":memory:")]
    (.setAutoCommit conn false)
    (liquibase/with-liquibase [lb conn]
      (let [source (reify javax.sql.DataSource
                     (getConnection [_]
                       (throw (AssertionError. "SQLite migration must reuse its writer connection")))
                     (getConnection [_ _ _]
                       (throw (AssertionError. "SQLite migration must reuse its writer connection"))))]
        (liquibase/migrate-up-if-needed! lb source)
        (liquibase/migrate-up-if-needed! lb source)
        (is (= 1 (:n (first (query conn "SELECT count(*) AS n FROM DATABASECHANGELOG")))))))))

(deftest analytics-alert-schedule-test
  (with-open [conn (connection ":memory:")]
    (liquibase/with-liquibase [lb conn]
      (.update lb ""))
    (doseq [sql ["INSERT INTO notification_card (id,send_condition) VALUES (1,'has_result')"
                 "INSERT INTO notification (id,payload_type,payload_id,created_at,updated_at) VALUES (1,'notification/card',1,'2026-09-24 00:00:00.000000','2026-09-24 00:00:00.000000')"
                 "INSERT INTO notification_subscription (id,notification_id,type,created_at) VALUES (1,1,'notification-subscription/cron','2026-09-24 00:00:00.000000')"]]
      (jdbc/execute! {:connection conn} [sql]))
    (doseq [[cron display expected]
            [["0 0/5 * * * ?" nil ["by the minute" nil nil]]
             ["0 0 * * * ?" nil ["hourly" nil nil]]
             ["0 0 9 * * ?" nil ["daily" nil 9]]
             ["0 0 9 ? * 2" nil ["weekly" "mon" 9]]
             ["0 0 9 15 * ?" nil ["monthly" nil 9]]
             ["0 0 9 1 * 2#1" nil ["monthly" "mon" 9]]
             ["0 0 0/8 * * ?" nil ["daily" nil 0]]
             ["0 0 9 * * ?" "cron/raw" ["custom" nil 9]]]]
      (testing (str cron " / " display)
        (jdbc/execute! {:connection conn}
                       ["UPDATE notification_subscription SET cron_schedule=?,ui_display_type=? WHERE id=1" cron display])
        (is (= expected
               ((juxt :schedule_type :schedule_day :schedule_hour)
                (first (query conn "SELECT schedule_type,schedule_day,schedule_hour FROM v_alerts")))))))))
