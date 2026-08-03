(ns metabase.typed-schemas.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.core :as typed-schemas]
   [metabase.typed-schemas.source :as source]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private test-info
  {:generated-at "2026-01-01T00:00:00Z"
   :instance-url "https://metabase.example.com"})

(deftest options-reject-unknown-keys-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Invalid semantic schema options\."
                        (typed-schemas/fetch-items {:unknown-option true}))))

(deftest options-reject-collection-and-database-scopes-together-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"mutually exclusive"
                        (typed-schemas/fetch-items {:database {:id 1}
                                                    :include-data-library? true}))))

(deftest create-schema-assembles-items-test
  (is (= {:schemaVersion 2
          :generatedAt   "2026-01-01T00:00:00Z"
          :metabase      {:instanceUrl "https://metabase.example.com"}
          :questions     {"ordersByMonth" {:type "card", :key "ordersByMonth", :id 1}}
          :models        {"orders" {:actions {"create" {:kind "action", :id 9}}}}
          :tables        {"orders" {:type "table", :key "orders", :id 3}}
          :metrics       {"revenue" {:type "metric", :key "revenue", :id 2}}}
         (typed-schemas/create-schema
          {:questions [{:type "card", :key "ordersByMonth", :id 1}]
           :models    [{:key "orders", :name "Orders", :actions {"create" {:kind "action", :id 9}}}]
           :tables    [{:type "table", :key "orders", :id 3}]
           :metrics   [{:type "metric", :key "revenue", :id 2}]}
          test-info))))

(deftest create-schema-disambiguates-duplicate-keys-test
  (let [schema (typed-schemas/create-schema
                {:questions []
                 :models    []
                 :tables    [{:type "table", :key "orders", :id 3}
                             {:type "table", :key "orders", :id 4}]
                 :metrics   []}
                test-info)]
    (is (= ["orders3" "orders4"] (keys (:tables schema))))
    (is (= ["orders3" "orders4"] (map :key (vals (:tables schema)))))))

(deftest create-schema-defaults-info-test
  (let [schema (typed-schemas/create-schema {:questions [], :models [], :tables [], :metrics []})]
    (is (string? (:generatedAt schema)))
    (is (contains? (:metabase schema) :instanceUrl))))

(defn- literal-source
  "A [[source/SchemaSource]] over literal values. `tables` are filtered by the
  requested table ids so tests can see which tables fetching asked for."
  [{:keys [database-ids collection-ids library-scope library-tables
           questions models metrics tables]}]
  (reify source/SchemaSource
    (database-ids [_ _] database-ids)
    (collection-ids [_ _] collection-ids)
    (library-scope [_ _] library-scope)
    (questions [_ _ _] (vec questions))
    (models [_ _] (vec models))
    (metrics [_ _ _] (vec metrics))
    (tables [_ _ table-ids] (cond->> (vec tables)
                              table-ids (filterv #(contains? table-ids (:id %)))))
    (library-tables [_ _] (vec library-tables))))

;; fetch-items decides *what* to fetch; the source supplies literal rows, so
;; the test pins the scoping rules, not the db.
(deftest fetch-items-includes-tables-mapped-by-library-metrics-test
  (let [source (literal-source
                {:library-scope  {:metric-collection-ids #{20}
                                  :data-collection-ids   #{10}}
                 :library-tables [{:id 10}]
                 :metrics        [{:type "metric", :key "revenue", :id 1, :mappedTableIds [42]}]
                 :tables         [{:id 10, :type "table", :key "publishedTable"}
                                  {:id 42, :type "table", :key "mappedTable"}
                                  {:id 99, :type "table", :key "notInScope"}]})]
    (is (= {:questions []
            :models    []
            :tables    [{:id 10, :type "table", :key "publishedTable"}
                        {:id 42, :type "table", :key "mappedTable"}]
            :metrics   [{:type "metric", :key "revenue", :id 1, :mappedTableIds [42]}]}
           (typed-schemas/fetch-items {:include-data-library? true} source)))))

;; One end-to-end test over real application-database rows: every entity kind
;; created with with-temp, run through the whole pipeline to TypeScript.
;; Everything above tests the stages with cheap literal data; this proves the
;; composition works against the real thing.
(deftest full-pipeline-end-to-end-test
  (mt/with-temp [:model/Database db {:name "TS E2E DB", :settings {:database-enable-actions true}}
                 :model/Table table {:db_id (:id db), :name "widgets", :display_name "Widgets"
                                     :description "Fancy widgets", :active true}
                 :model/Field _ {:table_id (:id table), :name "id", :base_type :type/Integer
                                 :semantic_type :type/PK}
                 :model/Field price {:table_id (:id table), :name "price", :base_type :type/Float}
                 :model/Card _question {:name "Widget prices", :database_id (:id db), :table_id (:id table)
                                        :type :question, :display :table
                                        :dataset_query {:database (:id db), :type :query
                                                        :query {:source-table (:id table)}}
                                        :result_metadata [{:name "price", :display_name "Price"
                                                           :base_type :type/Float}]}
                 :model/Card _metric {:name "Widget revenue", :database_id (:id db), :table_id (:id table)
                                      :type :metric, :display :scalar
                                      :dataset_query {:database (:id db), :type :query
                                                      :query {:source-table (:id table)
                                                              :aggregation [[:sum [:field (:id price) nil]]]}}
                                      :result_metadata [{:name "sum", :display_name "Sum of price"
                                                         :base_type :type/Float}]}
                 :model/Card model {:name "Widget model", :database_id (:id db), :table_id (:id table)
                                    :type :model
                                    :dataset_query {:database (:id db), :type :query
                                                    :query {:source-table (:id table)}}
                                    :result_metadata [{:name "price", :display_name "Price"
                                                       :base_type :type/Float
                                                       :field_ref [:field (:id price) nil]
                                                       :id (:id price)}]}
                 :model/Action action {:name "Update price", :model_id (:id model), :type :implicit}
                 :model/ImplicitAction _ {:action_id (:id action), :kind "row/update"}]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [schema (typed-schemas/build-semantic-schema {:database {:id (:id db)}} test-info)
            body   (typed-schemas/render-typescript schema)]
        (testing "every entity kind lands in the schema, scoped to the temp database"
          (is (= ["widgetPrices"] (keys (:questions schema))))
          (is (= ["widgets"] (keys (:tables schema))))
          (is (= ["widgetRevenue"] (keys (:metrics schema))))
          (is (= ["widgetModel"] (keys (:models schema)))))
        (testing "entities carry their real relationships"
          (is (= ["id" "price"] (keys (get-in schema [:tables "widgets" :fields]))))
          (is (= [(:id table)] (get-in schema [:metrics "widgetRevenue" :mappedTableIds])))
          (is (= ["updatePrice"] (keys (get-in schema [:models "widgetModel" :actions])))))
        (testing "info pins the impure schema metadata"
          (is (= "2026-01-01T00:00:00Z" (:generatedAt schema)))
          (is (= "https://metabase.example.com" (get-in schema [:metabase :instanceUrl]))))
        (testing "the rendered module carries the real entities"
          (is (str/includes? body "widgets: {"))
          (is (str/includes? body "// Description: Fancy widgets"))
          (is (str/includes? body "name: \"Widget revenue\""))
          (is (str/includes? body "updatePrice: {"))
          (is (str/ends-with? body "export default schema;\n")))))))
