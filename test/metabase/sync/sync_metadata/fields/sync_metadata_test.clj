(ns metabase.sync.sync-metadata.fields.sync-metadata-test
  (:require [expectations :refer [expect]]
            [metabase.models.table :refer [Table]]
            [metabase.sync.sync-metadata.fields.sync-metadata :as sync-metadata]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- updates-that-will-be-performed [new-metadata-from-sync metadata-in-application-db]
  (tt/with-temp Table [table]
    (let [update-operations (atom [])]
      (with-redefs [db/update! (fn [model id updates]
                                 (swap! update-operations conj [(name model) id updates]))]
        (#'sync-metadata/update-field-metadata-if-needed!
         table
         new-metadata-from-sync
         metadata-in-application-db)
        @update-operations))))

;; test that if database-type changes we will update it in the DB
(expect
  [["Field" 1 {:database_type "Integer"}]]
  (updates-that-will-be-performed
   {:name          "My Field"
    :database-type "Integer"
    :base-type     :type/Integer}
   {:name          "My Field"
    :database-type "NULL"
    :base-type     :type/Integer
    :id            1}))

;; no changes should be made (i.e., no calls to `update!`) if nothing changes
(expect
 []
 (updates-that-will-be-performed
  {:name          "My Field"
   :database-type "Integer"
   :base-type     :type/Integer}
  {:name          "My Field"
   :database-type "Integer"
   :base-type     :type/Integer
   :id            1}))

;; test that if `database-type` comes back as `nil` in the metadata from the sync process, we won't try to set a `nil`
;; value in the DB -- this is against the rules -- we should set `NULL` instead. See `TableMetadataField` schema.
(expect
  [["Field" 1 {:database_type "NULL"}]]
  (updates-that-will-be-performed
   {:name          "My Field"
    :database-type nil
    :base-type     :type/Integer}
   {:name          "My Field"
    :database-type "Integer"
    :base-type     :type/Integer
    :id            1}))

;; if `database-type` comes back as `nil` and was already saved in application DB as `NULL` no changes should be made
(expect
  []
  (updates-that-will-be-performed
   {:name          "My Field"
    :database-type nil
    :base-type     :type/Integer}
   {:name          "My Field"
    :database-type "NULL"
    :base-type     :type/Integer
    :id            1}))
