(ns metabase.sync.field-values-test
  "Tests around the way Metabase syncs FieldValues, and sets the values of `field.has_field_values`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.analyze.core :as analyze]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor :as qp]
   [metabase.sync.analyze.test-util :as analyze.tu]
   [metabase.sync.core :as sync]
   [metabase.sync.db :as sync.db]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.sync.util-test :as sync.util-test]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.util :as u]
   [metabase.warehouse-schema.field-values.distinct-batch :as distinct-batch]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- venues-price-field-values []
  (t2/select-one-fn :values :model/FieldValues, :field_id (mt/id :venues :price), :type :full))

(defn- sync-database!' [step database]
  (let [{:keys [step-info task-history]} (sync.util-test/sync-database! step database)]
    [(sync.util-test/only-step-keys step-info)
     (:task_details task-history)]))

(defn- sync-database-counts!
  "Like [[sync-database!']] but keeps only the create/update/delete/error counts. The
  `:probed`/`:queries` observability counters are dropped — they're a function of how many
  fields across the whole database have active FieldValues, which is global state these
  whole-database sync tests don't (and shouldn't) pin down."
  [step database]
  (mapv #(select-keys % [:errors :created :updated :deleted])
        (sync-database!' step database)))

(deftest sync-recreate-field-values-test
  (testing "Test that when we delete FieldValues syncing the Table again will cause them to be re-created"
    (testing "Check that we have expected field values to start with"
      ;; Manually activate Field values since they are not created during sync (#53387)
      (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :venues :price)))
      ;; Reset them to values that should get updated during sync
      (t2/update! :model/FieldValues :field_id (mt/id :venues :price) {:values [10 20 30 40]})
      ;; sync to make sure the field values are filled
      (sync-database!' "update-field-values" (data/db))
      (is (= [1 2 3 4]
             (venues-price-field-values))))
    (testing "Delete the Field values, make sure they're gone"
      (t2/delete! :model/FieldValues :field_id (mt/id :venues :price))
      (is (= nil
             (venues-price-field-values))))
    (testing "After the delete, a field values should not be created"
      (is (= (repeat 2 {:errors 0, :created 0, :updated 0, :deleted 0})
             (sync-database-counts! "update-field-values" (data/db)))))
    (testing "Now re-sync the table and make sure they're back"
      ;; Manually activate Field values since they are not created during sync (#53387)
      (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :venues :price)))
      ;; Reset them to values that should get updated during sync
      (t2/update! :model/FieldValues :field_id (mt/id :venues :price) {:values [10 20 30 40]})
      (sync/sync-table! (t2/select-one :model/Table :id (mt/id :venues)))
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
      (t2/update! :model/FieldValues :id (t2/select-one-pk :model/FieldValues :field_id (mt/id :venues :price) :type :full) {:values [1 2 3]})
      (is (= [1 2 3]
             (venues-price-field-values))))
    (testing "Now re-sync the table and validate the field values updated"
      (is (= (repeat 2 {:errors 0, :created 0, :updated 1, :deleted 0})
             (sync-database-counts! "update-field-values" (data/db)))))
    (testing "Make sure the value is back"
      (is (= [1 2 3 4]
             (venues-price-field-values))))))

(deftest sync-skips-field-values-of-user-hidden-table-test
  (testing "sync refreshes a table's FieldValues until a user hides it through PUT /api/table/:id"
    (data/with-temp-copy-of-db
      (letfn [(field-values-after-sync! []
                (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :venues :price)))
                (t2/update! :model/FieldValues :field_id (mt/id :venues :price) :type :full {:values [10 20 30 40]})
                (sync/update-field-values! (:id (data/db)))
                (venues-price-field-values))]
        (is (= [1 2 3 4] (field-values-after-sync!)))
        (mt/user-http-request :crowberto :put 200 (format "table/%d" (mt/id :venues)) {:visibility_type "hidden"})
        (is (= [10 20 30 40] (field-values-after-sync!)))))))

