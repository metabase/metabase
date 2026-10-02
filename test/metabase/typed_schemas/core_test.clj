(ns metabase.typed-schemas.core-test
  "Typed schema tests form a pyramid; put new tests at the lowest level that
  can express them:

  - In-memory (no db): printer goldens in `javascript-test` (the output format
    spec), structural =? AST tests in `render-test`, pure shaping in
    `common-test` and the `schema.*` tests, assembly from literal [[Items]]
    and scoping rules against a reified literal source here.
  - Db seam (with-temp): `source-test` for `app-db-source`, `scope-test` for
    library-tree classification.
  - One end-to-end test here on `mt/dataset test-data`, through the whole
    pipeline to rendered TypeScript."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.build :as build]
   [metabase.typed-schemas.core :as typed-schemas]
   [metabase.typed-schemas.source :as source]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private test-info
  {:generated-at "2026-01-01T00:00:00Z"
   :instance-url "https://metabase.example.com"})

(deftest options-reject-unknown-keys-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Invalid semantic schema options\."
                        (build/fetch-items {:unknown-option true}))))

(deftest options-reject-collection-and-database-scopes-together-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"mutually exclusive"
                        (build/fetch-items {:database {:id 1}
                                            :include-data-library? true}))))

(deftest create-schema-assembles-items-test
  (is (= {:schemaVersion 2
          :generatedAt   "2026-01-01T00:00:00Z"
          :metabase      {:instanceUrl "https://metabase.example.com"}
          :actions       {"shipOrder" {:kind "action", :key "shipOrder", :id 11}}
          :tables        {"orders" {:type "table", :key "orders", :id 3}}
          :metrics       {"revenue" {:type "metric", :key "revenue", :id 2}}}
         (build/create-schema
          {:actions   [{:kind "action", :key "shipOrder", :id 11}]
           :tables    [{:type "table", :key "orders", :id 3}]
           :metrics   [{:type "metric", :key "revenue", :id 2}]}
          test-info))))

(deftest create-schema-disambiguates-duplicate-keys-test
  (let [schema (build/create-schema
                {:actions   []
                 :tables    [{:type "table", :key "orders", :id 3}
                             {:type "table", :key "orders", :id 4}]
                 :metrics   []}
                test-info)]
    (is (= ["orders3" "orders4"] (keys (:tables schema))))
    (is (= ["orders3" "orders4"] (map :key (vals (:tables schema)))))))

(deftest create-schema-defaults-info-test
  (let [schema (build/create-schema {:actions [], :tables [], :metrics []})]
    (is (string? (:generatedAt schema)))
    (is (contains? (:metabase schema) :instanceUrl))))

(defn- literal-source
  "A [[source/SchemaSource]] over literal values. `tables` are filtered by the
  requested table ids so tests can see which tables fetching asked for."
  [{:keys [database-ids collection-ids library-scope library-tables
           questions actions metrics tables]}]
  (reify source/SchemaSource
    (database-ids [_ _] database-ids)
    (collection-ids [_ _] collection-ids)
    (library-scope [_ _] library-scope)
    (questions [_ _ _] (vec questions))
    (actions [_ _] (vec actions))
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
    (is (= {:actions   []
            :tables    [{:id 10, :type "table", :key "publishedTable"}
                        {:id 42, :type "table", :key "mappedTable"}]
            :metrics   [{:type "metric", :key "revenue", :id 1, :mappedTableIds [42]}]}
           (build/fetch-items {:include-data-library? true} source)))))

(deftest options-reject-question-collection-refs-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Invalid semantic schema options\."
                        (build/fetch-items {:question-collection-refs [{:id 1}]}))))

(deftest fetch-items-includes-actions-only-when-requested-test
  (let [action-calls (atom [])
        action       {:kind "action", :key "shipOrder", :id 11}
        source       (reify source/SchemaSource
                       (database-ids [_ database-ref] (when database-ref #{26}))
                       (collection-ids [_ _] nil)
                       (library-scope [_ {:keys [include-data-library?]}]
                         (when include-data-library? {:data-collection-ids #{10}}))
                       (questions [_ _ _] [])
                       (actions [_ database-ids]
                         (swap! action-calls conj database-ids)
                         [action])
                       (metrics [_ _ _] [])
                       (tables [_ _ _] [])
                       (library-tables [_ _] []))]
    (testing "no action is read unless asked for"
      (is (=? {:actions []} (build/fetch-items {:database {:id 26}} source)))
      (is (empty? @action-calls)))
    (testing "a database scope scopes the actions to it"
      (is (=? {:actions [action]} (build/fetch-items {:database {:id 26}, :include-actions? true} source))))
    (testing "a library scope reads every readable action"
      (is (=? {:actions [action]} (build/fetch-items {:include-data-library? true, :include-actions? true} source))))
    (is (= [#{26} nil] @action-calls))))

;; One end-to-end test over the real test-data dataset: cards for every entity
;; kind on real synced tables, run through the whole pipeline to TypeScript.
;; Everything above tests the stages with cheap literal data; this proves the
;; composition works against the real thing. With real fields the question and
;; metric cards need no result_metadata — columns are computed from metadata.
(deftest full-pipeline-end-to-end-test
  (mt/dataset test-data
    ;; Use a copy of the Database so Cards committed concurrently by other namespaces cannot affect the
    ;; database-scoped assertion below.
    (mt/with-temp-copy-of-db
      (mt/with-actions-enabled
        (let [mp            (mt/metadata-provider)
              orders-query  (lib/query mp (lib.metadata/table mp (mt/id :orders)))
              revenue-query (lib/aggregate orders-query
                                           (lib/sum (lib.metadata/field mp (mt/id :orders :total))))]
          (mt/with-temp [:model/Card _question {:name "Order totals", :database_id (mt/id), :table_id (mt/id :orders)
                                                :type :question, :display :table
                                                :dataset_query orders-query}
                         :model/Card _metric {:name "Order revenue", :database_id (mt/id), :table_id (mt/id :orders)
                                              :type :metric, :display :scalar
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
              (let [schema (typed-schemas/build-semantic-schema {:database         {:id (mt/id)}
                                                                 :include-actions? true}
                                                                test-info)
                    body   (typed-schemas/render-typescript schema)]
                (testing "every entity kind lands in the schema with its real relationships"
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
                (testing "only the temp metric and action are in scope for the dataset database"
                  (is (= {:metrics ["orderRevenue"], :actions ["discountOrder"]}
                         (update-vals (select-keys schema [:metrics :actions])
                                      (comp vec keys)))))
                (testing "the rendered module carries the real entities"
                  (is (str/includes? body "orders: {"))
                  (is (str/includes? body "name: \"Order revenue\""))
                  (is (str/includes? body "discountOrder: {"))
                  (is (str/ends-with? body "export default schema;\n")))))))))))
