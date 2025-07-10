(ns ^:mb/driver-tests metabase.transform.transform-test
  "Test for transforms"
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest create-view-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "Can create and replace a new view"
      (mt/dataset (mt/dataset-definition "users-db"
                                         ["users"
                                          [{:field-name "name" :base-type :type/Text}
                                           {:field-name "age" :base-type :type/Integer}]
                                          [["Foo" 10]
                                           ["Bar" 20]
                                           ["Baz" 30]]])
        (driver/drop-view! driver/*driver* (u/the-id (mt/db)) "young_users")
        (is (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                 "young_users"
                                 "SELECT * FROM users where age < 25"))
        (is (= [["Foo"] ["Bar"]]
               (mt/rows (qp/process-query (mt/native-query {:query "SELECT name FROM \"young_users\""})))))
        (is (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                 "young_users"
                                 "SELECT * FROM users where age < 35"
                                 :replace? true))
        (is (= [["Foo"] ["Bar"] ["Baz"]]
               (mt/rows (qp/process-query (mt/native-query {:query "SELECT name FROM \"young_users\""})))))))))

(deftest drop-view-nonexistent-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "Dropping a non-existent view should not throw an error"
      (mt/dataset (mt/dataset-definition "simple-db"
                                         ["table1"
                                          [{:field-name "name" :base-type :type/Text}]
                                          [["Alice"]
                                           ["Bob"]]])
        ;; Should not throw even if view doesn't exist
        (is (driver/drop-view! driver/*driver* (u/the-id (mt/db)) "nonexistent_view"))))))

(deftest create-view-without-replace-fails-if-exists-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "Creating a view that already exists should fail without :replace? true"
      (mt/dataset (mt/dataset-definition "products-db"
                                         ["products"
                                          [{:field-name "name" :base-type :type/Text}
                                           {:field-name "price" :base-type :type/Decimal}]
                                          [["Widget" 10.99]
                                           ["Gadget" 25.50]]])
        (driver/drop-view! driver/*driver* (u/the-id (mt/db)) "expensive_products")

        (is (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                 "expensive_products"
                                 "SELECT * FROM products WHERE price > 20"))

        (is (thrown? Exception
                     (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                          "expensive_products"
                                          "SELECT * FROM products WHERE price > 15")))))))

(deftest create-view-with-complex-query-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "Creating a view with complex SQL"
      (mt/dataset  (mt/dataset-definition "users-departments-db"
                                          ["users"
                                           [{:field-name "name" :base-type :type/Text}
                                            {:field-name "department_id" :base-type :type/Integer}]
                                           [["Alice" 10]
                                            ["Bob" 20]
                                            ["Charlie" 10]]]
                                          ["departments"
                                           [{:field-name "idx" :base-type :type/Integer}
                                            {:field-name "name" :base-type :type/Text}]
                                           [[10 "Engineering"]
                                            [20 "Sales"]]])
        (driver/drop-view! driver/*driver* (u/the-id (mt/db)) "user_departments")

        (is (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                 "user_departments"
                                 "SELECT u.name as user_name, d.name as dept_name FROM users u JOIN departments d ON u.department_id = d.idx"))

        (is (= #{["Alice" "Engineering"] ["Bob" "Sales"] ["Charlie" "Engineering"]}
               (set (mt/rows (qp/process-query (mt/native-query {:query "SELECT user_name, dept_name FROM \"user_departments\""}))))))))))

(deftest view-name-edge-cases-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "View names with special characters and edge cases"
      (mt/dataset (mt/dataset-definition "edge-case-db"
                                         ["test_table"
                                          [{:field-name "value" :base-type :type/Text}]
                                          [["test"]]])

        (doseq [view-name ["view_with_underscores"
                           "ViewWithCamelCase"
                           "view123"
                           "view with spaces"]]
          (testing (str "View name: " view-name)
            (driver/drop-view! driver/*driver* (u/the-id (mt/db)) view-name)

            (is (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                     view-name
                                     "SELECT * FROM test_table"))

            (is (= [[1 "test"]]
                   (mt/rows (qp/process-query (mt/native-query {:query (format "SELECT * FROM \"%s\"" view-name)})))))

            (driver/drop-view! driver/*driver* (u/the-id (mt/db)) view-name)))))))

(deftest view-with-invalid-sql-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "Creating a view with invalid SQL should fail"
      (mt/dataset (mt/dataset-definition "error-db"
                                         ["table1"
                                          [{:field-name "idx" :base-type :type/Integer}]
                                          [[1]]])
        (driver/drop-view! driver/*driver* (u/the-id (mt/db)) "invalid_view")

        (is (thrown? Exception
                     (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                          "invalid_view"
                                          "SELECT * FROM nonexistent_table")))))))

(deftest sync-view-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "Can create a new view and immediately sync it"
      (mt/dataset (mt/dataset-definition "users-db"
                                         ["users"
                                          [{:field-name "name" :base-type :type/Text}
                                           {:field-name "age" :base-type :type/Integer}]
                                          [["Foo" 10]
                                           ["Bar" 20]
                                           ["Baz" 30]]])

        (let [{:keys [schema]} (t2/select-one :model/Table :name "users")
              base-name "young_users"
              view-name (if schema
                          (str schema "." base-name)
                          base-name)]

          (driver/drop-view! driver/*driver* (u/the-id (mt/db)) view-name)

          (is (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                   view-name
                                   "SELECT name, age FROM users where age < 25"))

          ;; make sure we're indeed creating it anew
          (t2/delete! :model/Table :name view-name)

          (sync/sync-new-table-metadata! (mt/db) {:table-name base-name :schema schema})

          (let [table (t2/select-one :model/Table :name base-name :schema schema)]
            (is (=? {:schema schema,
                     :name base-name,
                     :active true,
                     :display_name "Young Users"} table))
            (is (=? [{:semantic_type nil,
                      :effective_type :type/Text,
                      :active true,
                      :position 0,
                      :visibility_type :normal,
                      :display_name "Name",
                      :database_position 0,
                      :base_type :type/Text}
                     {:semantic_type nil,
                      :effective_type :type/Integer,
                      :active true,
                      :position 1,
                      :visibility_type :normal,
                      :display_name "Age",
                      :database_position 1,
                      :base_type :type/Integer}]
                    (sort-by :position
                             (t2/select :model/Field :table_id (u/the-id table)))))))))))
