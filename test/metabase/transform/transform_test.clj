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
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.interface :as tx]
   [metabase.transform.models.transform :as models.transform]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(mt/defdataset users-db
  [["users"
    [{:field-name "name" :base-type :type/Text}
     {:field-name "age" :base-type :type/Integer}]
    [["Foo" 10]
     ["Bar" 20]
     ["Baz" 30]]]])

(mt/defdataset products-db
  [["products"
    [{:field-name "name" :base-type :type/Text}
     {:field-name "price" :base-type :type/Decimal}]
    [["Widget" 10.99]
     ["Gadget" 25.50]]]])

(mt/defdataset users-departments-db
  [["users"
    [{:field-name "name" :base-type :type/Text}
     {:field-name "department_id" :base-type :type/Integer}]
    [["Alice" 10]
     ["Bob" 20]
     ["Charlie" 10]]]
   ["departments"
    [{:field-name "idx" :base-type :type/Integer}
     {:field-name "name" :base-type :type/Text}]
    [[10 "Engineering"]
     [20 "Sales"]]]])

(defn- native-query-rows [query]
  (set (mt/rows (qp/process-query (mt/native-query {:query query})))))

(deftest create-view-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "Can create and replace a new view"
      (mt/dataset users-db

        (driver/drop-view! driver/*driver* (u/the-id (mt/db)) "young_users")

        (is (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                 "young_users"
                                 "SELECT * FROM users where age < 25"))
        (is (= #{["Foo"] ["Bar"]}
               (native-query-rows "SELECT name FROM \"young_users\"")))
        (is (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                 "young_users"
                                 "SELECT * FROM users where age < 35"
                                 :replace? true))
        (is (= #{["Foo"] ["Bar"] ["Baz"]}
               (native-query-rows "SELECT name FROM \"young_users\"")))))))

(deftest drop-view-nonexistent-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "Dropping a non-existent view should not throw an error"
      (mt/dataset users-db
        ;; Should not throw even if view doesn't exist
        (is (driver/drop-view! driver/*driver* (u/the-id (mt/db)) "nonexistent_view"))))))

(deftest create-view-without-replace-fails-if-exists-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "Creating a view that already exists should fail without :replace? true"
      (mt/dataset products-db

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
      (mt/dataset users-departments-db

        (driver/drop-view! driver/*driver* (u/the-id (mt/db)) "user_departments")

        (is (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                 "user_departments"
                                 "SELECT u.name as user_name, d.name as dept_name FROM users u JOIN departments d ON u.department_id = d.idx"))

        (is (= #{["Alice" "Engineering"] ["Bob" "Sales"] ["Charlie" "Engineering"]}
               (native-query-rows "SELECT user_name, dept_name FROM \"user_departments\"")))))))

(deftest view-name-edge-cases-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "View names with special characters and edge cases"
      (mt/dataset users-db
        (doseq [view-name ["view_with_underscores"
                           "ViewWithCamelCase"
                           "view123"
                           "view with spaces"]]
          (driver/drop-view! driver/*driver* (u/the-id (mt/db)) view-name)

          (testing (str "View name: " view-name)
            (is (driver/create-view! driver/*driver* (u/the-id (mt/db)) view-name "SELECT * FROM users"))

            (is (= #{[1 "Foo" 10] [2 "Bar" 20] [3 "Baz" 30]}
                   (native-query-rows (format "SELECT * FROM \"%s\"" view-name))))))))))

(deftest view-with-invalid-sql-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "Creating a view with invalid SQL should fail"
      (mt/dataset users-db
        (is (thrown? Exception
                     (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                          "invalid_view"
                                          "SELECT * FROM nonexistent_table")))))))

(deftest sync-view-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "Can create a new view and immediately sync it"
      (mt/dataset users-db
        (mt/with-temp-copy-of-db

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
                               (t2/select :model/Field :table_id (u/the-id table))))))))))))

(deftest schema-qualified-view-names-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view :schemas)
    (testing "Can create views with schema-qualified names"
      (mt/dataset users-db
        (let [schema-name (sql.tx/session-schema driver/*driver*)
              view-name "test_view"
              qualified-view-name (str schema-name "." view-name)]

          (driver/drop-view! driver/*driver* (u/the-id (mt/db)) qualified-view-name)
          (is (driver/create-view! driver/*driver* (u/the-id (mt/db)) qualified-view-name "SELECT * FROM users"))

          (is (= #{["Foo"] ["Bar"] ["Baz"]} (native-query-rows (format "SELECT name FROM \"%s\".\"%s\"" schema-name view-name)))))))))

(deftest view-name-length-limit-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (testing "View name length limits are respected"
      (when-let [limit (driver/view-name-length-limit driver/*driver*)]
        (is (driver/create-view! driver/*driver* (u/the-id (mt/db))
                                 (apply str (repeat limit "a"))
                                 "SELECT * FROM users"
                                 :replace? true))))))

(mt/defdataset users-departments-with-score
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

(defmacro with-no-transform-views
  "Clean up the appdb and dwh prior "
  [& body]
  `(do (doseq [table# (:tables (driver/describe-database driver/*driver* (mt/db)))]
         (let [schema# (:schema table#)
               name# (:name table#)]
           (when (str/starts-with? name# "mb_transform")
             (metabase.request.session/with-current-user (mt/user->id :rasta)
               (driver/drop-view! driver/*driver* (mt/id) (str/join "." (filter some? [schema# name#])))))))
       (t2/delete! :model/Table :name [:like "mb_transform%"])
       (t2/delete! :model/TransformView :view_name [:like "mb_transform%"])
       ~@body))

;; API tests

(deftest can-create-transform-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (mt/dataset
      users-departments-with-score
      (with-no-transform-views
        (let [dataset-query (let [mp (mt/metadata-provider)]
                              (-> (lib/query mp (lib.metadata/table mp (mt/id :users)))
                                  (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :users :score))))
                                  (lib/breakout (lib.metadata/field mp (mt/id :users :score)))
                                  (lib.convert/->legacy-MBQL)))
              display-name "Test view 1"
              resp (mt/user-http-request :rasta :post 200 "transform"
                                         {:display_name display-name
                                          :dataset_query dataset-query})]
          (testing "POST /transform creates new view in app db"
            (is (=? {:id pos-int?
                     :database_id (mt/id)
                     :creator_id (mt/user->id :rasta)
                     :status "view_synced"}
                    resp)))
          (let [transform-id (:id resp)
                transform (t2/select-one :model/TransformView :id transform-id)
                table (t2/select-one :model/Table :transform_id transform-id)
                table-id (:id table)]
            (testing "Transform generated view has user set display name"
              (is (= (:view_name transform) (:name table)))
              (is (= display-name (:display_name table))))
            (testing "Transform generated view can be queried"
              (let [mp (mt/metadata-provider)]
                (is (=? {:status :completed}
                        (-> (lib/query mp (lib.metadata/table mp table-id))
                            (qp/process-query))))))))))))

(deftest transform-table-name-clash-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (mt/dataset
      users-departments-db
      (with-no-transform-views
        (let [clashing-name "mb_transform_333"
              clashing-schema "clashing_schema_333"]
          (mt/with-temp [:model/Table _table {:db_id (mt/id) :schema clashing-schema :name clashing-name}]
            (with-redefs [models.transform/transform-view-name (constantly clashing-name)]
              (is (=? {:data {:database-id (mt/id)
                              :database-name (:name (mt/db))
                              :name clashing-name
                              :schema clashing-schema
                              :same-name-table-ids (comp pos-int? first)}}
                      (mt/user-http-request :rasta :post 400 "transform"
                                            {:schema clashing-schema
                                             :display_name "hello"
                                             :dataset_query
                                             (let [mp (mt/metadata-provider)]
                                               (-> (lib/query mp (lib.metadata/table mp (mt/id :users)))
                                                   (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :users :score))))
                                                   (lib/breakout (lib.metadata/field mp (mt/id :users :score)))
                                                   (lib.convert/->legacy-MBQL)))}))))))))))

(deftest transform-display-name-clash-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (mt/dataset
      users-departments-db
      (with-no-transform-views
        (let [clashing-name "T T T"]
          (testing "Base: view creation is successfull"
            (mt/user-http-request :rasta :post 200 "transform"
                                  {:display_name clashing-name
                                   :dataset_query
                                   (let [mp (mt/metadata-provider)]
                                     (-> (lib/query mp (lib.metadata/table mp (mt/id :users)))
                                         (lib.convert/->legacy-MBQL)))}))
          (testing "Creation of duplicate display name view fails"
            (is (=? {:database-id (mt/id)
                     :database-name (:name (mt/db))
                     :display-name clashing-name
                     :same-display-name-table-ids (comp pos-int? first)}
                    (mt/user-http-request :rasta :post 400 "transform"
                                          {:display_name clashing-name
                                           :dataset_query
                                           (let [mp (mt/metadata-provider)]
                                             (-> (lib/query mp (lib.metadata/table mp (mt/id :users)))
                                                 (lib.convert/->legacy-MBQL)))})))
            (is (= 1 (t2/count :model/Table :display_name clashing-name)))))))))

;; schemas -- ensure that picking of existing schema creates in that schema

(deftest put-test
  (mt/test-drivers
    (mt/normal-drivers-with-feature :view)
    (mt/dataset
      users-departments-db
      (with-no-transform-views
        (let [display-name "t r a n s"]
          (let [transform (mt/user-http-request :rasta :post 200 "transform"
                                                {:display_name display-name
                                                 :dataset_query
                                                 (let [mp (mt/metadata-provider)]
                                                   (-> (lib/query mp (lib.metadata/table mp (mt/id :users)))
                                                       (lib.convert/->legacy-MBQL)))})
                table (t2/select-one :model/Table :display_name display-name)
                table-id (:id table)]
            (testing "Base: view creation and sync is successful"
              (is (= 1 (t2/count :model/Table :display_name display-name)))
              (is #{"id" "name" "department_id" "score"}
                  (t2/select-fn-set :name :model/Field
                                    :table_id table-id
                                    :active true)))
            (let [mp (mt/metadata-provider)]
              (is (= [[1 "Alice" 10 100] [2 "Bob" 20 200] [3 "Charlie" 10 300]]
                     (mt/rows (-> (lib/query mp (lib.metadata/table mp table-id))
                                  (qp/process-query))))))
            (testing "PUT / can modify the query"
              (mt/user-http-request :rasta :put 200 (str "transform/" (:id transform))
                                    {:dataset_query
                                     (let [mp (mt/metadata-provider)]
                                       (-> (lib/query mp (lib.metadata/table mp (mt/id :departments)))
                                           (lib.convert/->legacy-MBQL)))})
              (is (= 1 (t2/count :model/Table :display_name display-name)))
              (is (= #{"idx" "name" "id"}
                     (t2/select-fn-set :name :model/Field
                                       :table_id table-id
                                       :active true)))
              (let [mp (mt/metadata-provider)]
                (is (= [[1 10 "Engineering"] [2 20 "Sales"]]
                       (mt/rows (-> (lib/query mp (lib.metadata/table mp table-id))
                                    (qp/process-query)))))))))))))
