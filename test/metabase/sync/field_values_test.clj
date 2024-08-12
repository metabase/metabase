(ns ^:mb/once metabase.sync.field-values-test
  "Tests around the way Metabase syncs FieldValues, and sets the values of `field.has_field_values`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models :refer [Field FieldValues Table]]
   [metabase.models.field-values :as field-values]
   [metabase.sync :as sync]
   [metabase.sync.util-test :as sync.util-test]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [toucan2.core :as t2]))

(defn- venues-price-field-values []
  (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price), :type :full))

(defn- sync-database!' [step database]
  (let [{:keys [step-info task-history]} (sync.util-test/sync-database! step database)]
    [(sync.util-test/only-step-keys step-info)
     (:task_details task-history)]))

(deftest sync-recreate-field-values-test
  (testing "Test that when we delete FieldValues syncing the Table again will cause them to be re-created"
    (testing "Check that we have expected field values to start with"
      ;; sync to make sure the field values are filled
      (sync-database!' "update-field-values" (data/db))
      (is (= [1 2 3 4]
             (venues-price-field-values))))
    (testing "Delete the Field values, make sure they're gone"
      (t2/delete! FieldValues :field_id (mt/id :venues :price))
      (is (= nil
             (venues-price-field-values))))
    (testing "After the delete, a field values should be created, the rest updated"
      (is (= (repeat 2 {:errors 0, :created 1, :updated 0, :deleted 0})
             (sync-database!' "update-field-values" (data/db)))))
    (testing "Now re-sync the table and make sure they're back"
      (sync/sync-table! (t2/select-one Table :id (mt/id :venues)))
      (is (= [1 2 3 4]
             (venues-price-field-values))))))

(deftest sync-should-update-test
  (testing "Test that syncing will cause FieldValues to be updated"
    (testing "Check that we have expected field values to start with"
      ;; sync to make sure the field values are filled
      (sync-database!' "update-field-values" (data/db))
      (is (= [1 2 3 4]
             (venues-price-field-values))))
    (testing "Update the FieldValues, remove one of the values that should be there"
      (t2/update! FieldValues (t2/select-one-pk FieldValues :field_id (mt/id :venues :price) :type :full) {:values [1 2 3]})
      (is (= [1 2 3]
             (venues-price-field-values))))
    (testing "Now re-sync the table and validate the field values updated"
      (is (= (repeat 2 {:errors 0, :created 0, :updated 1, :deleted 0})
             (sync-database!' "update-field-values" (data/db)))))
    (testing "Make sure the value is back"
      (is (= [1 2 3 4]
             (venues-price-field-values))))))

(deftest sync-should-properly-handle-last-used-at
  (testing "Test that syncing will skip updating inactive FieldValues"
    (mt/with-full-data-perms-for-all-users!
      (t2/update! FieldValues
                  (t2/select-one-pk FieldValues :field_id (mt/id :venues :price) :type :full)
                  {:last_used_at (t/minus (t/offset-date-time) (t/days 20))
                   :values [1 2 3]})
      (is (= (repeat 2 {:errors 0, :created 0, :updated 0, :deleted 0})
             (sync-database!' "update-field-values" (data/db))))
      (is (= [1 2 3] (venues-price-field-values)))
      (testing "Fetching field values causes an on-demand update and marks Field Values as active"
        (is (partial= {:values [[1] [2] [3] [4]]}
                      (mt/user-http-request :rasta :get 200 (format "field/%d/values" (mt/id :venues :price)))))
        (is (t/after? (t2/select-one-fn :last_used_at FieldValues :field_id (mt/id :venues :price) :type :full)
                      (t/minus (t/offset-date-time) (t/hours 2))))
        (testing "Field is syncing after usage"
          (t2/update! FieldValues
                      (t2/select-one-pk FieldValues :field_id (mt/id :venues :price) :type :full)
                      {:values [1 2 3]})
          (is (= (repeat 2 {:errors 0, :created 0, :updated 1, :deleted 0})
                 (sync-database!' "update-field-values" (data/db))))
          (is (partial= {:values [[1] [2] [3] [4]]}
                        (mt/user-http-request :rasta :get 200 (format "field/%d/values" (mt/id :venues :price))))))))))

(deftest sync-should-delete-expired-advanced-field-values-test
  (testing "Test that the expired Advanced FieldValues should be removed"
    (let [field-id                  (mt/id :venues :price)
          expired-created-at        (t/minus (t/offset-date-time) (t/plus field-values/advanced-field-values-max-age (t/days 1)))
          now                       (t/offset-date-time)
          [expired-sandbox-id
           expired-linked-filter-id
           valid-sandbox-id
           valid-linked-filter-id
           old-full-id
           new-full-id]             (t2/insert-returning-pks!
                                      (t2/table-name FieldValues)
                                      [;; expired sandbox fieldvalues
                                       {:field_id   field-id
                                        :type       "sandbox"
                                        :hash_key   "random-hash"
                                        :created_at expired-created-at
                                        :updated_at expired-created-at}
                                       ;; expired linked-filter fieldvalues
                                       {:field_id   field-id
                                        :type       "linked-filter"
                                        :hash_key   "random-hash"
                                        :created_at expired-created-at
                                        :updated_at expired-created-at}
                                       ;; valid sandbox fieldvalues
                                       {:field_id   field-id
                                        :type       "sandbox"
                                        :hash_key   "random-hash"
                                        :created_at now
                                        :updated_at now}
                                       ;; valid linked-filter fieldvalues
                                       {:field_id   field-id
                                        :type       "linked-filter"
                                        :hash_key   "random-hash"
                                        :created_at now
                                        :updated_at now}
                                       ;; old full fieldvalues
                                       {:field_id   field-id
                                        :type       "full"
                                        :created_at expired-created-at
                                        :updated_at expired-created-at}
                                       ;; new full fieldvalues
                                       {:field_id   field-id
                                        :type       "full"
                                        :created_at now
                                        :updated_at now}])]
      (is (= (repeat 2 {:deleted 2})
             (sync-database!' "delete-expired-advanced-field-values" (data/db))))
      (testing "The expired Advanced FieldValues should be deleted"
        (is (not (t2/exists? FieldValues :id [:in [expired-sandbox-id expired-linked-filter-id]]))))
      (testing "The valid Advanced FieldValues and full Fieldvalues(both old and new) should not be deleted"
        (is (t2/exists? FieldValues :id [:in [valid-sandbox-id valid-linked-filter-id new-full-id old-full-id]]))))))

(deftest auto-list-with-cardinality-threshold-test
  ;; A Field with 50 values should get marked as `auto-list` on initial sync, because it should be 'list', but was
  ;; marked automatically, as opposed to explicitly (`list`)
  (one-off-dbs/with-blueberries-db
    ;; insert 50 rows & sync
    (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50))
    (testing "has_field_values should be auto-list"
      (is (= :auto-list
             (t2/select-one-fn :has_field_values Field :id (mt/id :blueberries_consumed :str)))))

    (testing "... and it should also have some FieldValues"
      (is (= {:values                (one-off-dbs/range-str 50)
              :human_readable_values []
              :has_more_values       false}
             (into {} (t2/select-one [FieldValues :values :human_readable_values :has_more_values]
                                     :field_id (mt/id :blueberries_consumed :str))))))

    ;; Manually add an advanced field values to test whether or not it got deleted later
    (t2/insert! FieldValues {:field_id (mt/id :blueberries_consumed :str)
                             :type :sandbox
                             :hash_key "random-key"})

    (testing (str "if the number grows past the cardinality threshold & we sync again it should get unmarked as auto-list "
                  "and set back to `nil` (#3215)\n")
      ;; now insert enough bloobs to put us over the limit and re-sync.
      (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50 (+ 100 field-values/auto-list-cardinality-threshold)))
      (testing "has_field_values should have been set to nil."
        (is (= nil
               (t2/select-one-fn :has_field_values Field :id (mt/id :blueberries_consumed :str)))))

      (testing "its FieldValues should also get deleted."
        (is (= nil
               (t2/select-one FieldValues
                              :field_id (mt/id :blueberries_consumed :str))))))))

(deftest auto-list-with-max-length-threshold-test
  (one-off-dbs/with-blueberries-db
    ;; insert 50 rows & sync
    (one-off-dbs/insert-rows-and-sync! [(str/join (repeat 50 "A"))])
    (testing "has_field_values should be auto-list"
      (is (= :auto-list
             (t2/select-one-fn :has_field_values Field :id (mt/id :blueberries_consumed :str)))))

    (testing "... and it should also have some FieldValues"
      (is (= {:values                [(str/join (repeat 50 "A"))]
              :human_readable_values []}
             (into {} (t2/select-one [FieldValues :values :human_readable_values]
                                     :field_id (mt/id :blueberries_consumed :str))))))

    (testing (str "If the total length of all values exceeded the length threshold, it should get unmarked as auto list "
                  "and set back to `nil`")
      (one-off-dbs/insert-rows-and-sync! [(str/join (repeat (+ 100 field-values/*total-max-length*) "A"))])
      (testing "has_field_values should have been set to nil."
        (is (= nil
               (t2/select-one-fn :has_field_values Field :id (mt/id :blueberries_consumed :str)))))

      (testing "All of its FieldValues should also get deleted."
        (is (= nil
               (t2/select-one FieldValues
                              :field_id (mt/id :blueberries_consumed :str))))))))

(deftest list-with-cardinality-threshold-test
  (testing "If we had explicitly marked the Field as `list` (instead of `auto-list`)"
    (one-off-dbs/with-blueberries-db
      ;; insert 50 bloobs & sync
      (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50))
      ;; change has_field_values to list
      (t2/update! Field (mt/id :blueberries_consumed :str) {:has_field_values "list"})
      (testing "has_more_values should initially be false"
        (is (= false
               (t2/select-one-fn :has_more_values FieldValues :field_id (mt/id :blueberries_consumed :str)))))
      ;; Manually add an advanced field values to test whether or not it got deleted later
      (t2/insert! FieldValues {:field_id (mt/id :blueberries_consumed :str)
                               :type :sandbox
                               :hash_key "random-key"})
      (testing "adding more values even if it's exceed our cardinality limit, "
        (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50 (+ 100 field-values/*absolute-max-distinct-values-limit*)))
        (testing "has_field_values shouldn't change and has_more_values should be true"
          (is (= :list
                 (t2/select-one-fn :has_field_values Field
                                      :id (mt/id :blueberries_consumed :str)))))
        (testing "it should still have FieldValues, but the stored list has at most [metadata-queries/absolute-max-distinct-values-limit] elements"
          (is (= {:values                (take field-values/*absolute-max-distinct-values-limit*
                                               (one-off-dbs/range-str (+ 100 field-values/*absolute-max-distinct-values-limit*)))
                  :human_readable_values []
                  :has_more_values       true}
                 (into {} (t2/select-one [FieldValues :values :human_readable_values :has_more_values]
                                         :field_id (mt/id :blueberries_consumed :str))))))
        (testing "The advanced field values of this field should be deleted"
          (is (= 0 (t2/count FieldValues :field_id (mt/id :blueberries_consumed :str)
                             :type [:not= :full]))))))))

(deftest list-with-max-length-threshold-test
  (testing "If we had explicitly marked the Field as `list` (instead of `auto-list`) "
    (one-off-dbs/with-blueberries-db
      ;; insert a row with values contain 50 chars
      (one-off-dbs/insert-rows-and-sync! [(str/join (repeat 50 "A"))])
      ;; change has_field_values to list
      (t2/update! Field (mt/id :blueberries_consumed :str) {:has_field_values "list"})
      (testing "has_more_values should initially be false"
        (is (= false
               (t2/select-one-fn :has_more_values FieldValues :field_id (mt/id :blueberries_consumed :str)))))

      (testing "insert a row with the value length exceeds our length limit\n"
        (one-off-dbs/insert-rows-and-sync! [(str/join (repeat (+ 100 field-values/*total-max-length*) "A"))])
        (testing "has_field_values shouldn't change and has_more_values should be true"
          (is (= :list
                 (t2/select-one-fn :has_field_values Field
                                      :id (mt/id :blueberries_consumed :str)))))
        (testing "it should still have FieldValues, but the stored list is just a sub-list of all distinct values and `has_more_values` = true"
          (is (= {:values                [(str/join (repeat 50 "A"))]
                  :human_readable_values []
                  :has_more_values       true}
                 (into {} (t2/select-one [FieldValues :values :human_readable_values :has_more_values]
                                        :field_id (mt/id :blueberries_consumed :str))))))))))
