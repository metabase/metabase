(ns ^:mb/driver-tests metabase.transform.transform-test
  "Test for transforms"
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
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

(mt/defdataset users-departments-db
  [["users"
    [{:field-name "name" :base-type :type/Text}
     {:field-name "department_id" :base-type :type/Integer}
     {:field-name "score" :base-type :type/Integer}]
    [["Alice" 10 100]
     ["Bob" 20 200]
     ["Charlie" 10 300]]]
   ["departments"
    [{:field-name "idx" :base-type :type/Integer}
     {:field-name "name" :base-type :type/Text}]
    [[10 "Engineering"]
     [20 "Sales"]]]])

;; TODO: with-force-reload-dataset?
#_(defmacro with-force-recreate-dataset
    [dataset-sym & body]
    `(try
       (tx/destroy-db! (tx/get-dataset-definition ~dataset-sym))
       (finally
         (mt/dataset
           ~dataset-sym
           ~@body))))

(defmacro with-no-transform-views
  [& body]
  `(do (when-some [tws# (t2/select [:model/TransformView :id :view_schema :view_name])]
         (metabase.request.session/with-current-user (mt/user->id :rasta)
           (doseq [{id# :id schema# :view_schema name# :view_name} tws#]
             (driver/drop-view! driver/*driver* (mt/id) (str/join "." (filter some? [schema# name#])))
             (t2/delete! :model/TransformView :id id#)))
         (sync/sync-db-metadata! (mt/db)))
       ~@body));; API tests

(deftest can-create-transform-test ; create + overwrite
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (mt/dataset
      users-departments-db
      (with-no-transform-views
        (let [dataset-query (let [mp (mt/metadata-provider)]
                              (-> (lib/query mp (lib.metadata/table mp (mt/id :users)))
                                  (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :users :score))))
                                  (lib/breakout (lib.metadata/field mp (mt/id :users :score)))
                                  (lib.convert/->legacy-MBQL)))
              display-name "Test view 1"]
          (testing "POST /transform creates new view in app db"
            (is (=? {:view_table_id pos-int?
                     :database_id (mt/id)
                     :creator_id (mt/user->id :rasta)
                     :status "view_synced"
                     :view_display_name "Test view 1"}
                    (mt/user-http-request :rasta :post 200 "transform"
                                          {:display_name display-name
                                           :dataset_query dataset-query}))))
          (let [transform-view (t2/select-one :model/TransformView :view_display_name display-name)]
            (testing "Transform generated view has user set display name"
              (let [table (t2/select-one :model/Table :id (:view_table_id transform-view))]
                (is (= (:view_name transform-view) (:name table)))
                (is (= (:view_display_name transform-view) (:display_name table)))))
            (testing "Transform generated view can be queried"
              (let [mp (mt/metadata-provider)]
                (is (=? {:status :completed}
                        (-> (lib/query mp (lib.metadata/table mp (:view_table_id transform-view)))
                            (qp/process-query))))))
            (testing "POST /transform fails when display_name is in use"
              (is (=? {:status 400
                       :view_display_name "Test view 1"}
                      (mt/user-http-request :rasta :post "transform"
                                            {:display_name display-name
                                             :dataset_query dataset-query})))
              (is (= 1 (t2/count :model/TransformView :view_display_name display-name))))))))))
