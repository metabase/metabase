(ns metabase.typed-schemas.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.api :as typed-schemas.api]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest column-schema-includes-description-test
  (is (= {:name          "name"
          :displayName   "Name"
          :baseType      "type/Text"
          :jsType        "string"
          :description   "Name of the customer"}
         (#'typed-schemas.api/column-schema {:name         "name"
                                             :display_name "Name"
                                             :base_type    "type/Text"
                                             :description  "Name of the customer"}))))

(deftest metric-dimension-schema-uses-dimension-id-test
  (is (= {:name          "category"
          :displayName   "Category"
          :baseType      "type/Text"
          :jsType        "string"
          :key           "category"
          :id            "550e8400-e29b-41d4-a716-446655440001"
          :tableId       12
          :fieldId       3815}
         (#'typed-schemas.api/dimension-schema
          {:id             "550e8400-e29b-41d4-a716-446655440001"
           :name           "category"
           :display-name   "Category"
           :effective-type :type/Text
           :table-id       12
           :sources        [{:type :field, :field-id 3815}]}))))

(deftest field-schema-uses-field-id-test
  (is (= {:name          "created_at"
          :displayName   "Created At"
          :baseType      "type/DateTime"
          :jsType        "Date"
          :key           "createdAt"
          :id            42
          :fieldId       42}
         (#'typed-schemas.api/field-schema {:id             42
                                            :name           "created_at"
                                            :display_name   "Created At"
                                            :base_type      "type/DateTime"}))))

(deftest table-schema-keys-fields-test
  (is (= {:kind         "table"
          :key          "orders"
          :id           10
          :name         "Orders"
          :databaseId   1
          :databaseName "Boba"
          :tableName    "orders"
          :fields       {"createdAt" {:name          "created_at"
                                      :displayName   "Created At"
                                      :baseType      "type/DateTime"
                                      :jsType        "Date"
                                      :key           "createdAt"
                                      :id            42
                                      :fieldId       42}}}
         (#'typed-schemas.api/table-schema
          {:id            10
           :name          "orders"
           :display_name  "Orders"
           :database_id   1
           :database_name "Boba"
           :fields        [{:id           42
                            :name         "created_at"
                            :display_name "Created At"
                            :base_type    "type/DateTime"}]}))))

(deftest metric-schema-keys-dimensions-test
  (with-redefs [typed-schemas.api/metric-result-column (constantly nil)
                typed-schemas.api/metric-dimensions
                (constantly [{:id             "550e8400-e29b-41d4-a716-446655440001"
                              :name           "orders"
                              :display-name   "Orders"
                              :effective-type :type/Integer
                              :table-id       10
                              :sources        [{:type :field, :field-id 42}]}])]
    (is (= {:kind           "metric"
            :key            "customerLifetimeValue"
            :id             247
            :name           "Customer Lifetime Value"
            :columns        [{:name "Customer Lifetime Value", :displayName "Customer Lifetime Value", :jsType "unknown"}]
            :mappedTableIds [10]
            :dimensions     {"orders" {:name        "orders"
                                       :displayName "Orders"
                                       :baseType    "type/Integer"
                                       :jsType      "number"
                                       :key         "orders"
                                       :id          "550e8400-e29b-41d4-a716-446655440001"
                                       :tableId     10
                                       :fieldId     42}}}
           (#'typed-schemas.api/metric-schema
            {:id   247
             :name "Customer Lifetime Value"}
            {:id 247})))))

(deftest measure-schema-uses-result-column-test
  (testing "measure result columns come from the measure definition when available"
    (with-redefs [typed-schemas.api/measure-result-column
                  (constantly {:name         "sum"
                               :display_name "Sum of Total"
                               :base_type    "type/Decimal"})]
      (is (= {:kind    "measure"
              :key     "totalRevenue"
              :id      1
              :tableId 10
              :name    "Total Revenue"
              :columns [{:name        "sum"
                         :displayName "Sum of Total"
                         :baseType    "type/Decimal"
                         :jsType      "number"}]}
             (#'typed-schemas.api/measure-schema
              10
              2
              {:id   1
               :name "Total Revenue"})))))
  (testing "measure result columns fall back to the measure name"
    (with-redefs [typed-schemas.api/measure-result-column (constantly nil)]
      (is (= {:kind    "measure"
              :key     "totalRevenue"
              :id      1
              :tableId 10
              :name    "Total Revenue"
              :columns [{:name "Total Revenue", :displayName "Total Revenue", :jsType "unknown"}]}
             (#'typed-schemas.api/measure-schema
              10
              2
              {:id   1
               :name "Total Revenue"}))))))

(deftest javascript-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/javascript")]
    (is (= "text/javascript; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (str/starts-with? (:body response) "export default {"))
    (is (str/includes? (:body response) "\n  schemaVersion: 2"))
    (is (str/includes? (:body response) "\n  questions: {"))
    (is (str/includes? (:body response) "\n  tables: {"))
    (is (str/includes? (:body response) "\n  metrics: {"))
    (is (str/ends-with? (:body response) "};\n"))
    (is (not (str/includes? (:body response) "\"schemaVersion\"")))
    (is (not (str/includes? (:body response) "operators: [ ]")))
    (is (not (str/includes? (:body response) "parameters: [ ]")))
    (is (not (str/includes? (:body response) "verified: false")))))

(deftest typescript-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/typescript")]
    (is (= "text/typescript; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (str/starts-with? (:body response) "export default {"))
    (is (str/includes? (:body response) "\n  schemaVersion: 2"))
    (is (str/ends-with? (:body response) "} as const;\n"))))

(deftest json-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/json")]
    (is (= "application/json; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (= 2 (get-in response [:body :schemaVersion])))
    (is (map? (get-in response [:body :questions])))
    (is (map? (get-in response [:body :tables])))
    (is (map? (get-in response [:body :metrics])))))

(deftest database-filter-test
  (testing "a non-matching database name returns an empty semantic schema"
    (let [response (mt/user-http-request-full-response
                    :crowberto
                    :get
                    200
                    "typed-schemas/v1/json?database=__missing_database__")]
      (is (= 2 (get-in response [:body :schemaVersion])))
      (is (= {} (get-in response [:body :questions])))
      (is (= {} (get-in response [:body :tables])))
      (is (= {} (get-in response [:body :metrics]))))))