(deftest sync-should-properly-handle-last-used-at
  (try
    (testing "Test that syncing will skip updating inactive FieldValues"
      (mt/with-full-data-perms-for-all-users!
        (t2/update! :model/FieldValues
                    :id (t2/select-one-pk :model/FieldValues :field_id (mt/id :venues :price) :type :full)
                    {:last_used_at (t/minus (t/offset-date-time) (t/days 20))
                     :values       [1 2 3]})
        (is (= (repeat 2 {:errors 0, :created 0, :updated 0, :deleted 0})
               (sync-database-counts! "update-field-values" (data/db))))
        (is (= [1 2 3] (venues-price-field-values)))
        (testing "Fetching field values causes an on-demand update and marks Field Values as active"
          (is (partial= {:values [[1] [2] [3] [4]]}
                        (mt/user-http-request :rasta :get 200 (format "field/%d/values" (mt/id :venues :price)))))
          (is (t/after? (t2/select-one-fn :last_used_at :model/FieldValues :field_id (mt/id :venues :price) :type :full)
                        (t/minus (t/offset-date-time) (t/hours 2))))
          (testing "Field is syncing after usage"
            (t2/update! :model/FieldValues
                        :id (t2/select-one-pk :model/FieldValues :field_id (mt/id :venues :price) :type :full)
                        {:values [1 2 3]})
            (is (= (repeat 2 {:errors 0, :created 0, :updated 1, :deleted 0})
                   (sync-database-counts! "update-field-values" (data/db))))
            (is (partial= {:values [[1] [2] [3] [4]]}
                          (mt/user-http-request :rasta :get 200 (format "field/%d/values" (mt/id :venues :price)))))))
        (testing "If only advanced fields have been used recently, still sync"
          (t2/update! :model/FieldValues
                      :id (t2/select-one-pk :model/FieldValues :field_id (mt/id :venues :price) :type :full)
                      {:last_used_at (t/minus (t/offset-date-time) (t/days 20))
                       :values       [1 2 3]})
          (t2/insert! :model/FieldValues {:field_id     (mt/id :venues :price)
                                          :type         :advanced
                                          :hash_key     "random-key"
                                          :last_used_at (t/instant)})
          (is (= (repeat 2 {:errors 0, :created 0, :updated 1, :deleted 0})
                 (sync-database-counts! "update-field-values" (data/db)))))
        (is (= [1 2 3 4] (venues-price-field-values)))))
    (finally
      ; clear out our changes to not mess up other tests. Changes are more than with-model-cleanup handles
      (t2/delete! :model/FieldValues :field_id (mt/id :venues :price))
      (mt/user-http-request :rasta :get 200 (format "field/%d/values" (mt/id :venues :price))))))

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
                                     (t2/table-name :model/FieldValues)
                                     [;; expired sandbox fieldvalues
                                      {:field_id   field-id
                                       :type       "advanced"
                                       :hash_key   "random-hash"
                                       :created_at expired-created-at
                                       :updated_at expired-created-at}
                                      ;; expired linked-filter fieldvalues
                                      {:field_id   field-id
                                       :type       "advanced"
                                       :hash_key   "random-hash"
                                       :created_at expired-created-at
                                       :updated_at expired-created-at}
                                      ;; valid sandbox fieldvalues
                                      {:field_id   field-id
                                       :type       "advanced"
                                       :hash_key   "random-hash"
                                       :created_at now
                                       :updated_at now}
                                      ;; valid linked-filter fieldvalues
                                      {:field_id   field-id
                                       :type       "advanced"
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
        (is (not (t2/exists? :model/FieldValues :id [:in [expired-sandbox-id expired-linked-filter-id]]))))
      (testing "The valid Advanced FieldValues and full Fieldvalues(both old and new) should not be deleted"
        (is (t2/exists? :model/FieldValues :id [:in [valid-sandbox-id valid-linked-filter-id new-full-id old-full-id]]))))))

(deftest auto-list-with-cardinality-threshold-test
  ;; A Field with 50 values should get marked as `auto-list` on initial sync, because it should be 'list', but was
  ;; marked automatically, as opposed to explicitly (`list`)
  (one-off-dbs/with-blueberries-db
    ;; insert 50 rows & sync
    (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50))
    ;; Manually activate Field values since they are not created during sync (#53387)
    (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :blueberries_consumed :str)))
    (testing "has_field_values should be auto-list"
      (is (= :auto-list
             (t2/select-one-fn :has_field_values :model/Field :id (mt/id :blueberries_consumed :str)))))
    (testing "... and it should also have some FieldValues"
      (is (= {:values                (one-off-dbs/range-str 50)
              :human_readable_values []
              :has_more_values       false}
             (into {} (t2/select-one [:model/FieldValues :values :human_readable_values :has_more_values]
                                     :field_id (mt/id :blueberries_consumed :str))))))
    ;; Manually add an advanced field values to test whether or not it got deleted later
    (t2/insert! :model/FieldValues {:field_id (mt/id :blueberries_consumed :str)
                                    :type :advanced
                                    :hash_key "random-key"})
    (testing "We mark the field values as :has_more_values when it grows too big."
      ;; now insert enough bloobs to put us over the limit and re-sync.
      (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50 (+ 100 analyze/auto-list-cardinality-threshold)))
      (testing "has_field_values stay auto-list."
        (is (= :auto-list
               (t2/select-one-fn :has_field_values :model/Field :id (mt/id :blueberries_consumed :str)))))
      (testing "its FieldValues be limited."
        (is (=? {:values #(>= analyze/auto-list-cardinality-threshold (count %))
                 :has_more_values true}
                (t2/select-one :model/FieldValues
                               :field_id (mt/id :blueberries_consumed :str))))))))

