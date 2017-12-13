(ns metabase.sync.sync-metadata.comments-test
  "Test for the logic that syncs Table column descriptions with the comments fetched from a DB."
  (:require [expectations :refer :all]
            [metabase.models.table :refer [Table]]
            [metabase.models.field :refer [Field]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.data.interface :as i]
            [metabase.sync :as sync]
            [toucan.db :as db]))

(i/def-database-definition ^:const ^:private db-with-desc
 ["table_with_comment"
  [{:field-name "string_with_comment", :base-type :type/Text, :description "string comment"}
   {:field-name "int_with_comment", :base-type :type/Integer, :description "int comment"}
   {:field-name "no_comment", :base-type :type/Integer}
   ;;{:field-name "added_comment_after_create", :base-type :type/Integer}
   {:field-name "updated_description_in_metabase", :base-type :type/Integer, :description "original comment"}]
  [["val" 1 1 1 1]]])

;; check field descriptions sync correctly
(datasets/expect-with-engines #{:h2 :postgres}
  #{{:name (data/format-name "id"), :description nil}
    {:name (data/format-name "string_with_comment"), :description "string comment"}
    {:name (data/format-name "int_with_comment"), :description "int comment"}
    {:name (data/format-name "no_comment"), :description nil}
    ;;{:name (data/format-name "added_comment_after_create"), :description "added comment"}
    {:name (data/format-name "updated_description_in_metabase"), :description "updated description"}}
  (data/dataset metabase.sync.sync-metadata.comments-test/db-with-desc
    ;; TODO: add a comment to the source data that was initially empty, so we can check that the resync picks it up
    ;;(data/execute-sql! driver :db dbdef (standalone-column-comment-sql driver dbdef tabledef fielddef))
    ;; change the description in metabase db so we can check it is not overwritten by comment in source db when resyncing
    (db/update-where! Field {:id (data/id "table_with_comment" "updated_description_in_metabase")}, :description "updated description")
    ;; now sync the DB again
    (sync/sync-table! (Table (data/id "table_with_comment")))
    (set (for [field (db/select [Field :name :description], :table_id (data/id "table_with_comment"))]
           (into {} field)))))
