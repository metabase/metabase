(ns metabase.sync.field-values-test
  "Tests around the way Metabase syncs FieldValues, and sets the values of `field.has_field_values`."
  (:require [clojure.test :refer :all]
            [metabase.models
             [field :refer [Field]]
             [field-values :as field-values :refer [FieldValues]]
             [table :refer [Table]]]
            [metabase.sync :as sync]
            [metabase.sync.util-test :as sut]
            [metabase.test.data :as data]
            [metabase.test.data.one-off-dbs :as one-off-dbs]
            [toucan.db :as db]))

;; Test that when we delete FieldValues syncing the Table again will cause them to be re-created
(defn- venues-price-field-values []
  (db/select-one-field :values FieldValues, :field_id (data/id :venues :price)))

(defn- sync-database!' [step database]
  (let [{:keys [step-info task-history]} (sut/sync-database! step database)]
    [(sut/only-step-keys step-info)
     (:task_details task-history)]))

(deftest field-updating-test
  (testing "syncing updates nil field values"
    (are [expected op] (= expected op)
      [1 2 3 4] (venues-price-field-values)
      nil       (do (db/delete! FieldValues :field_id (data/id :venues :price))
                    (venues-price-field-values))

      (repeat 2 {:errors 0, :created 1, :updated 0, :deleted 0})
      (sync-database!' "update-field-values" (data/db))

      [1 2 3 4] (do (sync/sync-table! (Table (data/id :venues)))
                    (venues-price-field-values))))
  (testing "syncing will cause FieldValues to be updated"
    (are [expected op] (= expected op)
      [1 2 3 4] (venues-price-field-values)
      [1 2 3  ] (do (db/update! FieldValues (db/select-one-id FieldValues :field_id (data/id :venues :price))
                      :values [1 2 3])
                    (venues-price-field-values))

      (repeat 2 {:errors 0, :created 0, :updated 1, :deleted 0})
      (sync-database!' "update-field-values" (data/db))

      [1 2 3 4] (venues-price-field-values))))

(deftest auto-list-tests
  (let [below-threshold        (range (dec field-values/auto-list-cardinality-threshold))
        above-threshold        (range (inc field-values/auto-list-cardinality-threshold))
        really-above-threshold (range (+ 100 field-values/auto-list-cardinality-threshold))
        field-info             #(db/select-one-field :has_field_values Field
                                  :id (data/id :blueberries_consumed :num))
        cached-values          #(db/select-one [FieldValues :values :human_readable_values]
                                  :field_id (data/id :blueberries_consumed :num))]
    (testing "A field with few enough values"
      (one-off-dbs/with-blueberries-db
        (testing "should get marked as `auto-list` on initial sync"
          (one-off-dbs/insert-rows-and-sync! below-threshold)
          (is (= :auto-list (field-info))))
        (testing "its values should be stored in the metabase db"
          (is (= (field-values/map->FieldValuesInstance
                   {:values (vec below-threshold), :human_readable_values {}})
                 (cached-values))))
        (testing "If it grows larger than the threshold"
          (one-off-dbs/insert-rows-and-sync! below-threshold)
          (testing "It loses the `auto-list`"
            (one-off-dbs/insert-rows-and-sync! above-threshold)
            (is (nil? (field-info))))
          (testing "It loses the stored values in the metabase db"
            (testing "After updating loses auto-list"
              (one-off-dbs/insert-rows-and-sync! above-threshold)
              (is (nil? (field-info)))
              (is (nil? (cached-values))))))))
    (testing "If marked as `list` adding extra values should not remove anything"
      (one-off-dbs/with-blueberries-db
        (one-off-dbs/insert-rows-and-sync! below-threshold)
        (is (= :auto-list (field-info)))
        ;; human marks as list
        (db/update! Field (data/id :blueberries_consumed :num) :has_field_values "list")
        (one-off-dbs/insert-rows-and-sync! really-above-threshold)
        (is (= :list (field-info)))
        (is (= (count really-above-threshold) (-> (cached-values) :values count)))))))
