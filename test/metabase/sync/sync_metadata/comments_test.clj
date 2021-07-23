(ns metabase.sync.sync-metadata.comments-test
  "Test for the logic that syncs Table column descriptions with the comments fetched from a DB."
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :refer [Table]]
            [metabase.sync :as sync]
            [metabase.sync.sync-metadata.tables :as sync-tables]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- db->fields [db]
  (let [table-ids (db/select-ids Table :db_id (u/the-id db))]
    (set (map (partial into {}) (db/select ['Field :name :description] :table_id [:in table-ids])))))

(tx/defdataset ^:private basic-field-comments
  [["basic_field_comments"
    [{:field-name "with_comment", :base-type :type/Text, :field-comment "comment"}
     {:field-name "no_comment", :base-type :type/Text}]
    [["foo" "bar"]]]])

(deftest basic-field-comments-test
  (testing "test basic field comments sync"
    (mt/test-drivers #{:h2 :postgres}
      (mt/dataset basic-field-comments
        (is (= #{{:name (mt/format-name "id"), :description nil}
                 {:name (mt/format-name "with_comment"), :description "comment"}
                 {:name (mt/format-name "no_comment"), :description nil}}
               (db->fields (mt/db))))))))

(tx/defdataset ^:private update-desc
  [["update_desc"
    [{:field-name "updated_desc", :base-type :type/Text, :field-comment "original comment"}]
    [["foo"]]]])

(deftest comment-should-not-overwrite-custom-description-test
  (testing (str "test changing the description in metabase db so we can check it is not overwritten by comment in "
                "source db when resyncing"))
  (mt/test-drivers #{:h2 :postgres}
    (mt/dataset update-desc
      (mt/with-temp-copy-of-db
        ;; change the description in metabase while the source table comment remains the same
        (db/update-where! Field {:id (mt/id "update_desc" "updated_desc")}, :description "updated description")
        ;; now sync the DB again, this should NOT overwrite the manually updated description
        (sync/sync-table! (Table (mt/id "update_desc")))
        (is (= #{{:name (mt/format-name "id"), :description nil}
                 {:name (mt/format-name "updated_desc"), :description "updated description"}}
               (db->fields (mt/db))))))))

(tx/defdataset ^:private comment-after-sync
  [["comment_after_sync"
    [{:field-name "comment_after_sync", :base-type :type/Text}]
    [["foo"]]]])

(deftest sync-comment-on-existing-field-test
  (testing "test adding a comment to the source data that was initially empty, so we can check that the resync picks it up"
    (mt/test-drivers #{:h2 :postgres}
      (mt/dataset comment-after-sync
        ;; modify the source DB to add the comment and resync. The easiest way to do this is just destroy the entire DB
        ;; and re-create a modified version. As such, let the SQL JDBC driver know the DB is being "modified" so it can
        ;; destroy its current connection pool
        (driver/notify-database-updated driver/*driver* (mt/db))
        (let [modified-dbdef (update
                              comment-after-sync
                              :table-definitions
                              (fn [[tabledef]]
                                [(update
                                  tabledef
                                  :field-definitions
                                  (fn [[fielddef]]
                                    [(assoc fielddef :field-comment "added comment")]))]))]
          (tx/create-db! driver/*driver* modified-dbdef))
        (sync/sync-table! (Table (mt/id "comment_after_sync")))
        (is (= #{{:name (mt/format-name "id"), :description nil}
                 {:name (mt/format-name "comment_after_sync"), :description "added comment"}}
               (db->fields (mt/db))))))))

(defn- basic-table [table-name comment]
  (tx/map->DatabaseDefinition {:database-name     (str table-name "_db")
                               :table-definitions [{:table-name        table-name
                                                    :field-definitions [{:field-name "foo", :base-type :type/Text}]
                                                    :rows              [["bar"]]
                                                    :table-comment     comment}]}))

(defn- db->tables [db]
  (set (map (partial into {}) (db/select [Table :name :description] :db_id (u/the-id db)))))

(deftest table-comments-test
  (testing "test basic comments on table"
    (mt/test-drivers #{:h2 :postgres}
      (mt/dataset (basic-table "table_with_comment" "table comment")
        (is (= #{{:name (mt/format-name "table_with_comment"), :description "table comment"}}
               (db->tables (mt/db))))))))

(deftest dont-overwrite-table-custom-description-test
  (testing (str "test changing the description in metabase on table to check it is not overwritten by comment in "
                "source db when resyncing")
    (mt/test-drivers #{:h2 :postgres}
      (mt/dataset (basic-table "table_with_updated_desc" "table comment")
        (mt/with-temp-copy-of-db
          ;; change the description in metabase while the source table comment remains the same
          (db/update-where! Table {:id (mt/id "table_with_updated_desc")}, :description "updated table description")
          ;; now sync the DB again, this should NOT overwrite the manually updated description
          (sync-tables/sync-tables! (mt/db))
          (is (= #{{:name (mt/format-name "table_with_updated_desc"), :description "updated table description"}}
                 (db->tables (mt/db)))))))))

(deftest sync-existing-table-comment-test
  (testing "test adding a comment to the source table that was initially empty, so we can check that the resync picks it up"
    (mt/test-drivers #{:h2 :postgres}
      (mt/dataset (basic-table "table_with_comment_after_sync" nil)
        ;; modify the source DB to add the comment and resync
        (driver/notify-database-updated driver/*driver* (mt/db))
        (tx/create-db! driver/*driver* (basic-table "table_with_comment_after_sync" "added comment"))
        (sync-tables/sync-tables! (mt/db))
        (is (= #{{:name (mt/format-name "table_with_comment_after_sync"), :description "added comment"}}
               (db->tables (mt/db))))))))
