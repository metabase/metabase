(ns ^:mb/once metabase.sync.sync-metadata.fields.sync-instances-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.database :refer [:model/Database]]
   [metabase.models.field :refer [:model/Field]]
   [metabase.models.table :refer [:model/Table]]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.fields :as sync-fields]
   [metabase.test :as mt]
   [metabase.test.mock.toucanery :as toucanery]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def ^:private toucannery-transactions-expected-fields-hierarchy
  {"ts"     nil
   "id"     nil
   "buyer"  {"cc"   nil
             "name" nil}
   "toucan" {"details" {"age"    nil
                        "weight" nil}
             "name"    nil}})

(defn- actual-fields-hierarchy [table-or-id]
  (let [parent-id->children (group-by :parent_id (t2/select [:model/Field :id :parent_id :name] :table_id (u/the-id table-or-id)))
        format-fields       (fn format-fields [fields]
                              (into {} (for [field fields]
                                         [(:name field) (when-let [nested-fields (seq (parent-id->children (:id field)))]
                                                          (format-fields nested-fields))])))]
    (format-fields (get parent-id->children nil))))

(deftest sync-fields-test
  (t2.with-temp/with-temp [:model/Database db    {:engine ::toucanery/toucanery}
                           :model/Table    table {:name "transactions", :db_id (u/the-id db)}]
    ;; do the initial sync
    (sync-fields/sync-fields-for-table! table)
    (let [transactions-table-id (u/the-id (t2/select-one-pk :model/Table :db_id (u/the-id db), :name "transactions"))]
      (is (= toucannery-transactions-expected-fields-hierarchy
             (actual-fields-hierarchy transactions-table-id))))))

(deftest delete-nested-field-test
  (testing (str "If you delete a nested Field, and re-sync a Table, it should recreate the Field as it was before! It "
                "should not create any duplicate Fields (#8950)")
    (t2.with-temp/with-temp [:model/Database db    {:engine ::toucanery/toucanery}
                             :model/Table    table {:name "transactions", :db_id (u/the-id db)}]
      ;; do the initial sync
      (sync-fields/sync-fields-for-table! table)
      (let [transactions-table-id (u/the-id (t2/select-one-pk :model/Table :db_id (u/the-id db), :name "transactions"))]
        (t2/delete! :model/Field :table_id transactions-table-id, :name "age")
        ;; ok, resync the Table. `toucan.details.age` should be recreated, but only one. We should *not* have a
        ;; `toucan.age` Field as well, which was happening before the bugfix in this PR
        (sync-fields/sync-fields-for-table! table)
        ;; Fetch all the Fields in the `transactions` Table (name & parent name) after the sync, format them in a
        ;; hierarchy for easy comparison
        (is (= toucannery-transactions-expected-fields-hierarchy
               (actual-fields-hierarchy transactions-table-id)))))))

;; TODO: this uses the higher level `sync-metadata/sync-db-metadata!` entry but serves as a test for
;; `sync-instances` and perhaps can be moved to use this entry. This is a bit more mecahnical for code org so I
;; don't want to get into that in this change.

(deftest resync-nested-fields-test
  (testing "Make sure nested fields get resynced correctly if their parent field didnt' change"
    (t2.with-temp/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
      ;; do the initial sync
      (sync-metadata/sync-db-metadata! db)
      ;; delete our entry for the `transactions.toucan.details.age` field
      (let [transactions-table-id (u/the-id (t2/select-one-pk :model/Table :db_id (u/the-id db), :name "transactions"))
            toucan-field-id       (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "toucan"))
            details-field-id      (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "details", :parent_id toucan-field-id))
            age-field-id          (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "age", :parent_id details-field-id))]
        (t2/delete! :model/Field :id age-field-id)
        ;; now sync again.
        (sync-metadata/sync-db-metadata! db)
        ;; field should be added back
        (is (= #{"weight" "age"}
               (t2/select-fn-set :name :model/Field :table_id transactions-table-id, :parent_id details-field-id, :active true)))))))

