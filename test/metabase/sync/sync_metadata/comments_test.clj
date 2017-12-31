(ns metabase.sync.sync-metadata.comments-test
  "Test for the logic that syncs Table column descriptions with the comments fetched from a DB."
  (:require [expectations :refer :all]
            [metabase
             [sync :as sync]
             [util :as u]]
            [metabase.models
             [table :refer [Table]]
             [field :refer [Field]]]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :as ds]
             [interface :as i]]
            [toucan.db :as db]))

(defn- db->fields [db]
  (let [table-ids (db/select-ids 'Table :db_id (u/get-id db))]
    (set (map (partial into {}) (db/select ['Field :name :description] :table_id [:in table-ids])))))

;; test basic field comments sync
(i/def-database-definition ^:const ^:private basic-field-comments
 ["basic_field_comments"
  [{:field-name "with_comment", :base-type :type/Text, :field-comment "comment"}
   {:field-name "no_comment", :base-type :type/Text}]
  [["foo" "bar"]]])

(ds/expect-with-engines #{:h2 :postgres}
  #{{:name (data/format-name "id"), :description nil}
    {:name (data/format-name "with_comment"), :description "comment"}
    {:name (data/format-name "no_comment"), :description nil}}
  (data/with-temp-db [db basic-field-comments]
     (db->fields db)))

;; test changing the description in metabase db so we can check it is not overwritten by comment in source db when resyncing
(i/def-database-definition ^:const ^:private update-desc
 ["update_desc"
  [{:field-name "updated_desc", :base-type :type/Text, :field-comment "original comment"}]
  [["foo"]]])

(ds/expect-with-engines #{:h2 :postgres}
  #{{:name (data/format-name "id"), :description nil}
    {:name (data/format-name "updated_desc"), :description "updated description"}}
  (data/with-temp-db [db update-desc]
    ;; change the description in metabase while the source table comment remains the same
    (db/update-where! Field {:id (data/id "update_desc" "updated_desc")}, :description "updated description")
    ;; now sync the DB again, this should NOT overwrite the manually updated description
    (sync/sync-table! (Table (data/id "update_desc")))
    (db->fields db)))

;; test adding a comment to the source data that was initially empty, so we can check that the resync picks it up
(i/def-database-definition ^:const ^:private comment-after-sync
 ["comment_after_sync"
  [{:field-name "comment_after_sync", :base-type :type/Text}]
  [["foo"]]])

(ds/expect-with-engines #{:h2 :postgres}
  #{{:name (data/format-name "id"), :description nil}
    {:name (data/format-name "comment_after_sync"), :description "added comment"}}
  (data/with-temp-db [db comment-after-sync]
    ;; modify the source DB to add the comment and resync
    (i/create-db! ds/*driver* (assoc-in comment-after-sync [:table-definitions 0 :field-definitions 0 :field-comment] "added comment") true)
    (sync/sync-table! (Table (data/id "comment_after_sync")))
    (db->fields db)))

;; TODO: test basic comments on table
;(expect-with-engines #{:h2 :postgres}
;  #{{:name (data/format-name "table_with_comment"), :description "table comment"}}
;  (data/with-temp-db [db (map->DatabaseDefinition {:database-name     "table_with_comment_db"
;                                                   :table-definitions [{:table-name        "table_with_comment"
;                                                                        :field-definitions [{:field-name "foo", :base-type :type/Text}]}]
;                                                   :table-comment     "table comment"})]
;    (set (map (partial into {}) (db/select ['Table :name :description])))))