(deftest auto-list-with-max-length-threshold-test
  (one-off-dbs/with-blueberries-db
    ;; insert 50 rows & sync
    (one-off-dbs/insert-rows-and-sync! [(str/join (repeat 50 "A"))])
    ;; Manually activate Field values since they are not created during sync (#53387)
    (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :blueberries_consumed :str)))
    (testing "has_field_values should be auto-list"
      (is (= :auto-list
             (t2/select-one-fn :has_field_values :model/Field :id (mt/id :blueberries_consumed :str)))))
    (testing "... and it should also have some FieldValues"
      (is (= {:values                [(str/join (repeat 50 "A"))]
              :human_readable_values []}
             (into {} (t2/select-one [:model/FieldValues :values :human_readable_values]
                                     :field_id (mt/id :blueberries_consumed :str))))))
    (testing "If the total length of all values exceeded the length threshold, it should get stay as auto list but be limitted"
      (one-off-dbs/insert-rows-and-sync! [(str/join (repeat 10 "B"))
                                          (str/join (repeat (+ 100 field-values/*total-max-length*) "X"))
                                          (str/join (repeat 10 "Z"))])
      (testing "has_field_values should have been set to nil."
        (is (= :auto-list
               (t2/select-one-fn :has_field_values :model/Field :id (mt/id :blueberries_consumed :str)))))
      (testing "Field values before the limit is reached are added"
        (is (=? {:has_more_values true
                 :values [(str/join (repeat 50 "A"))
                          (str/join (repeat 10 "B"))]}
                (t2/select-one :model/FieldValues
                               :field_id (mt/id :blueberries_consumed :str))))))))

(deftest list-with-cardinality-threshold-test
  (testing "If we had explicitly marked the Field as `list` (instead of `auto-list`)"
    (one-off-dbs/with-blueberries-db
      ;; insert 50 bloobs & sync
      (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50))
      ;; change has_field_values to list
      ;; Manually activate Field values since they are not created during sync (#53387)
      (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :blueberries_consumed :str)))
      (t2/update! :model/Field :id (mt/id :blueberries_consumed :str) {:has_field_values "list"})
      (testing "has_more_values should initially be false"
        (is (= false
               (t2/select-one-fn :has_more_values :model/FieldValues :field_id (mt/id :blueberries_consumed :str)))))
      ;; Manually add an advanced field values to test whether or not it got deleted later
      (t2/insert! :model/FieldValues {:field_id (mt/id :blueberries_consumed :str)
                                      :type :advanced
                                      :hash_key "random-key"})
      (testing "adding more values even if it's exceed our cardinality limit, "
        (one-off-dbs/insert-rows-and-sync! (one-off-dbs/range-str 50 (+ 100 field-values/*distinct-limit*)))
        (testing "has_field_values shouldn't change and has_more_values should be true"
          (is (= :list
                 (t2/select-one-fn :has_field_values :model/Field
                                   :id (mt/id :blueberries_consumed :str)))))
        (testing "it should still have FieldValues, but the stored list has at most field-values/*distinct-limit* elements"
          (is (= {:values                (take field-values/*distinct-limit*
                                               (one-off-dbs/range-str (+ 100 field-values/*distinct-limit*)))
                  :human_readable_values []
                  :has_more_values       true}
                 (into {} (t2/select-one [:model/FieldValues :values :human_readable_values :has_more_values]
                                         :field_id (mt/id :blueberries_consumed :str))))))
        (testing "The advanced field values of this field should be deleted"
          (is (= 0 (t2/count :model/FieldValues :field_id (mt/id :blueberries_consumed :str)
                             :type [:not= :full]))))))))

(deftest list-with-max-length-threshold-test
  (testing "If we had explicitly marked the Field as `list` (instead of `auto-list`) "
    (one-off-dbs/with-blueberries-db
      ;; insert a row with values contain 50 chars
      (one-off-dbs/insert-rows-and-sync! [(str/join (repeat 50 "A"))])
      ;; Manually activate Field values since they are not created during sync (#53387)
      (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :blueberries_consumed :str)))
      ;; change has_field_values to list
      (t2/update! :model/Field :id (mt/id :blueberries_consumed :str) {:has_field_values "list"})
      (testing "has_more_values should initially be false"
        (is (= false
               (t2/select-one-fn :has_more_values :model/FieldValues :field_id (mt/id :blueberries_consumed :str)))))
      (testing "insert a row with the value length exceeds our length limit\n"
        (one-off-dbs/insert-rows-and-sync! [(str/join (repeat (+ 100 field-values/*total-max-length*) "A"))])
        (testing "has_field_values shouldn't change and has_more_values should be true"
          (is (= :list
                 (t2/select-one-fn :has_field_values :model/Field
                                   :id (mt/id :blueberries_consumed :str)))))
        (testing "it should still have FieldValues, but the stored list is just a sub-list of all distinct values and `has_more_values` = true"
          (is (= {:values                [(str/join (repeat 50 "A"))]
                  :human_readable_values []
                  :has_more_values       true}
                 (into {} (t2/select-one [:model/FieldValues :values :human_readable_values :has_more_values]
                                         :field_id (mt/id :blueberries_consumed :str))))))))))

(deftest sync-aborts-on-non-recoverable-error-test
  (testing "Make sure sync aborts on non-recoverable errors"
    (one-off-dbs/with-blueberries-db
      ;; insert 50 rows & sync
      (one-off-dbs/insert-rows-and-sync! [(str/join (repeat 50 "A"))])
      ;; Manually activate Field values since they are not created during sync (#53387)
      (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :blueberries_consumed :str)))
      ;; we throw ConnectException, which is a non-recoverable exception. Mock the SQL-path fetcher
      ;; (run-distinct-batch) since that's what the H2 sync path will call.
      (mt/with-dynamic-fn-redefs [distinct-batch/run-distinct-batch (fn [& _] (throw (java.net.ConnectException.)))]
        (is (=?
             {:steps [["delete-expired-advanced-field-values" {}]
                      ["update-field-values" {:throwable #(instance? Exception %)}]]}
             (sync/update-field-values! (:id (data/db)))))))))

(deftest fields-to-scan-respects-limit-test
  (testing "returns at most `limit` active, normal-visibility fields so very wide tables don't load every field"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field _ {:table_id table-id :active true :visibility_type :normal}
                   :model/Field _ {:table_id table-id :active true :visibility_type :normal}
                   :model/Field _ {:table_id table-id :active true :visibility_type :normal}]
      (let [table (t2/select-one :model/Table :id table-id)]
        (is (= 2 (count (get (#'sync.field-values/fields-to-scan [table] 2) table-id))))
        (is (= 3 (count (get (#'sync.field-values/fields-to-scan [table] 100) table-id))))))))

;;; ---------------------------------- can-batch-distinct? ----------------------------------

(deftest fields-for-field-values-honors-user-settings-test
  (testing "fields-for-field-values reflects the user's has_field_values/visibility_type overrides"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id} {:table_id table-id, :has_field_values nil, :visibility_type "normal"}]
      (testing "sanity check: the sync values show by default"
        (is (=? {:has_field_values nil, :visibility_type :normal}
                (first (sync.db/fields-for-field-values [field-id])))))
      (field-user-settings/upsert-field-user-settings! {:id field-id} {:has_field_values :none, :visibility_type :sensitive})
      (is (=? {:has_field_values :none, :visibility_type :sensitive}
              (first (sync.db/fields-for-field-values [field-id])))))))

(deftest can-batch-distinct?-test
  (testing "SQL driver with :nested-queries and no required filter → batch path"
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                   :model/Table table {:db_id db-id, :name "t", :database_require_filter false}]
      (is (true? (#'sync.field-values/can-batch-distinct? (driver.u/lib-database db-id) table)))))
  (testing "Tables with :database_require_filter true (e.g. partitioned BigQuery) fall back to per-field"
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                   :model/Table table {:db_id db-id, :name "t", :database_require_filter true}]
      (is (false? (#'sync.field-values/can-batch-distinct? (driver.u/lib-database db-id) table))
          "Partitioned tables that require a WHERE on the partition column can't go through the
           native UNION ALL path because it bypasses add-required-filters-if-needed middleware"))))

;;; ---------------------------------- nested-JSON fields dispatch ----------------------------------

(deftest ^:synchronized table-field-values-changes-routes-parent-id-fields-to-per-field-test
  (testing "Fields with :parent_id (nested-JSON unfolded) go through the per-field path even when
            the table is otherwise batch-able. Batching builds a CAST(name AS …) that doesn't
            qualify the column with its parent, so the SQL would target the wrong column AND the
            by-name lookup could collide if two child fields share a name across different parents
            (e.g. JSON columns unfolded to `address.name` and `user.name`)."
    (let [calls-to-fetch-distinct-for-table (atom [])
          calls-to-fetch-distinct-per-field (atom [])]
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                     :model/Table {tbl-id :id :as table} {:db_id db-id, :name "t"
                                                          :database_require_filter false}
                     :model/Field {parent-a :id} {:table_id tbl-id, :name "address"
                                                  :base_type :type/JSON, :has_field_values :list}
                     :model/Field {parent-b :id} {:table_id tbl-id, :name "user"
                                                  :base_type :type/JSON, :has_field_values :list}
                     :model/Field nested-a {:table_id tbl-id, :parent_id parent-a, :name "name"
                                            :base_type :type/Text, :has_field_values :list}
                     :model/Field nested-b {:table_id tbl-id, :parent_id parent-b, :name "name"
                                            :base_type :type/Text, :has_field_values :list}
                     :model/Field plain-c  {:table_id tbl-id, :name "plain"
                                            :base_type :type/Text, :has_field_values :list}]
        (mt/with-dynamic-fn-redefs [sync.field-values/fetch-distinct-for-table
                                    (fn [_driver _table fields]
                                      (swap! calls-to-fetch-distinct-for-table conj (set (map :id fields)))
                                      {:results (into {} (map (fn [f] [(:id f) {:values []}])) fields)
                                       :queries 1
                                       :failed-fields #{}})
                                    sync.field-values/fetch-distinct-per-field
                                    (fn [fields]
                                      (swap! calls-to-fetch-distinct-per-field conj (set (map :id fields)))
                                      {:results (into {} (map (fn [f] [(:id f) {:values []}])) fields)
                                       :queries (count fields)
                                       :failed-fields #{}})]
          (#'sync.field-values/table-field-values-changes (driver.u/lib-database db-id) table [nested-a nested-b plain-c] {})
          (testing "Plain field goes to batch path"
            (is (= [#{(:id plain-c)}] @calls-to-fetch-distinct-for-table)))
          (testing "Both nested-JSON children with the same name go to per-field, preserving each field's identity"
            (is (= [#{(:id nested-a) (:id nested-b)}] @calls-to-fetch-distinct-per-field))))))))

(deftest ^:synchronized table-field-values-changes-routes-nfc-path-fields-to-per-field-test
  (testing "Fields with an :nfc_path (unfolded JSON) go through the per-field path. They have no :parent_id, and the
            batch query uses only the field name, which is not a column"
    (let [calls-to-fetch-distinct-for-table (atom [])
          calls-to-fetch-distinct-per-field (atom [])]
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                     :model/Table {tbl-id :id :as table} {:db_id db-id, :name "t"
                                                          :database_require_filter false}
                     :model/Field json-field {:table_id tbl-id, :name "payload → paid", :nfc_path ["payload" "paid"]
                                              :base_type :type/Text, :has_field_values :list}
                     :model/Field plain {:table_id tbl-id, :name "plain"
                                         :base_type :type/Text, :has_field_values :list}]
        (mt/with-dynamic-fn-redefs [sync.field-values/fetch-distinct-for-table
                                    (fn [_driver _table fields]
                                      (swap! calls-to-fetch-distinct-for-table conj (set (map :id fields)))
                                      {:results (into {} (map (fn [f] [(:id f) {:values []}])) fields)
                                       :queries 1
                                       :failed-fields #{}})
                                    sync.field-values/fetch-distinct-per-field
                                    (fn [fields]
                                      (swap! calls-to-fetch-distinct-per-field conj (set (map :id fields)))
                                      {:results (into {} (map (fn [f] [(:id f) {:values []}])) fields)
                                       :queries (count fields)
                                       :failed-fields #{}})]
          (#'sync.field-values/table-field-values-changes (driver.u/lib-database db-id) table [json-field plain] {})
          (is (= [#{(:id plain)}] @calls-to-fetch-distinct-for-table))
          (is (= [#{(:id json-field)}] @calls-to-fetch-distinct-per-field)))))))

;;; ---------------------------------- sync-fields-grouped-by-table! ----------------------------------

(deftest ^:mb/driver-tests ^:synchronized sync-fields-grouped-by-table!-test
  (testing "End-to-end: fetches via UNION, persists via persist-field-values!, returns counts"
    (mt/dataset test-data
      (mt/with-temp [:model/FieldValues _ {:field_id (mt/id :people :state)
                                           :type     :full
                                           :values   ["XX" "YY"]
                                           :has_more_values false}]
        (let [field  (t2/select-one :model/Field :id (mt/id :people :state))
              counts (sync.field-values/sync-fields-grouped-by-table! [field])]
          (is (map? counts) "Returns a counts map")
          (is (= 1 (:probed counts)))
          (testing "After sync, FieldValues row reflects the real distinct set"
            (let [fv     (t2/select-one :model/FieldValues
                                        :field_id (mt/id :people :state)
                                        :type     :full)
                  states (set (:values fv))]
              (is (contains? states "CA"))
              (is (not (contains? states "XX")) "Stale seeded values were replaced"))))))))

(deftest sync-fields-grouped-by-table!-empty-input-test
  (testing "Empty/nil input → nil (no work)"
    (is (nil? (sync.field-values/sync-fields-grouped-by-table! [])))
    (is (nil? (sync.field-values/sync-fields-grouped-by-table! nil)))))

(deftest ^:mb/driver-tests ^:synchronized union-batching-test
  (testing "Field count > *batch-size* is broken into multiple queries; every field's counts are accounted for"
    (mt/dataset test-data
      (binding [distinct-batch/*batch-size* 2]
        (let [fields           (vec (t2/select :model/Field
                                               :table_id (mt/id :people)
                                               :active true
                                               :visibility_type "normal"
                                               {:order-by [[:name :asc]]}))
              eligible-count   (count (filter field-values/field-should-have-field-values? fields))
              counts           (sync.field-values/sync-fields-grouped-by-table! fields)]
          (is (= eligible-count (:probed counts))
              "Every FV-eligible field is reported as probed; sync-fields-grouped-by-table! drops the rest")
          (is (>= (:queries counts) 2)
              "More fields than *batch-size* should produce more than one query"))))))

(defn- list-or-plain-field
  "Every other Field a list Field, the others plain text Fields that should have no FieldValues."
  [j]
  {:has_field_values (when (even? j) :auto-list)})

(defn- add-field-values!
  "Give every Field of `database` full FieldValues `[\"a\" \"b\"]` in use, and an advanced FieldValues past its max
  age."
  [database]
  (let [field-ids (t2/select-pks-vec :model/Field :table_id [:in (t2/select-pks-vec :model/Table :db_id (:id database))])
        expired   (t/minus (t/offset-date-time) (t/plus field-values/advanced-field-values-max-age (t/days 1)))]
    (t2/insert! :model/FieldValues (for [field-id field-ids]
                                     {:field_id field-id :type :full :values ["a" "b"] :has_more_values false
                                      :last_used_at (t/offset-date-time)}))
    (t2/insert! (t2/table-name :model/FieldValues) (for [field-id field-ids]
                                                     {:field_id field-id :type "advanced" :hash_key "hash"
                                                      :created_at expired :updated_at expired}))))

(defn- distinct-values-a-and-b
  "Rows `a` and `b` of every arm of a query of [[distinct-batch/run-distinct-batch]], as the warehouse gives them."
  [_query]
  {:data {:rows (for [arm (range distinct-batch/*batch-size*) value ["a" "b"]] [arm value])}})

(defn- update-field-values!
  "Run both steps of field values sync over `database`, returning the result of each."
  [database]
  {:expired (#'sync.field-values/delete-expired-advanced-field-values-for-database! database)
   :updated (#'sync.field-values/update-field-values-for-database! database)})

(deftest update-field-values-statement-count-test
  (mt/with-dynamic-fn-redefs [qp/process-query distinct-values-a-and-b]
    (testing "field values sync issues as many statements for 16 Tables as for 4"
      (testing "when FieldValues are cleared and expired ones deleted"
        (let [[small large] (analyze.tu/statement-counts-by-tables list-or-plain-field add-field-values! update-field-values!)]
          (is (= small large))))
      (testing "when nothing changed"
        (let [[small large] (analyze.tu/statement-counts-by-tables list-or-plain-field
                                                                   (fn [database]
                                                                     (add-field-values! database)
                                                                     (update-field-values! database))
                                                                   update-field-values!)]
          (is (= small large)))))
    (testing "field values sync issues as many statements for 20 Fields per Table as for 5"
      (testing "when FieldValues are cleared and expired ones deleted"
        (let [[small large] (analyze.tu/statement-counts-by-fields list-or-plain-field add-field-values! update-field-values!)]
          (is (= small large))))
      (testing "when nothing changed"
        (let [[small large] (analyze.tu/statement-counts-by-fields list-or-plain-field
                                                                   (fn [database]
                                                                     (add-field-values! database)
                                                                     (update-field-values! database))
                                                                   update-field-values!)]
          (is (= small large)))))))

(deftest update-field-values-clears-and-expires-field-values-test
  (testing "field values sync deletes FieldValues of Fields that should have none and expired advanced ones"
    (mt/with-dynamic-fn-redefs [qp/process-query distinct-values-a-and-b]
      (mt/with-temp [:model/Database db      {:engine :h2}
                     :model/Table    table-1 {:db_id (u/the-id db) :active true}
                     :model/Table    table-2 {:db_id (u/the-id db) :active true}
                     :model/Field    listed  {:table_id (u/the-id table-1) :base_type :type/Text :has_field_values :auto-list}
                     :model/Field    plain-1 {:table_id (u/the-id table-1) :base_type :type/Text :has_field_values nil}
                     :model/Field    plain-2 {:table_id (u/the-id table-2) :base_type :type/Text :has_field_values nil}]
        (let [database (driver.u/lib-database (u/the-id db))]
          (add-field-values! database)
          (is (=? {:expired {:deleted 3}
                   :updated {:deleted 2 :errors 0}}
                  (update-field-values! database)))
          (is (= [(u/the-id listed)]
                 (t2/select-fn-vec :field_id :model/FieldValues
                                   :field_id [:in (map u/the-id [listed plain-1 plain-2])]))))))))

(defn- add-full-field-values!
  "Give every Field of `database` full FieldValues `values` last used at `last-used-at`."
  [database values last-used-at]
  (t2/insert! :model/FieldValues (for [field-id (t2/select-pks-vec :model/Field
                                                                   :table_id [:in (t2/select-pks-vec :model/Table :db_id (:id database))])]
                                   {:field_id field-id :type :full :values values :has_more_values false
                                    :last_used_at last-used-at})))

(defn- add-unused-field-values!
  "Give every Field of `database` full FieldValues last used past the cutoff of active FieldValues."
  [database]
  (add-full-field-values! database ["a" "b"] (t/minus (t/offset-date-time) (t/days 30))))

(defn- add-other-field-values!
  "Give every Field of `database` full FieldValues in use whose values differ from those the warehouse gives."
  [database]
  (add-full-field-values! database ["x"] (t/offset-date-time)))

(deftest update-field-values-unused-or-changed-statement-count-test
  (mt/with-dynamic-fn-redefs [qp/process-query distinct-values-a-and-b]
    (doseq [[what prepare!] [["FieldValues are not used recently" add-unused-field-values!]
                             ["FieldValues change" add-other-field-values!]]]
      (testing (str "field values sync issues as many statements for 16 Tables as for 4 when " what)
        (let [[small large] (analyze.tu/statement-counts-by-tables list-or-plain-field prepare! update-field-values!)]
          (is (= small large))))
      (testing (str "field values sync issues as many statements for 20 Fields per Table as for 5 when " what)
        (let [[small large] (analyze.tu/statement-counts-by-fields list-or-plain-field prepare! update-field-values!)]
          (is (= small large)))))))

(defn- update-field-values-on-demand!
  "Update on demand the FieldValues of every Field of `database`."
  [database]
  (sync.field-values/update-field-values-for-on-demand-dbs!
   (t2/select-pks-vec :model/Field :table_id [:in (t2/select-pks-vec :model/Table :db_id (:id database))])))

(defn- on-demand
  "Make `database` update its FieldValues on demand, after `prepare!`."
  [prepare!]
  (fn [database]
    (t2/update! :model/Database :id (:id database) {:is_on_demand true})
    (prepare! database)))

(deftest update-field-values-for-on-demand-dbs-statement-count-test
  (mt/with-dynamic-fn-redefs [qp/process-query distinct-values-a-and-b]
    (doseq [[what prepare!] [["Fields have no FieldValues" (constantly nil)]
                             ["FieldValues change" add-other-field-values!]]]
      (testing (str "on-demand field values update issues as many statements for 16 Tables as for 4 when " what)
        (let [[small large] (analyze.tu/statement-counts-by-tables list-or-plain-field (on-demand prepare!)
                                                                   update-field-values-on-demand!)]
          (is (= small large))))
      (testing (str "on-demand field values update issues as many statements for 20 Fields per Table as for 5 when " what)
        (let [[small large] (analyze.tu/statement-counts-by-fields list-or-plain-field (on-demand prepare!)
                                                                   update-field-values-on-demand!)]
          (is (= small large)))))))

(deftest update-field-values-for-on-demand-dbs-writes-every-field-test
  (testing "on-demand field values update creates missing FieldValues and updates changed ones of every Table"
    (mt/with-dynamic-fn-redefs [qp/process-query distinct-values-a-and-b]
      (mt/with-temp [:model/Database db      {:engine :h2 :is_on_demand true}
                     :model/Table    table-1 {:db_id (u/the-id db) :active true}
                     :model/Table    table-2 {:db_id (u/the-id db) :active true}
                     :model/Field    missing {:table_id (u/the-id table-1) :base_type :type/Text :has_field_values :auto-list}
                     :model/Field    changed {:table_id (u/the-id table-2) :base_type :type/Text :has_field_values :auto-list}
                     :model/FieldValues _    {:field_id (u/the-id changed) :type :full :values ["x"]}]
        (is (=? {:created 1 :updated 1 :errors 0}
                (sync.field-values/update-field-values-for-on-demand-dbs! [(u/the-id missing) (u/the-id changed)])))
        (is (= {(u/the-id missing) ["a" "b"] (u/the-id changed) ["a" "b"]}
               (t2/select-fn->fn :field_id :values :model/FieldValues
                                 :field_id [:in [(u/the-id missing) (u/the-id changed)]] :type :full)))))))

(deftest update-field-values-saves-other-fields-when-one-write-fails-test
  (testing "field values sync saves the FieldValues of other Fields when writing those of one Field throws"
    (mt/with-dynamic-fn-redefs [qp/process-query distinct-values-a-and-b]
      (mt/with-temp [:model/Database db      {:engine :h2}
                     :model/Table    table-1 {:db_id (u/the-id db) :active true}
                     :model/Table    table-2 {:db_id (u/the-id db) :active true}
                     :model/Field    broken  {:table_id (u/the-id table-1) :base_type :type/Text :has_field_values :auto-list}
                     :model/Field    other-1 {:table_id (u/the-id table-1) :base_type :type/Text :has_field_values :auto-list}
                     :model/Field    other-2 {:table_id (u/the-id table-2) :base_type :type/Text :has_field_values :auto-list}]
        (add-other-field-values! db)
        (let [save!     (mt/original-fn #'field-values/save-field-values-changes!)
              broken-id (t2/select-one-pk :model/FieldValues :field_id (u/the-id broken))]
          (mt/with-dynamic-fn-redefs [field-values/save-field-values-changes!
                                      (fn [changes]
                                        (when (some #(= broken-id (get-in % [:update :id])) changes)
                                          (throw (ex-info "write failed" {})))
                                        (save! changes))]
            (is (=? {:updated 2 :errors 1}
                    (:updated (update-field-values! (driver.u/lib-database (u/the-id db))))))))
        (is (= {(u/the-id broken) ["x"] (u/the-id other-1) ["a" "b"] (u/the-id other-2) ["a" "b"]}
               (t2/select-fn->fn :field_id :values :model/FieldValues
                                 :field_id [:in (map u/the-id [broken other-1 other-2])] :type :full)))))))

(deftest update-field-values-error-is-not-retried-per-field-test
  (testing "field values sync throws an Error of writing all FieldValues without writing those of each Field"
    (mt/with-dynamic-fn-redefs [qp/process-query distinct-values-a-and-b]
      (mt/with-temp [:model/Database db      {:engine :h2}
                     :model/Table    table-1 {:db_id (u/the-id db) :active true}
                     :model/Table    table-2 {:db_id (u/the-id db) :active true}
                     :model/Field    _       {:table_id (u/the-id table-1) :base_type :type/Text :has_field_values :auto-list}
                     :model/Field    _       {:table_id (u/the-id table-2) :base_type :type/Text :has_field_values :auto-list}]
        (add-other-field-values! db)
        (let [writes (atom 0)]
          (mt/with-dynamic-fn-redefs [field-values/save-field-values-changes! (fn [_changes]
                                                                                (swap! writes inc)
                                                                                (throw (StackOverflowError.)))]
            (is (thrown? StackOverflowError
                         (update-field-values! (driver.u/lib-database (u/the-id db))))))
          (is (= 1 @writes)))))))
