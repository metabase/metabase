(ns metabase.typed-schemas.api.schema.table-test
  (:require
   [clojure.test :refer :all]
   [metabase.typed-schemas.api.schema.table :as schema.table]))

(deftest field-schema-uses-field-id-test
  (is (= {:name          "created_at"
          :type          "column"
          :displayName   "Created At"
          :baseType      "type/DateTime"
          :jsType        "Date"
          :key           "createdAt"
          :id            42
          :fieldId       42
          :tableId       10}
         (schema.table/field-schema {:id             42
                                     :table_id       10
                                     :name           "created_at"
                                     :display_name   "Created At"
                                     :base_type      "type/DateTime"}))))

(deftest table-schema-keys-fields-test
  (is (= {:type         "table"
          :key          "orders"
          :id           10
          :name         "Orders"
          :databaseName "Boba"
          :tableName    "orders"
          :fields       {"createdAt" {:type          "column"
                                      :name          "created_at"
                                      :sourceName    "orders"
                                      :displayName   "Created At"
                                      :baseType      "type/DateTime"
                                      :jsType        "Date"
                                      :key           "createdAt"
                                      :id            42
                                      :fieldId       42
                                      :tableId       10}}}
         (schema.table/table-schema
          {:id            10
           :name          "orders"
           :display_name  "Orders"
           :database_id   1
           :database_name "Boba"
           :fields        [{:id           42
                            :table_id     10
                            :name         "created_at"
                            :display_name "Created At"
                            :base_type    "type/DateTime"}]}))))

(deftest segment-schema-uses-type-discriminator-test
  (is (= {:type    "segment"
          :key     "completedOrders"
          :id      12
          :tableId 10
          :name    "Completed Orders"}
         (schema.table/segment-schema
          10
          {:id           12
           :name         "Completed Orders"
           :display-name "Completed Orders"}))))

(deftest measure-schema-uses-result-column-test
  (testing "measure result columns come from the measure definition when available"
    (with-redefs [schema.table/measure-result-column
                  (constantly {:name         "sum"
                               :display_name "Sum of Total"
                               :base_type    "type/Decimal"})]
      (is (= {:type    "measure"
              :key     "totalRevenue"
              :id      1
              :tableId 10
              :name    "Total Revenue"
              :columns [{:type        "column"
                         :name        "sum"
                         :displayName "Sum of Total"
                         :baseType    "type/Decimal"
                         :jsType      "number"}]}
             (schema.table/measure-schema
              10
              2
              {:id   1
               :name "Total Revenue"})))))
  (testing "measure result columns fall back to the measure name"
    (with-redefs [schema.table/measure-result-column (constantly nil)]
      (is (= {:type    "measure"
              :key     "totalRevenue"
              :id      1
              :tableId 10
              :name    "Total Revenue"
              :columns [{:type "column", :name "Total Revenue", :displayName "Total Revenue", :jsType "unknown"}]}
             (schema.table/measure-schema
              10
              2
              {:id   1
               :name "Total Revenue"}))))))
