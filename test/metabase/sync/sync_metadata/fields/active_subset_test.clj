(ns ^:mb/driver-tests metabase.sync.sync-metadata.fields.active-subset-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.sync.core :as sync]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
        (let [users-active-subset #{#_(mt/id :users :_id)
                                    (mt/id :users :email)
                                    (mt/id :users :createdAt)}
              orderItems-active-subset #{#_(mt/id :orderItems :_id)
                                         #_(mt/id :orderItems :data)
                                         (mt/id :orderItems :data :orderDate)
                                         ;; no fp bc float
                                         #_(mt/id :orderItems :data :price)}
              products-active-subset #{#_(mt/id :products :_id)
                                       (mt/id :products :name)
                                       (mt/id :products :category)}
              active-subset-field-ids (into #{} cat [users-active-subset
                                                     orderItems-active-subset
                                                     products-active-subset])
              original-fields-to-fingerprint @#'sync.fingerprint/fields-to-fingerprint
              results (atom #{})]
          (try

            ;; First adjust fingerprint version so fields are considered for fingerprinting
            (t2/update! :model/Field :id [:in active-subset-field-ids] {:fingerprint_version 0})

            (testing "... and now check that only active subset fields are picked for fingerprinting"
              (with-redefs [driver.settings/sync-leaf-fields-limit (constantly 3)
                            sync.fingerprint/fields-to-fingerprint
                            (fn [& args]
                              (let [result (apply original-fields-to-fingerprint args)]
                                (swap! results into (map :id) result)
                                result))]
                (testing "... for that do full sync catching synthetic exception with considered fields"
                  (sync/sync-database! (mt/db) {:scan :full})
                  (testing "... and now the actual check"
                    (is (= (count active-subset-field-ids)
                           (count @results)))
                    (loop [[first-exp-id & rest-exp-ids] active-subset-field-ids
                           returned-field-ids  @results]
                      (if (nil? first-exp-id)
                        (is (empty? returned-field-ids))
                        (do (is (contains? returned-field-ids first-exp-id))
                            (recur rest-exp-ids
                                   (disj returned-field-ids first-exp-id)))))))))
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
