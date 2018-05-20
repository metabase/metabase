(ns metabase.sync-database.sync-dynamic-test
  "Tests for databases with a so-called 'dynamic' schema, i.e. one that is not hard-coded somewhere.
   A Mongo database is an example of such a DB. "
  (:require [expectations :refer :all]
            [metabase
             [sync :as sync]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.sync-metadata :as sync-metadata]
            [metabase.test.mock.toucanery :as toucanery]
            [metabase.test.util :as tu]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(defn- remove-nonsense
  "Remove fields that aren't really relevant in the output for TABLES and their FIELDS.
   Done for the sake of making debugging some of the tests below easier."
  [tables]
  (for [table tables]
    (-> (u/select-non-nil-keys table [:schema :name :fields])
        (update :fields (fn [fields]
                          (for [field fields]
                            (u/select-non-nil-keys
                             field
                             [:table_id :name :fk_target_field_id :parent_id :base_type :database_type])))))))

(defn- get-tables [database-or-id]
  (->> (hydrate (db/select Table, :db_id (u/get-id database-or-id), {:order-by [:id]}) :fields)
       (mapv tu/boolean-ids-and-timestamps)))

;; basic test to make sure syncing nested fields works. This is sort of a higher-level test.
(expect
  (remove-nonsense toucanery/toucanery-tables-and-fields)
  (tt/with-temp* [Database [db {:engine :toucanery}]]
    (sync/sync-database! db)
    (remove-nonsense (get-tables db))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            TESTS FOR SYNC METADATA                                             |
;;; +----------------------------------------------------------------------------------------------------------------+


;; TODO - At some point these tests should be moved into a `sync-metadata-test` or `sync-metadata.fields-test`
;; namespace

;; make sure nested fields get resynced correctly if their parent field didn't change
(expect
  #{"weight" "age"}
  (tt/with-temp* [Database [db {:engine :toucanery}]]
    ;; do the initial sync
    (sync-metadata/sync-db-metadata! db)
    ;; delete our entry for the `transactions.toucan.details.age` field
    (let [transactions-table-id (u/get-id (db/select-one-id Table :db_id (u/get-id db), :name "transactions"))
          toucan-field-id       (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "toucan"))
          details-field-id      (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "details", :parent_id toucan-field-id))
          age-field-id          (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "age", :parent_id details-field-id))]
      (db/delete! Field :id age-field-id)
      (db/update! Table transactions-table-id :fields_hash "something new")
      ;; now sync again.
      (sync-metadata/sync-db-metadata! db)
      ;; field should be added back
      (db/select-field :name Field :table_id transactions-table-id, :parent_id details-field-id, :active true))))

;; Now do the exact same test where we make the Field inactive. Should get reactivated
(expect
  (tt/with-temp* [Database [db {:engine :toucanery}]]
    ;; do the initial sync
    (sync-metadata/sync-db-metadata! db)
    ;; delete our entry for the `transactions.toucan.details.age` field
    (let [transactions-table-id (u/get-id (db/select-one-id Table :db_id (u/get-id db), :name "transactions"))
          toucan-field-id       (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "toucan"))
          details-field-id      (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "details", :parent_id toucan-field-id))
          age-field-id          (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "age", :parent_id details-field-id))]
      (db/update! Field age-field-id :active false)
      ;; now sync again.
      (sync-metadata/sync-db-metadata! db)
      ;; field should be reactivated
      (db/select-field :active Field :id age-field-id))))

;; nested fields should also get reactivated if the parent field gets reactivated
(expect
  (tt/with-temp* [Database [db {:engine :toucanery}]]
    ;; do the initial sync
    (sync-metadata/sync-db-metadata! db)
    ;; delete our entry for the `transactions.toucan.details.age` field
    (let [transactions-table-id (u/get-id (db/select-one-id Table :db_id (u/get-id db), :name "transactions"))
          toucan-field-id       (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "toucan"))
          details-field-id      (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "details", :parent_id toucan-field-id))
          age-field-id          (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "age", :parent_id details-field-id))]
      (db/update! Field details-field-id :active false)
      ;; now sync again.
      (sync-metadata/sync-db-metadata! db)
      ;; field should be reactivated
      (db/select-field :active Field :id age-field-id))))


;; make sure nested fields can get marked inactive
(expect
  false
  (tt/with-temp* [Database [db {:engine :toucanery}]]
    ;; do the initial sync
    (sync-metadata/sync-db-metadata! db)
    ;; Add an entry for a `transactions.toucan.details.gender` field
    (let [transactions-table-id (u/get-id (db/select-one-id Table :db_id (u/get-id db), :name "transactions"))
          toucan-field-id       (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "toucan"))
          details-field-id      (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "details", :parent_id toucan-field-id))
          gender-field-id       (u/get-id (db/insert! Field
                                            :name          "gender"
                                            :database_type "VARCHAR"
                                            :base_type     "type/Text"
                                            :table_id      transactions-table-id
                                            :parent_id     details-field-id
                                            :active        true))]

      ;; now sync again.
      (db/update! Table transactions-table-id :fields_hash "something new")
      (sync-metadata/sync-db-metadata! db)
      ;; field should become inactive
      (db/select-one-field :active Field :id gender-field-id))))

;; make sure when a nested field gets marked inactive, so does it's children
(expect
  false
  (tt/with-temp* [Database [db {:engine :toucanery}]]
    ;; do the initial sync
    (sync-metadata/sync-db-metadata! db)
    ;; Add an entry for a `transactions.toucan.details.gender` field
    (let [transactions-table-id (u/get-id (db/select-one-id Table :db_id (u/get-id db), :name "transactions"))
          toucan-field-id       (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "toucan"))
          details-field-id      (u/get-id (db/select-one-id Field :table_id transactions-table-id, :name "details", :parent_id toucan-field-id))
          food-likes-field-id   (u/get-id (db/insert! Field
                                            :name          "food-likes"
                                            :database_type "OBJECT"
                                            :base_type     "type/Dictionary"
                                            :table_id      transactions-table-id
                                            :parent_id     details-field-id
                                            :active        true))
          blueberries-field-id  (u/get-id (db/insert! Field
                                            :name          "blueberries"
                                            :database_type "BOOLEAN"
                                            :base_type     "type/Boolean"
                                            :table_id      transactions-table-id
                                            :parent_id     food-likes-field-id
                                            :active        true))]

      ;; now sync again.
      (db/update! Table transactions-table-id :fields_hash "something new")
      (sync-metadata/sync-db-metadata! db)
      ;; field should become inactive
      (db/select-one-field :active Field :id blueberries-field-id))))
