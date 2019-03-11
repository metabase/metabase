(ns metabase.sync.sync-metadata.fields.sync-instances-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.sync-metadata.fields :as sync-fields]
            [metabase.test.mock.toucanery :as toucanery]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(def ^:private toucannery-transactions-expected-fields-hierarchy
  {"ts"     nil
   "id"     nil
   "buyer"  {"cc"   nil
             "name" nil}
   "toucan" {"details" {"age"    nil
                        "weight" nil}
             "name"    nil}})

(defn- actual-fields-hierarchy [table-or-id]
  (let [parent-id->children (group-by :parent_id (db/select [Field :id :parent_id :name] :table_id (u/get-id table-or-id)))
        format-fields       (fn format-fields [fields]
                              (into {} (for [field fields]
                                         [(:name field) (when-let [nested-fields (seq (parent-id->children (:id field)))]
                                                          (format-fields nested-fields))])))]
    (format-fields (get parent-id->children nil))))

(expect
  toucannery-transactions-expected-fields-hierarchy
  (tt/with-temp* [Database [db {:engine ::toucanery/toucanery}]
                  Table    [table {:name "transactions", :db_id (u/get-id db)}]]
    ;; do the initial sync
    (sync-fields/sync-fields-for-table! table)
    (let [transactions-table-id (u/get-id (db/select-one-id Table :db_id (u/get-id db), :name "transactions"))]
      (actual-fields-hierarchy transactions-table-id))))

;; If you delete a nested Field, and re-sync a Table, it should recreate the Field as it was before! It should not
;; create any duplicate Fields (#8950)
(expect
  toucannery-transactions-expected-fields-hierarchy
  (tt/with-temp* [Database [db {:engine ::toucanery/toucanery}]
                  Table    [table {:name "transactions", :db_id (u/get-id db)}]]
    ;; do the initial sync
    (sync-fields/sync-fields-for-table! table)
    (let [transactions-table-id (u/get-id (db/select-one-id Table :db_id (u/get-id db), :name "transactions"))]
      ;; Give the Table a new Hash, and delete `toucan.details.age`
      (db/update! Table transactions-table-id :fields_hash "something new")
      (db/delete! Field :table_id transactions-table-id, :name "age")
      ;; ok, resync the Table. `toucan.details.age` should be recreated, but only one. We should *not* have a
      ;; `toucan.age` Field as well, which was happening before the bugfix in this PR
      (sync-fields/sync-fields-for-table! table)
      ;; Fetch all the Fields in the `transactions` Table (name & parent name) after the sync, format them in a
      ;; hierarchy for easy comparison
      (actual-fields-hierarchy transactions-table-id))))
