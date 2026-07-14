(ns metabase.typed-schemas.api.schema.table-test
  (:require
   [clojure.test :refer :all]
   [metabase.typed-schemas.api.schema.table :as schema.table]))

(def ^:private created-at-field
  {:id           42
   :table_id     10
   :name         "created_at"
   :display_name "Created At"
   :base_type    "type/DateTime"})

(def ^:private created-at-field-schema
  {:type        "column"
   :name        "created_at"
   :displayName "Created At"
   :baseType    "type/DateTime"
   :jsType      "Date"
   :key         "createdAt"
   :id          42
   :fieldId     42
   :tableId     10})

(def ^:private orders-table
  {:id            10
   :name          "orders"
   :display_name  "Orders"
   :database_id   1
   :database_name "Boba"
   :fields        [created-at-field]})

(def ^:private total-revenue-measure
  {:id   1
   :name "Total Revenue"})

(def ^:private total-revenue-schema
  {:type    "measure"
   :key     "totalRevenue"
   :id      1
   :tableId 10
   :name    "Total Revenue"})

(deftest field-schema-uses-field-id-test
  (is (= created-at-field-schema
         (schema.table/field-schema created-at-field))))

(deftest table-schema-keys-fields-test
  (is (= {:type         "table"
          :key          "orders"
          :id           10
          :name         "Orders"
          :databaseName "Boba"
          :tableName    "orders"
          :fields       {"createdAt" (assoc created-at-field-schema :sourceName "orders")}}
         (schema.table/table-schema orders-table))))

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
      (is (= (assoc total-revenue-schema
                    :columns [{:type        "column"
                               :name        "sum"
                               :displayName "Sum of Total"
                               :baseType    "type/Decimal"
                               :jsType      "number"}])
             (schema.table/measure-schema 10 2 total-revenue-measure)))))
  (testing "measure result columns fall back to the measure name"
    (with-redefs [schema.table/measure-result-column (constantly nil)]
      (is (= (assoc total-revenue-schema
                    :columns [{:type "column", :name "Total Revenue", :displayName "Total Revenue", :jsType "unknown"}])
             (schema.table/measure-schema 10 2 total-revenue-measure))))))
