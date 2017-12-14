(ns metabase.sync.sync-metadata.comments-test
  "Test for the logic that syncs Table column descriptions with the comments fetched from a DB."
  (:require [expectations :refer :all]
            [metabase
             [sync :as sync]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.models.database :refer [Database]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.models
             [table :refer [Table]]
             [field :refer [Field]]]
            [metabase.test.data
             [datasets :refer [expect-with-engines]]
             [interface :refer [def-database-definition]]]
            [toucan.db :as db]))

(defn- db->fields [db]
  (let [table-ids (db/select-ids 'Table :db_id (u/get-id db))]
    (set (map (partial into {}) (db/select ['Field :name :description] :table_id [:in table-ids])))))

;; test basic field comments sync
(def-database-definition ^:const ^:private basic-field-comments
 ["basic_field_comments"
  [{:field-name "with_comment", :base-type :type/Text, :description "comment"}
   {:field-name "no_comment", :base-type :type/Text}]
  [["foo" "bar"]]])

(expect-with-engines #{:h2 :postgres}
  #{{:name (data/format-name "id"), :description nil}
    {:name (data/format-name "with_comment"), :description "comment"}
    {:name (data/format-name "no_comment"), :description nil}}
  (data/with-temp-db [db basic-field-comments]
     (db->fields db)))

;; test changing the description in metabase db so we can check it is not overwritten by comment in source db when resyncing
(def-database-definition ^:const ^:private update-desc
 ["update_desc"
  [{:field-name "updated_desc", :base-type :type/Text, :description "original comment"}]
  [["foo"]]])

(expect-with-engines #{:h2 :postgres}
  #{{:name (data/format-name "id"), :description nil}
    {:name (data/format-name "updated_desc"), :description "updated description"}}
  (data/with-temp-db [db update-desc]
    ;; change the description in metabase while the source table comment remains the same
    (db/update-where! Field {:id (data/id "update_desc" "updated_desc")}, :description "updated description")
    ;; now sync the DB again, this should NOT overwrite the manually updated description
    (sync/sync-table! (Table (data/id "update_desc")))
    (db->fields db)))

;; test adding a comment to the source data that was initially empty, so we can check that the resync picks it up
(def-database-definition ^:const ^:private comment-after-sync
 ["comment_after_sync"
  [{:field-name "comment_after_sync", :base-type :type/Text}]
  [["foo"]]])

; Commented out until I figure out how to make this work
;(expect-with-engines #{:h2 :postgres}
;  #{{:name (data/format-name "id"), :description nil}
;    {:name (data/format-name "comment_after_sync"), :description "added comment"}}
;  (data/with-temp-db [db comment-after-sync]
;    ;; TODO: need to modify the source DB to add the comment but I'm at a loss about how to do this, test will fail
;    (db->fields db)))
