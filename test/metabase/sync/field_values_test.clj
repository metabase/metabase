(ns metabase.sync.field-values-test
  "Tests around the way Metabase syncs FieldValues, and sets the values of `field.has_field_values`."
  (:require [clojure.test :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.models.field-values :as field-values :refer [FieldValues]]
            [metabase.models.table :refer [Table]]
            [metabase.sync :as sync]
            [metabase.sync.util-test :as sut]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.test.data.one-off-dbs :as one-off-dbs]
            [toucan.db :as db]))

(defn- venues-price-field-values []
  (db/select-one-field :values FieldValues, :field_id (mt/id :venues :price)))

(defn- sync-database!' [step database]
  (let [{:keys [step-info task-history]} (sut/sync-database! step database)]
    [(sut/only-step-keys step-info)
     (:task_details task-history)]))

(deftest sync-recreate-field-values-test
  (testing "Test that when we delete FieldValues syncing the Table again will cause them to be re-created"
    (testing "Check that we have expected field values to start with"
      (is (= [1 2 3 4]
             (venues-price-field-values))))
    (testing "Delete the Field values, make sure they're gone"
      (db/delete! FieldValues :field_id (mt/id :venues :price))
      (is (= nil
             (venues-price-field-values))))
    (testing "After the delete, a field values should be created, the rest updated"
      (is (= (repeat 2 {:errors 0, :created 1, :updated 0, :deleted 0})
             (sync-database!' "update-field-values" (data/db)))))
    (testing "Now re-sync the table and make sure they're back"
      (sync/sync-table! (Table (mt/id :venues)))
      (is (= [1 2 3 4]
             (venues-price-field-values))))))

(deftest sync-should-update-test
  (testing "Test that syncing will cause FieldValues to be updated"
    (testing "Check that we have expected field values to start with"
      (is (= [1 2 3 4]
             (venues-price-field-values))))
    (testing "Update the FieldValues, remove one of the values that should be there"
      (db/update! FieldValues (db/select-one-id FieldValues :field_id (mt/id :venues :price)) :values [1 2 3])
      (is (= [1 2 3]
             (venues-price-field-values))))
    (testing "Now re-sync the table and validate the field values updated"
      (is (= (repeat 2 {:errors 0, :created 0, :updated 1, :deleted 0})
             (sync-database!' "update-field-values" (data/db)))))
    (testing "Make sure the value is back"
      (is (= [1 2 3 4]
             (venues-price-field-values))))))

(deftest auto-list-test
  ;; A Field with 50 values should get marked as `auto-list` on initial sync, because it should be 'list', but was
  ;; marked automatically, as opposed to explicitly (`list`)
  (one-off-dbs/with-blueberries-db
    ;; insert 50 rows & sync
    (one-off-dbs/insert-rows-and-sync! (range 50))
    (testing "has_field_values should be auto-list"
      (is (= :auto-list
             (db/select-one-field :has_field_values Field :id (mt/id :blueberries_consumed :num)))))

    (testing "... and it should also have some FieldValues"
      (is (= {:values                (range 50)
              :human_readable_values []}
             (into {} (db/select-one [FieldValues :values :human_readable_values]
                        :field_id (mt/id :blueberries_consumed :num))))))

    (testing (str "if the number grows past the threshold & we sync again it should get unmarked as auto-list and set "
                  "back to `nil` (#3215)\n")
      ;; now insert enough bloobs to put us over the limit and re-sync.
      (one-off-dbs/insert-rows-and-sync! (range 50 (+ 100 field-values/auto-list-cardinality-threshold)))
      (testing "has_field_values should have been set to nil."
        (is (= nil
               (db/select-one-field :has_field_values Field :id (mt/id :blueberries_consumed :num)))))

      (testing "its FieldValues should also get deleted."
        (is (= nil
               (db/select-one [FieldValues :values :human_readable_values]
                 :field_id (mt/id :blueberries_consumed :num))))))))

(deftest list-test
  (testing (str "If we had explicitly marked the Field as `list` (instead of `auto-list`), adding extra values "
                "shouldn't change anything!")
    (one-off-dbs/with-blueberries-db
      ;; insert 50 bloobs & sync
      (one-off-dbs/insert-rows-and-sync! (range 50))
      ;; change has_field_values to list
      (db/update! Field (mt/id :blueberries_consumed :num) :has_field_values "list")
      ;; insert more bloobs & re-sync
      (one-off-dbs/insert-rows-and-sync! (range 50 (+ 100 field-values/auto-list-cardinality-threshold)))
      (testing "has_field_values shouldn't change"
        (is (= :list
               (db/select-one-field :has_field_values Field :id (mt/id :blueberries_consumed :num)))))
      (testing (str "it should still have FieldValues, and have new ones for the new Values. It should have 200 values "
                    "even though this is past the normal limit of 100 values!")
        (is (= {:values                (range 200)
                :human_readable_values []}
               (into {} (db/select-one [FieldValues :values :human_readable_values]
                          :field_id (mt/id :blueberries_consumed :num)))))))))