(deftest reactivate-field-test
  (testing "Syncing can reactivate a field"
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
      ;; do the initial sync
      (sync-metadata/sync-db-metadata! db)
      ;; delete our entry for the `transactions.toucan.details.age` field
      (let [transactions-table-id (u/the-id (t2/select-one-pk :model/Table :db_id (u/the-id db), :name "transactions"))
            toucan-field-id       (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "toucan"))
            details-field-id      (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "details", :parent_id toucan-field-id))
            age-field-id          (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "age", :parent_id details-field-id))]
        (t2/update! :model/Field age-field-id {:active false})
        ;; now sync again.
        (sync-metadata/sync-db-metadata! db)
        ;; field should be reactivated
        (is (t2/select-one-fn :active :model/Field :id age-field-id))))))

(deftest reactivate-nested-field-when-parent-is-reactivated-test
  (testing "Nested fields get reactivated if the parent field gets reactivated"
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
        ;; do the initial sync
        (sync-metadata/sync-db-metadata! db)
        ;; delete our entry for the `transactions.toucan.details.age` field
        (let [transactions-table-id (u/the-id (t2/select-one-pk :model/Table :db_id (u/the-id db), :name "transactions"))
              toucan-field-id       (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "toucan"))
              details-field-id      (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "details", :parent_id toucan-field-id))
              age-field-id          (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "age", :parent_id details-field-id))]
          (t2/update! :model/Field details-field-id {:active false})
          ;; now sync again.
          (sync-metadata/sync-db-metadata! db)
          ;; field should be reactivated
          (is (t2/select-one-fn :active :model/Field :id age-field-id)))))))

(deftest mark-nested-field-inactive-test
  (testing "Nested fields can be marked inactive"
    (t2.with-temp/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
      ;; do the initial sync
      (sync-metadata/sync-db-metadata! db)
      ;; Add an entry for a `transactions.toucan.details.gender` field
      (let [transactions-table-id (u/the-id (t2/select-one-pk :model/Table :db_id (u/the-id db), :name "transactions"))
            toucan-field-id       (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "toucan"))
            details-field-id      (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "details", :parent_id toucan-field-id))
            gender-field-id       (u/the-id (first (t2/insert-returning-instances! :model/Field
                                                                                   :name          "gender"
                                                                                   :database_type "VARCHAR"
                                                                                   :base_type     "type/Text"
                                                                                   :table_id      transactions-table-id
                                                                                   :parent_id     details-field-id
                                                                                   :active        true)))]

        ;; now sync again.
        (sync-metadata/sync-db-metadata! db)
        ;; field should become inactive
        (is (false? (t2/select-one-fn :active :model/Field :id gender-field-id)))))))

(deftest mark-nested-field-children-inactive-test
  (testing "When a nested field is marked inactive so are its children"
    (t2.with-temp/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
      ;; do the initial sync
      (sync-metadata/sync-db-metadata! db)
      ;; Add an entry for a `transactions.toucan.details.gender` field
      (let [transactions-table-id (u/the-id (t2/select-one-pk :model/Table :db_id (u/the-id db), :name "transactions"))
            toucan-field-id       (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "toucan"))
            details-field-id      (u/the-id (t2/select-one-pk :model/Field :table_id transactions-table-id, :name "details", :parent_id toucan-field-id))
            food-likes-field-id   (u/the-id (first (t2/insert-returning-instances! :model/Field
                                                                                   :name          "food-likes"
                                                                                   :database_type "OBJECT"
                                                                                   :base_type     "type/Dictionary"
                                                                                   :table_id      transactions-table-id
                                                                                   :parent_id     details-field-id
                                                                                   :active        true)))
            blueberries-field-id  (first (t2/insert-returning-pks! :model/Field
                                                                   :name          "blueberries"
                                                                   :database_type "BOOLEAN"
                                                                   :base_type     "type/Boolean"
                                                                   :table_id      transactions-table-id
                                                                   :parent_id     food-likes-field-id
                                                                   :active        true))]

        ;; now sync again.
        (sync-metadata/sync-db-metadata! db)
        ;; field should become inactive
        (is (false? (t2/select-one-fn :active :model/Field :id blueberries-field-id)))))))
