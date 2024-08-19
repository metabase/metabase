(ns dev.migrate-test
  (:require
   [clojure.test :refer :all]
   [metabase.dev.migrate :as dev.migrate]))

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
