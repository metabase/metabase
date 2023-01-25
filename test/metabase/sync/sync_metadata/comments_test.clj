(ns metabase.sync.sync-metadata.comments-test
  "Test for the logic that syncs Table column descriptions with the comments fetched from a DB."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.sync :as sync]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [toucan.db :as db]))

(defn- fields []
  (into #{}
        (map mt/derecordize)
        (db/select [Field :name :description] :table_id (mt/id :field_with_comment))))

(deftest basic-field-comments-test
  (testing "test basic field comments sync"
    (mt/test-drivers #{:h2 :postgres}
      (mt/dataset comments
        (is (= #{{:name (mt/format-name "id"), :description nil}
                 {:name (mt/format-name "with_comment"), :description "original comment"}
                 {:name (mt/format-name "no_comment"), :description nil}}
               (fields)))))))

(deftest comment-should-not-overwrite-custom-description-test
  (testing (str "test changing the description in metabase db so we can check it is not overwritten by comment in "
                "source db when resyncing"))
  (mt/test-drivers #{:h2 :postgres}
    (mt/dataset comments
      (mt/with-temp-copy-of-db
        ;; change the description in metabase while the source table comment remains the same
        (db/update-where! Field {:id (mt/id "field_with_comment" "with_comment")}, :description "updated description")
        ;; now sync the DB again, this should NOT overwrite the manually updated description
        (sync/sync-table! (db/select-one Table :id (mt/id "field_with_comment")))
        (is (= #{{:name (mt/format-name "id"), :description nil}
                 {:name (mt/format-name "with_comment"), :description "updated description"}
                 {:name (mt/format-name "no_comment"), :description nil}}
               (fields)))))))

(deftest sync-comment-on-existing-field-test
  (testing "test adding a comment to the source data that was initially empty, so we can check that the resync picks it up"
    (mt/test-drivers #{:h2 :postgres}
      (mt/dataset comments
        (mt/with-temp-copy-of-db
          ;; modify the source DB to add the comment and resync. The easiest way to do this is just destroy the entire DB
          ;; and re-create a modified version. As such, let the SQL JDBC driver know the DB is being "modified" so it can
          ;; destroy its current connection pool
          (driver/notify-database-updated driver/*driver* (mt/db))
          (try
            (execute/execute-sql!
             driver/*driver*
             :db
             {:database-name "comments"}
             (case driver/*driver*
               :h2       "COMMENT ON COLUMN \"FIELD_WITH_COMMENT\".\"NO_COMMENT\" IS 'added comment';"
               :postgres "COMMENT ON COLUMN field_with_comment.no_comment IS 'added comment';"))
            (sync/sync-table! (db/select-one Table :id (mt/id "field_with_comment")))
            (is (= #{{:name (mt/format-name "id"), :description nil}
                     {:name (mt/format-name "with_comment"), :description "original comment"}
                     {:name (mt/format-name "no_comment"), :description "added comment"}}
                   (fields)))
            (finally
              (execute/execute-sql!
               driver/*driver*
               :db
               {:database-name "comments"}
               (case driver/*driver*
                 :h2       "COMMENT ON COLUMN \"FIELD_WITH_COMMENT\".\"NO_COMMENT\" IS NULL;"
                 :postgres "COMMENT ON COLUMN field_with_comment.no_comment IS NULL;")))))))))

(defn- table [table-name]
  (mt/derecordize
   (db/select-one [Table :name :description] :id (mt/id table-name))))

(deftest table-comments-test
  (testing "test basic comments on table"
    (mt/test-drivers #{:h2 :postgres}
      (mt/dataset comments
        (is (= {:name (mt/format-name "table_with_comment"), :description "table comment"}
               (table :table_with_comment)))))))

(deftest dont-overwrite-table-custom-description-test
  (testing (str "test changing the description in metabase on table to check it is not overwritten by comment in "
                "source db when resyncing")
    (mt/test-drivers #{:h2 :postgres}
      (mt/dataset comments
        (mt/with-temp-copy-of-db
          ;; change the description in metabase while the source table comment remains the same
          (db/update-where! Table {:id (mt/id "table_with_comment")}, :description "updated table description")
          ;; now sync the DB again, this should NOT overwrite the manually updated description
          (sync-tables/sync-tables-and-database! (mt/db))
          (is (= {:name (mt/format-name "table_with_comment"), :description "updated table description"}
                 (table :table_with_comment))))))))

(deftest sync-existing-table-comment-test
  (testing "test adding a comment to the source table that was initially empty, so we can check that the resync picks it up"
    (mt/test-drivers #{:h2 :postgres}
      (mt/dataset comments
        (mt/with-temp-copy-of-db
          ;; modify the source DB to add the comment and resync
          (driver/notify-database-updated driver/*driver* (mt/db))
          (try
            (execute/execute-sql!
             driver/*driver*
             :db
             {:database-name "comments"}
             (case driver/*driver*
               :h2       "COMMENT ON TABLE \"TABLE_WITHOUT_COMMENT\" IS 'added comment';"
               :postgres "COMMENT ON TABLE table_without_comment IS 'added comment';"))
            (sync-tables/sync-tables-and-database! (mt/db))
            (is (= {:name (mt/format-name "table_without_comment"), :description "added comment"}
                   (table :table_without_comment)))
            (finally
              (execute/execute-sql!
               driver/*driver*
               :db
               {:database-name "comments"}
               (case driver/*driver*
                 :h2       "COMMENT ON TABLE \"TABLE_WITHOUT_COMMENT\" IS NULL;"
                 :postgres "COMMENT ON TABLE table_without_comment IS NULL;")))))))))
