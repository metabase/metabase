(ns metabase.sync.field-values-test
  "Tests around the way Metabase syncs FieldValues, and sets the values of `field.has_field_values`."
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.models.field :refer [Field]]
            [metabase.models.field-values :as field-values :refer [FieldValues]]
            [metabase.models.table :refer [Table]]
            [metabase.sync :as sync]
            [metabase.sync.util-test :as sync.util-test]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.test.data.one-off-dbs :as one-off-dbs]
            [toucan.db :as db]))

(defn- venues-price-field-values []
  (db/select-one-field :values FieldValues, :field_id (mt/id :venues :price)))

(defn- sync-database!' [step database]
  (let [{:keys [step-info task-history]} (sync.util-test/sync-database! step database)]
    [(sync.util-test/only-step-keys step-info)
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

(deftest auto-list-with-cardinality-threshold-test
  ;; A Field with 50 values should get marked as `auto-list` on initial sync, because it should be 'list', but was
  ;; marked automatically, as opposed to explicitly (`list`)
  (one-off-dbs/with-blueberries-db
    ;; insert 50 rows & sync
    (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50))
    (testing "has_field_values should be auto-list"
      (is (= :auto-list
             (db/select-one-field :has_field_values Field :id (mt/id :blueberries_consumed :str)))))

    (testing "... and it should also have some FieldValues"
      (is (= {:values                (one-off-dbs/range-str 50)
              :human_readable_values []
              :has_more_values       false}
             (into {} (db/select-one [FieldValues :values :human_readable_values :has_more_values]
                                     :field_id (mt/id :blueberries_consumed :str))))))

    (testing (str "if the number grows past the cardinality threshold & we sync again it should get unmarked as auto-list and set "
                  "back to `nil` (#3215)\n")
      ;; now insert enough bloobs to put us over the limit and re-sync.
      (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50 (+ 100 field-values/auto-list-cardinality-threshold)))
      (testing "has_field_values should have been set to nil."
        (is (= nil
               (db/select-one-field :has_field_values Field :id (mt/id :blueberries_consumed :str)))))

      (testing "its FieldValues should also get deleted."
        (is (= nil
               (db/select-one FieldValues
                              :field_id (mt/id :blueberries_consumed :str))))))))

(deftest auto-list-with-max-length-threshold-test
  (one-off-dbs/with-blueberries-db
    ;; insert 50 rows & sync
    (one-off-dbs/insert-rows-and-sync! [(str/join (repeat 50 "A"))])
    (testing "has_field_values should be auto-list"
      (is (= :auto-list
             (db/select-one-field :has_field_values Field :id (mt/id :blueberries_consumed :str)))))

    (testing "... and it should also have some FieldValues"
      (is (= {:values                [(str/join (repeat 50 "A"))]
              :human_readable_values []}
             (into {} (db/select-one [FieldValues :values :human_readable_values]
                                     :field_id (mt/id :blueberries_consumed :str))))))

    (testing (str "If the total length of all values exceeded the length threshold, it should get unmarked as auto list "
                  "and set back to `nil`")
      (one-off-dbs/insert-rows-and-sync! [(str/join (repeat (+ 100 field-values/total-max-length) "A"))])
      (testing "has_field_values should have been set to nil."
        (is (= nil
               (db/select-one-field :has_field_values Field :id (mt/id :blueberries_consumed :str)))))

      (testing "its FieldValues should also get deleted."
        (is (= nil
               (db/select-one FieldValues
                              :field_id (mt/id :blueberries_consumed :str))))))))

(deftest list-with-cardinality-threshold-test
  (testing "If we had explicitly marked the Field as `list` (instead of `auto-list`)"
    (one-off-dbs/with-blueberries-db
      ;; insert 50 bloobs & sync
      (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50))
      ;; change has_field_values to list
      (db/update! Field (mt/id :blueberries_consumed :str) :has_field_values "list")
      (testing "has_more_values should initially be false"
        (is (= false
               (db/select-one-field :has_more_values FieldValues :field_id (mt/id :blueberries_consumed :str)))))

      (testing "adding more values even if it's exceed our cardinality limit, "
        (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50 (+ 100 metadata-queries/absolute-max-distinct-values-limit)))
        (testing "has_field_values shouldn't change and has_more_values should be true"
          (is (= :list
                 (db/select-one-field :has_field_values Field
                                      :id (mt/id :blueberries_consumed :str)))))
        (testing "it should still have FieldValues, but the stored list has at most [metadata-queries/absolute-max-distinct-values-limit] elements"
          (is (= {:values                (take metadata-queries/absolute-max-distinct-values-limit
                                               (one-off-dbs/range-str (+ 100 metadata-queries/absolute-max-distinct-values-limit)))
                  :human_readable_values []
                  :has_more_values       true}
                 (into {} (db/select-one [FieldValues :values :human_readable_values :has_more_values]
                                         :field_id (mt/id :blueberries_consumed :str))))))))))

(deftest list-with-max-length-threshold-test
  (testing "If we had explicitly marked the Field as `list` (instead of `auto-list`) "
    (one-off-dbs/with-blueberries-db
      ;; insert a row with values contain 50 chars
      (one-off-dbs/insert-rows-and-sync! [(str/join (repeat 50 "A"))])
      ;; change has_field_values to list
      (db/update! Field (mt/id :blueberries_consumed :str) :has_field_values "list")
      (testing "has_more_values should initially be false"
        (is (= false
               (db/select-one-field :has_more_values FieldValues :field_id (mt/id :blueberries_consumed :str)))))

      (testing "insert a row with the value length exceeds our length limit\n"
        (one-off-dbs/insert-rows-and-sync! [(str/join (repeat (+ 100 field-values/total-max-length) "A"))])
        (testing "has_field_values shouldn't change and has_more_values should be true"
          (is (= :list
                 (db/select-one-field :has_field_values Field
                                      :id (mt/id :blueberries_consumed :str)))))
        (testing "it should still have FieldValues, but the stored list is just a sub-list of all distinct values and `has_more_values` = true"
          (is (= {:values                [(str/join (repeat 50 "A"))]
                  :human_readable_values []
                  :has_more_values       true}
                 (into {} (db/select-one [FieldValues :values :human_readable_values :has_more_values]
                                        :field_id (mt/id :blueberries_consumed :str))))))))))
