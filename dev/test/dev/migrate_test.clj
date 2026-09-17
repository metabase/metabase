(ns dev.migrate-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [dev.migrate :as dev.migrate]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.config.core :as config]
   [metabase.test :as mt]))

(deftest rollback-last-deployment-uses-version-tracking-test
  (testing "rollback! :last-deployment goes through the normal migrate down, so version rows and the marker are kept in step"
    (mt/with-temp-empty-app-db [_conn :h2]
      (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "vLOCAL_DEV")]
        (let [ct       (liquibase/changelog-table-name (mdb/data-source))
              applied? (fn [id] (boolean (seq (jdbc/query {:datasource (mdb/data-source)}
                                                          [(format "SELECT 1 FROM %s WHERE id = ?" ct) id]))))
              versions (fn [] (mapv :metabase_version
                                    (jdbc/query {:datasource (mdb/data-source)}
                                                [(format "SELECT metabase_version FROM %s ORDER BY id" liquibase/databasechangelog-versions-table)])))
              markers  (fn [] (mapv :id (jdbc/query {:datasource (mdb/data-source)}
                                                    [(format "SELECT id FROM %s WHERE id LIKE '%%legacy-version-tracking'" ct)])))]
          (with-redefs [liquibase/changelog-file "versionless-dev-run1.yaml"]
            (dev.migrate/migrate!))
          (jdbc/execute! {:datasource (mdb/data-source)}
                         [(format "UPDATE %s SET dateexecuted = DATEADD('MINUTE', -5, dateexecuted)" ct)])
          (with-redefs [liquibase/changelog-file "versionless-dev-run2.yaml"]
            (dev.migrate/migrate!)
            (is (true? (applied? "dev_run_b")))
            (is (= [liquibase/dev-version liquibase/dev-version] (versions)) "two dev deployments")
            (is (= ["v9999.legacy-version-tracking"] (markers)))
            (dev.migrate/rollback! :last-deployment)
            (is (false? (applied? "dev_run_b")) "the newest deployment's changeset is reversed")
            (is (true? (applied? "dev_run_a")) "the earlier deployment survives")
            (is (= [liquibase/dev-version] (versions)) "the rolled-back deployment's version row is gone too")
            (is (= ["v9999.legacy-version-tracking"] (markers)) "the surviving deployment's marker is kept")
            (testing "migrate! :down with no target is the same operation, and no longer passes a nil target"
              (dev.migrate/migrate! :down)
              (is (true? (applied? "dev_run_a")) "a single remaining deployment has nothing earlier to roll back to: no-op"))))))))

(deftest migration-sql-by-id-test
  (doseq [[id test] {"v50.2024-05-08T09:00:01"
                     {:postgres {:forward  "ALTER TABLE task_history ALTER COLUMN status DROP DEFAULT;"
                                 :rollback "Rollback impossible liquibase.exception.RollbackImpossibleException: No inverse to liquibase.change.core.DropDefaultValueChange created"}
                      :h2       {:forward  "ALTER TABLE task_history ALTER COLUMN  status SET DEFAULT NULL;"
                                 :rollback "Rollback impossible liquibase.exception.RollbackImpossibleException: No inverse to liquibase.change.core.DropDefaultValueChange created"}
                      :mysql    {:forward  "ALTER TABLE task_history ALTER status DROP DEFAULT;"
                                 :rollback "Rollback impossible liquibase.exception.RollbackImpossibleException: No inverse to liquibase.change.core.DropDefaultValueChange created"}
                      :mariadb  {:forward  "ALTER TABLE task_history ALTER status DROP DEFAULT;"
                                 :rollback "Rollback impossible liquibase.exception.RollbackImpossibleException: No inverse to liquibase.change.core.DropDefaultValueChange created"}}
                     "v50.2024-05-29T14:05:01"
                     {:postgres {:forward  "ALTER TABLE collection ADD archived_directly BOOLEAN;\nCOMMENT ON COLUMN collection.archived_directly IS 'Whether the item was trashed independently or as a subcollection';"
                                 :rollback "ALTER TABLE collection DROP COLUMN archived_directly;"}
                      :h2       {:forward  "ALTER TABLE collection ADD archived_directly BOOLEAN;\nCOMMENT ON COLUMN collection.archived_directly IS 'Whether the item was trashed independently or as a subcollection';"
                                 :rollback "ALTER TABLE collection DROP COLUMN archived_directly;"}
                      :mysql    {:forward  "ALTER TABLE collection ADD archived_directly TINYINT NULL COMMENT 'Whether the item was trashed independently or as a subcollection';"
                                 :rollback "ALTER TABLE collection DROP COLUMN archived_directly;"}
                      :mariadb  {:forward  "ALTER TABLE collection ADD archived_directly TINYINT(1) NULL COMMENT 'Whether the item was trashed independently or as a subcollection';"
                                 :rollback "ALTER TABLE collection DROP COLUMN archived_directly;"}}}
          [db-type expected] test]
    (testing (str "migration SQL for " (name db-type))
      (is (= expected
             (dev.migrate/migration-sql-by-id id db-type))))))
