(ns ^:mb/driver-tests metabase.sync.sync-metadata.fields.sync-instances-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.sync.core :as sync]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.fields :as sync-fields]
   [metabase.test :as mt]
   [metabase.test.mock.toucanery :as toucanery]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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
  (mt/with-temp [:model/Database db    {:engine ::toucanery/toucanery}
                 :model/Table    table {:name "transactions", :db_id (u/the-id db)}]
    ;; do the initial sync
    (sync-fields/sync-fields-for-table! table)
    (let [transactions-table-id (u/the-id (t2/select-one-pk :model/Table :db_id (u/the-id db), :name "transactions"))]
      (is (= toucannery-transactions-expected-fields-hierarchy
             (actual-fields-hierarchy transactions-table-id))))))

(deftest delete-nested-field-test
  (testing (str "If you delete a nested Field, and re-sync a Table, it should recreate the Field as it was before! It "
                "should not create any duplicate Fields (#8950)")
    (mt/with-temp [:model/Database db    {:engine ::toucanery/toucanery}
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
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
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
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
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
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
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

(defn run-cruft-test [patterns freqs]
  (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery
                                     :settings {:auto-cruft-columns patterns}}]
    (sync-metadata/sync-db-metadata! db)
    (let [tables (t2/select :model/Table :db_id (u/the-id db))
          fields (mapcat (fn [{:keys [id]}] (t2/select :model/Field :table_id id)) tables)]
      (is (= freqs
             (frequencies (map :visibility_type fields)))))))

(deftest auto-cruft-all-fields-test
  (testing "Make sure a db's settings.auto_cruft_fields mark all fields as crufty"
    (run-cruft-test [".*"]
                    {:details-only 12})
    (run-cruft-test (map str (into [] "abcdefghijklmnoqprstuvwxyz"))
                    {:details-only 12})))

(deftest auto-cruft-exact-field-name-test
  (testing "Make sure a db's settings.auto_cruft_fields mark fields as crufty for exact table names"
    (run-cruft-test ["^details$" "^age$"]
                    {:normal 10 :details-only 2})))

(deftest auto-cruft-fields-with-multiple-patterns-test
  (testing "Make sure a db's settings.auto_cruft_fields mark fields as crufty against multiple patterns"
    (run-cruft-test ["a" "b" "c"]     {:normal 4 :details-only 8})
    (run-cruft-test ["c" "a" "t"]     {:normal 3 :details-only 9})
    (run-cruft-test ["d" "o" "g"]     {:normal 6 :details-only 6})
    (run-cruft-test ["b" "i" "r" "d"] {:normal 7 :details-only 5})
    (run-cruft-test ["x" "y" "z"]     {:normal 11 :details-only 1})))

(deftest auto-cruft-fields-none-are-crufted-with-missing-pattern
  (run-cruft-test [] {:normal 12}))

(deftest auto-cruft-fields-none-are-crufted-with-no-hit-pattern
  (run-cruft-test ["^it was the best$" "^of times it was$" "^the worst of times$"] {:normal 12}))

;; TODO: Move dataset elsewhere!

;; Sample of the following dataset
;; {
;;   "users": {
;;     "otherId": "user001",
;;     "name": "Alice Johnson",
;;     "email": "alice.johnson@email.com",
;;     "createdAt": "2024-01-15T00:00:00.000Z"
;;   },
;;   "products": {
;;     "otherId": "prod001",
;;     "name": "Laptop Pro 15",
;;     "price": 1299.99,
;;     "category": "Electronics",
;;     "stock": 45
;;   },
;;   "orderItems": {
;;     "otherId": "item001",
;;     "links": {
;;       "customerId": "user001",
;;       "productId": "prod001"
;;     },
;;     "data": {
;;       "orderDate": "2024-06-01T00:00:00.000Z",
;;       "status": "delivered",
;;       "quantity": 1,
;;       "price": 1299.99
;;     }
;;   }
;;  }

;; TODO: Rename to db
(mt/defdataset orderItemsDb
  "OrderItems dataset"
  [["users"
    [{:field-name "otherId" :base-type :type/Text}
     {:field-name "name" :base-type :type/Text}
     {:field-name "email" :base-type :type/Text}
     {:field-name "createdAt" :base-type :type/Date}]
    [["user001" "Alice Johnson" "alice.johnson@email.com" "2024-01-15"]
     ["user002" "Bob Smith" "bob.smith@email.com" "2024-02-20"]
     ["user003" "Carol White" "carol.white@email.com" "2024-03-10"]
     ["user004" "David Brown" "david.brown@email.com" "2024-04-05"]
     ["user005" "Emma Davis" "emma.davis@email.com" "2024-05-12"]]]
   ["products"
    [{:field-name "otherId" :base-type :type/Text}
     {:field-name "name" :base-type :type/Text}
     {:field-name "price" :base-type :type/Decimal}
     {:field-name "category" :base-type :type/Text}
     {:field-name "stock" :base-type :type/Integer}]
    [["prod001" "Laptop Pro 15" 1299.99 "Electronics" 45]
     ["prod002" "Wireless Mouse" 29.99 "Accessories" 150]
     ["prod003" "USB-C Hub" 49.99 "Accessories" 80]
     ["prod004" "Mechanical Keyboard" 149.99 "Accessories" 60]
     ["prod005" "4K Monitor" 599.99 "Electronics" 25]]]
   ["orderItems"
    [{:field-name "otherId" :base-type :type/Text}
     {:field-name "links" :base-type :type/Dictionary :nested-fields [{:field-name "customerId"
                                                                       :base-type :type/Text}
                                                                      {:field-name "productId"
                                                                       :base-type :type/Text}]}
     {:field-name "data" :base-type :type/Dictionary :nested-fields [{:field-name "orderDate"
                                                                      :base-type :type/DateTime}
                                                                     {:field-name "status"
                                                                      :base-type :type/Text}
                                                                     {:field-name "quantity"
                                                                      :base-type :type/Integer}
                                                                     {:field-name "price"
                                                                      :base-type :type/Decimal}]}]
    [["item001"
      {"customerId" "user001", "productId" "prod001"}
      {"orderDate" #t "2024-06-01", "status" "delivered", "quantity" 1, "price" 1299.99}]
     ["item002"
      {"customerId" "user001", "productId" "prod003"}
      {"orderDate" #t "2024-06-01", "status" "delivered", "quantity" 1, "price" 49.99}]
     ["item003"
      {"customerId" "user002", "productId" "prod004"}
      {"orderDate" #t "2024-06-15", "status" "shipped", "quantity" 1, "price" 149.99}]
     ["item004"
      {"customerId" "user003", "productId" "prod005"}
      {"orderDate" #t "2024-07-02", "status" "processing", "quantity" 1, "price" 599.99}]
     ["item005"
      {"customerId" "user004", "productId" "prod002"}
      {"orderDate" #t "2024-07-20", "status" "delivered", "quantity" 1, "price" 29.99}]]]])

(deftest ^:synchronized sync-active-subset-test
  (mt/test-drivers
    (mt/normal-drivers)
    (when (driver/should-sync-active-subset? driver/*driver*)
      (mt/dataset
        orderItemsDb

        (testing "After initial sync all fields have active_subset true"
          (sync/sync-database! (mt/db))
          (let [all-db-fields (t2/select :model/Field :table_id
                                         [:in (t2/select-fn-vec :id :model/Table :db_id (mt/id))])]
            (is (every? (comp true? :active_subset) all-db-fields))))

        (testing "Syncing the db when there is more leaf fields than `driver.settings/sync-leaf-fields-limit`..."
          (with-redefs [driver.settings/sync-leaf-fields-limit (constantly 3)]
            (sync/sync-database! (mt/db))
            (let [users-active-subset #{(mt/id :users :_id)
                                        (mt/id :users :email)
                                        (mt/id :users :createdAt)}
                  orderItems-active-subset #{(mt/id :orderItems :_id)
                                             (mt/id :orderItems :data)
                                             (mt/id :orderItems :data :orderDate)
                                             (mt/id :orderItems :data :price)}
                  products-active-subset #{(mt/id :products :_id)
                                           (mt/id :products :name)
                                           (mt/id :products :category)}
                  active-subset-field-ids (into #{} cat [users-active-subset
                                                         orderItems-active-subset
                                                         products-active-subset])
                  all-db-fields (t2/select :model/Field :table_id
                                           [:in (t2/select-fn-vec :id :model/Table :db_id (mt/id))])]
              (testing "... no fields are deactivated"
                (is (every? (comp true? :active) all-db-fields)))
              (testing "... expected fields are part of active_subset"
              ;; Sorting of fields picked up for sync on mongo should be stable, hence we can expect
              ;; always same set of fields.
                (is (every? (comp true? :active_subset) (filter (comp active-subset-field-ids
                                                                      :id)
                                                                all-db-fields))))
              (testing "... and all other fields are not part of the active subset"
                (is (every? (comp false? :active_subset) (filter (comp (complement active-subset-field-ids)
                                                                       :id)
                                                                 all-db-fields)))))))

        (testing "Follow-up sync with `driver.settings/sync-leaf-fields-limit` catching all the fields..."
          (sync/sync-database! (mt/db))
          (let [all-db-fields (t2/select :model/Field :table_id
                                         [:in (t2/select-fn-vec :id :model/Table :db_id (mt/id))])]
            (testing "... should not touch active key of any of the fields"
              (is (every? (comp true? :active) all-db-fields)))
            (testing "... should make every field part of the active subset again"
              (is (every? (comp true? :active_subset) all-db-fields)))))))))

(deftest fingerprint-active-subset-test
  (mt/test-drivers
    (mt/normal-drivers)
    (when (driver/should-sync-active-subset? driver/*driver*)
      (mt/dataset
        orderItemsDb
        (let [users-active-subset #{(mt/id :users :_id)
                                    (mt/id :users :email)
                                    (mt/id :users :createdAt)}
              orderItems-active-subset #{(mt/id :orderItems :_id)
                                         (mt/id :orderItems :data)
                                         (mt/id :orderItems :data :orderDate)
                                         (mt/id :orderItems :data :price)}
              products-active-subset #{(mt/id :products :_id)
                                       (mt/id :products :name)
                                       (mt/id :products :category)}
              active-subset-field-ids (into #{} cat [users-active-subset
                                                     orderItems-active-subset
                                                     products-active-subset])
              original-fields-to-fingerprint @#'sync.fingerprint/fields-to-fingerprint]
          (try

          ;; First adjust fingerprint version so fields are considered for fingerprinting
            (t2/update! :model/Field :id [:in active-subset-field-ids] {:fingerprint_version 0})

            (testing "... and now check that only active subset fields are picked for fingerprinting"
              (with-redefs [driver.settings/sync-leaf-fields-limit (constantly 3)
                            sync.fingerprint/fields-to-fingerprint
                            (fn [& args]
                              (let [result (apply original-fields-to-fingerprint args)]
                                (throw (ex-info "For checking fingerprinted fields"
                                                {:fields-to-fingerprint result
                                                 :testing-exception true}))))]
                (testing "... for that do full sync catching synthetic exception with considered fields"
                  (try
                    (sync/sync-database! (mt/db) {:scan :full})
                    (catch clojure.lang.ExceptionInfo e
                      (let [{:keys [testing-exception fields-to-fingerprint]} (ex-data e)]
                        (if testing-exception
                          (testing "... and now the actual check"
                            (is (= (count active-subset-field-ids)
                                   (count fields-to-fingerprint)))
                            (loop [[first-exp-id & rest-exp-ids] active-subset-field-ids
                                   returned-field-ids  (set (map :id fields-to-fingerprint))]
                              (if (nil? first-exp-id)
                                (is (empty? returned-field-ids))
                                (do (is (contains? returned-field-ids first-exp-id))
                                    (recur rest-exp-ids
                                           (disj returned-field-ids first-exp-id))))))
                          (throw e))))))))
            (finally
              (testing "Finally restore fields to the original state"
              ;; Full sync should adjust fingerprint version of modified fields back to the original
              ;; and make everything active.
                (sync/sync-database! (mt/db) {:scan :full})
                (let [all-db-fields (t2/select :model/Field :table_id
                                               [:in (t2/select-fn-vec :id :model/Table :db_id (mt/id))])]
                  (is (every? (comp true? :active) all-db-fields))
                  (is (every? (comp true? :active_subset) all-db-fields))
                  (is (every? (comp #{0 5} :fingerprint_version)
                              all-db-fields)))))))))))

(deftest field-values-active-subset-test
  (mt/test-drivers
    (mt/normal-drivers)
    (when (driver/should-sync-active-subset? driver/*driver*)
      (mt/dataset
        orderItemsDb
        (let [users-active-subset #{(mt/id :users :_id)
                                    (mt/id :users :email)
                                    (mt/id :users :createdAt)}
              orderItems-active-subset #{(mt/id :orderItems :_id)
                                         ;; This is part of active subset, but has visibility other than normal
                                         ;; hence not part of scanned fields
                                         #_(mt/id :orderItems :data)
                                         (mt/id :orderItems :data :orderDate)
                                         (mt/id :orderItems :data :price)}
              products-active-subset #{(mt/id :products :_id)
                                       (mt/id :products :name)
                                       (mt/id :products :category)}
              active-subset-field-ids (into #{} cat [users-active-subset
                                                     orderItems-active-subset
                                                     products-active-subset])
              original-table->fields-to-scan @#'sync.field-values/table->fields-to-scan
              results (atom #{})]
          (try

            (testing "... and now check that only active subset fields are picked for field values scan"
              (with-redefs [driver.settings/sync-leaf-fields-limit (constantly 3)
                            sync.field-values/table->fields-to-scan
                            (fn [& args]
                              (let [result (apply original-table->fields-to-scan args)]
                                (swap! results into (map :id) result)
                                result))]
                (testing "... for that do full sync catching synthetic exception with considered fields"
                  (sync/sync-database! (mt/db) {:scan :full})
                  (testing "... and now the actual check"
                    (is (= (count active-subset-field-ids)
                           (count @results)))
                    (loop [[first-exp-id & rest-exp-ids] active-subset-field-ids
                           returned-field-ids @results]
                      (if (nil? first-exp-id)
                        (is (empty? returned-field-ids))
                        (do (is (contains? returned-field-ids first-exp-id))
                            (recur rest-exp-ids
                                   (disj returned-field-ids first-exp-id)))))))))
            (finally
              (testing "Finally restore fields to the original state"
              ;; Full sync should clean up active_subset of modified fields
                (sync/sync-database! (mt/db) {:scan :full})
                (let [all-db-fields (t2/select :model/Field :table_id
                                               [:in (t2/select-fn-vec :id :model/Table :db_id (mt/id))])]
                  (is (every? (comp true? :active) all-db-fields))
                  (is (every? (comp true? :active_subset) all-db-fields)))))))))))

(deftest ^:synchronized null-on-unsupported-drivers-active-subset-test
  (mt/test-drivers
    (mt/normal-drivers)
    (when-not (driver/should-sync-active-subset? driver/*driver*)
      (mt/dataset
        test-data
        (testing "active_subset key is null after sync on drivers that do not support it..."
          (sync/sync-database! (mt/db))
          (let [all-db-fields (t2/select :model/Field :table_id
                                         [:in (t2/select-fn-vec :id :model/Table :db_id (mt/id))])]
            (is (every? (comp true? :active) all-db-fields))
            (is (every? (comp nil? :active_subset) all-db-fields)))

          (let [field-id (mt/id :venues :price)]
            (try
              (testing "... even after a field was re-activated"
                (t2/update! :model/Field :id field-id {:active false})
                (sync/sync-database! (mt/db))
                (let [all-db-fields (t2/select :model/Field :table_id
                                               [:in (t2/select-fn-vec :id :model/Table :db_id (mt/id))])]
                  (is (every? (comp true? :active) all-db-fields))
                  (is (every? (comp nil? :active_subset) all-db-fields))))
              (finally
                (t2/update! :model/Field :id field-id {:active true})))))))))
