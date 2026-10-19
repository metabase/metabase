(ns metabase-enterprise.data-apps.generate.schemas-test
  "Data app schema tests form a pyramid; put new tests at the lowest level that
  can express them:

  - In-memory (no db): printer goldens in `javascript-test` (the output format
    spec), structural =? AST tests in `render-test`, pure shaping in
    `common-test` and the `schemas.*` tests, assembly from literal [[Items]]
    against a reified literal source here.
  - Db seam (with-temp): `source-test` for `app-db-source`.
  - One end-to-end test here on `mt/dataset test-data`, through the whole
    pipeline to rendered TypeScript."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.generate.schemas :as schemas]
   [metabase-enterprise.data-apps.generate.schemas.source :as schemas.source]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private test-info
  {:generated-at "2026-01-01T00:00:00Z"
   :instance-url "https://metabase.example.com"})

(deftest create-schema-assembles-items-test
  (is (= {:schemaVersion 2
          :generatedAt   "2026-01-01T00:00:00Z"
          :metabase      {:instanceUrl "https://metabase.example.com"}
          :actions       {"shipOrder" {:kind "action", :key "shipOrder", :id 11}}
          :tables        {"orders" {:type "table", :key "orders", :id 3}}
          :metrics       {"revenue" {:type "metric", :key "revenue", :id 2}}}
         (schemas/create-schema
          {:actions   [{:kind "action", :key "shipOrder", :id 11}]
           :tables    [{:type "table", :key "orders", :id 3}]
           :metrics   [{:type "metric", :key "revenue", :id 2}]}
          test-info))))

(deftest create-schema-disambiguates-duplicate-keys-test
  (let [schema (schemas/create-schema
                {:actions   []
                 :tables    [{:type "table", :key "orders", :id 3}
                             {:type "table", :key "orders", :id 4}]
                 :metrics   []}
                test-info)]
    (is (= ["orders3" "orders4"] (keys (:tables schema))))
    (is (= ["orders3" "orders4"] (map :key (vals (:tables schema)))))))

(deftest create-schema-defaults-info-test
  (let [schema (schemas/create-schema {:actions [], :tables [], :metrics []})]
    (is (string? (:generatedAt schema)))
    (is (contains? (:metabase schema) :instanceUrl))))

(defn- literal-source
  "A [[schemas.source/SchemaSource]] over literal values. `tables` are filtered by the
  requested table ids so tests can see which tables fetching asked for."
  [{:keys [library-scope library-tables actions metrics tables]}]
  (reify schemas.source/SchemaSource
    (library-scope [_] library-scope)
    (actions [_] (vec actions))
    (metrics [_ _] (vec metrics))
    (tables [_ table-ids] (filterv #(contains? table-ids (:id %)) tables))
    (library-tables [_ _] (vec library-tables))))

(deftest fetch-items-includes-tables-mapped-by-library-metrics-test
  (let [source (literal-source
                {:library-scope  {:metric-collection-ids #{20}
                                  :data-collection-ids   #{10}}
                 :library-tables [{:id 10}]
                 :actions        [{:kind "action", :key "shipOrder", :id 11}]
                 :metrics        [{:type "metric", :key "revenue", :id 1, :mappedTableIds [42]}]
                 :tables         [{:id 10, :type "table", :key "publishedTable"}
                                  {:id 42, :type "table", :key "mappedTable"}
                                  {:id 99, :type "table", :key "notInScope"}]})]
    (is (= {:actions [{:kind "action", :key "shipOrder", :id 11}]
            :tables  [{:id 10, :type "table", :key "publishedTable"}
                      {:id 42, :type "table", :key "mappedTable"}]
            :metrics [{:type "metric", :key "revenue", :id 1, :mappedTableIds [42]}]}
           (schemas/fetch-items source)))))

(deftest fetch-items-hands-the-source-the-library-scope-test
  (let [metric-collections (atom nil)
        library-tables     (atom nil)
        source             (reify schemas.source/SchemaSource
                             (library-scope [_] {:data-collection-ids #{10} :metric-collection-ids #{20}})
                             (actions [_] [])
                             (metrics [_ collection-ids] (reset! metric-collections collection-ids) [])
                             (tables [_ _] [])
                             (library-tables [_ collection-ids] (reset! library-tables collection-ids) []))]
    (schemas/fetch-items source)
    (is (= #{20} @metric-collections))
    (is (= #{10} @library-tables))))

(deftest full-pipeline-end-to-end-test
  (mt/dataset test-data
    (mt/with-temp-copy-of-db
      (mt/with-actions-enabled
        (data-apps.tu/do-with-library!
         (fn [{:keys [data-id metrics-id]}]
           (let [mp            (mt/metadata-provider)
                 orders-query  (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                 revenue-query (lib/aggregate orders-query
                                              (lib/sum (lib.metadata/field mp (mt/id :orders :total))))]
             (t2/update! :model/Table (mt/id :orders) {:is_published true, :collection_id data-id})
             (mt/with-temp [:model/Card _metric {:name "Order revenue", :database_id (mt/id), :table_id (mt/id :orders)
                                                 :type :metric, :display :scalar, :collection_id metrics-id
                                                 :dataset_query revenue-query}
                            :model/Card model {:name "Order model", :database_id (mt/id), :table_id (mt/id :orders)
                                               :type :model
                                               :dataset_query orders-query
                                               :result_metadata [{:name "total", :display_name "Total"
                                                                  :base_type :type/Float
                                                                  :field_ref [:field (mt/id :orders :total) nil]
                                                                  :id (mt/id :orders :total)}]}
                            :model/Action action {:name "Update order", :model_id (:id model), :type :implicit}
                            :model/ImplicitAction _ {:action_id (:id action), :kind "row/update"}
                            :model/Action standalone {:name "Discount order", :type :query}
                            :model/QueryAction _ {:action_id     (:id standalone)
                                                  :dataset_query (lib/native-query mp "UPDATE orders SET discount = 0 WHERE id = {{id}}")}]
               (mt/with-current-user (mt/user->id :crowberto)
                 (let [schema (schemas/create-schema (schemas/fetch-items) test-info)
                       body   (schemas/render-typescript schema)]
                   (testing "the library's table and metric and the model-less action land in the schema with their real relationships"
                     (is (=? {:generatedAt "2026-01-01T00:00:00Z"
                              :metabase    {:instanceUrl "https://metabase.example.com"}
                              :tables      {"orders" {:fields {"total" {:jsType "number"}}}}
                              :metrics     {"orderRevenue" {:mappedTableIds [(mt/id :orders)]
                                                            :columns        [{:displayName "Sum of Total"
                                                                              :jsType      "number"}]}}
                              :actions     {"discountOrder" {:kind "action", :id (:id standalone), :type "query"}}}
                             schema)))
                   (testing "saved questions are absent from the schema"
                     (is (not (contains? schema :questions))))
                   (testing "an action that belongs to a model stays out"
                     (is (not (str/includes? body "updateOrder"))))
                   (testing "the rendered module carries the real entities"
                     (is (str/includes? body "orders: {"))
                     (is (str/includes? body "name: \"Order revenue\""))
                     (is (str/includes? body "discountOrder: {"))
                     (is (str/ends-with? body "export default schema;\n")))))))))))))
