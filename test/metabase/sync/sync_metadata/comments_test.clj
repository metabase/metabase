(ns metabase.sync.sync-metadata.comments-test
  "Test for the logic that syncs Table column descriptions with the comments fetched from a DB."
  (:require [metabase
             [driver :as driver]
             [sync :as sync]
             [util :as u]]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.sync-metadata.tables :as sync-tables]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :as datasets]
             [interface :as tx]]
            [toucan.db :as db]))

;; Tests for field comments: ------------------

(defn- db->fields [db]
  (let [table-ids (db/select-ids 'Table :db_id (u/get-id db))]
    (set (map (partial into {}) (db/select ['Field :name :description] :table_id [:in table-ids])))))

;; test basic field comments sync
(tx/def-database-definition ^:const ^:private basic-field-comments
  [["basic_field_comments"
    [{:field-name "with_comment", :base-type :type/Text, :field-comment "comment"}
     {:field-name "no_comment", :base-type :type/Text}]
    [["foo" "bar"]]]])

(datasets/expect-with-drivers #{:h2 :postgres}
  #{{:name (data/format-name "id"), :description nil}
    {:name (data/format-name "with_comment"), :description "comment"}
    {:name (data/format-name "no_comment"), :description nil}}
  (data/with-temp-db [db basic-field-comments]
    (db->fields db)))

;; test changing the description in metabase db so we can check it is not overwritten by comment in source db when resyncing
(tx/def-database-definition ^:const ^:private update-desc
  [["update_desc"
    [{:field-name "updated_desc", :base-type :type/Text, :field-comment "original comment"}]
    [["foo"]]]])

(datasets/expect-with-drivers #{:h2 :postgres}
  #{{:name (data/format-name "id"), :description nil}
    {:name (data/format-name "updated_desc"), :description "updated description"}}
  (data/with-temp-db [db update-desc]
    ;; change the description in metabase while the source table comment remains the same
    (db/update-where! Field {:id (data/id "update_desc" "updated_desc")}, :description "updated description")
    ;; now sync the DB again, this should NOT overwrite the manually updated description
    (sync/sync-table! (Table (data/id "update_desc")))
    (db->fields db)))

;; test adding a comment to the source data that was initially empty, so we can check that the resync picks it up
(tx/def-database-definition ^:const ^:private comment-after-sync
  [["comment_after_sync"
    [{:field-name "comment_after_sync", :base-type :type/Text}]
    [["foo"]]]])

(datasets/expect-with-drivers #{:h2 :postgres}
  #{{:name (data/format-name "id"), :description nil}
    {:name (data/format-name "comment_after_sync"), :description "added comment"}}
  (data/with-temp-db [db comment-after-sync]
    ;; modify the source DB to add the comment and resync. The easiest way to do this is just destroy the entire DB
    ;; and re-create a modified version. As such, let the SQL JDBC driver know the DB is being "modified" so it can
    ;; destroy its current connection pool
    (driver/notify-database-updated driver/*driver* db)
    (let [modified-dbdef (assoc-in comment-after-sync
                                   [:table-definitions 0 :field-definitions 0 :field-comment]
                                   "added comment")]
      (tx/create-db! driver/*driver* modified-dbdef))
    (sync/sync-table! (Table (data/id "comment_after_sync")))
    (db->fields db)))


;; Tests for table comments: ------------------

(defn- basic-table [table-name comment]
  (tx/map->DatabaseDefinition {:database-name     (str table-name "_db")
                               :table-definitions [{:table-name        table-name
                                                    :field-definitions [{:field-name "foo", :base-type :type/Text}]
                                                    :rows              [["bar"]]
                                                    :table-comment     comment}]}))

(defn- db->tables [db]
  (set (map (partial into {}) (db/select ['Table :name :description] :db_id (u/get-id db)))))

;; test basic comments on table
(datasets/expect-with-drivers #{:h2 :postgres}
  #{{:name (data/format-name "table_with_comment"), :description "table comment"}}
  (data/with-temp-db [db (basic-table "table_with_comment" "table comment")]
    (db->tables db)))

;; test changing the description in metabase on table to check it is not overwritten by comment in source db when resyncing
(datasets/expect-with-drivers #{:h2 :postgres}
  #{{:name (data/format-name "table_with_updated_desc"), :description "updated table description"}}
  (data/with-temp-db [db (basic-table "table_with_updated_desc" "table comment")]
    ;; change the description in metabase while the source table comment remains the same
    (db/update-where! Table {:id (data/id "table_with_updated_desc")}, :description "updated table description")
    ;; now sync the DB again, this should NOT overwrite the manually updated description
    (sync-tables/sync-tables! db)
    (db->tables db)))

;; test adding a comment to the source table that was initially empty, so we can check that the resync picks it up
(datasets/expect-with-drivers #{:h2 :postgres}
  #{{:name (data/format-name "table_with_comment_after_sync"), :description "added comment"}}
  (data/with-temp-db [db (basic-table "table_with_comment_after_sync" nil)]
    ;; modify the source DB to add the comment and resync
    (driver/notify-database-updated driver/*driver* db)
    (tx/create-db! driver/*driver* (basic-table "table_with_comment_after_sync" "added comment"))
    (sync-tables/sync-tables! db)
    (db->tables db)))
