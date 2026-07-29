(ns metabase.typed-schemas.api.schema.table-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.metabot.core :as metabot]
   [metabase.test :as mt]
   [metabase.typed-schemas.api.schema.common :as schema.common]
   [metabase.typed-schemas.api.schema.table :as schema.table]
   [toucan2.core :as t2]))

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

; Avoid N+1 on table fields by re-using the known table id
(deftest table-schema-uses-known-table-id-for-detail-fields-test
  (let [field-table-lookups (atom 0)
        detail-fields       [{:field_id     42
                              :name         "created_at"
                              :display_name "Created At"
                              :base_type    "type/DateTime"}
                             {:field_id     43
                              :name         "total"
                              :display_name "Total"
                              :base_type    "type/Decimal"}]]
    (with-redefs [t2/select-one-fn (fn [& _]
                                     (swap! field-table-lookups inc)
                                     999)]
      (let [schema (schema.table/table-schema (assoc orders-table :fields detail-fields))]
        (is (= #{10} (->> (:fields schema) vals (map :tableId) set)))
        (is (zero? @field-table-lookups))))))

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

(deftest table-schemas-surface-detail-error-responses-test
  (mt/with-dynamic-fn-redefs [metabot/get-table-details
                              (constantly {:output "Not found."
                                           :status-code 404})]
    (let [exception (try
                      (doall (schema.table/table-schemas [{:id 10 :name "Orders"}]))
                      (catch clojure.lang.ExceptionInfo exception
                        exception))]
      (is (instance? clojure.lang.ExceptionInfo exception))
      (is (= {:table-id      10
              :table-name    "Orders"
              :status-code   404
              :error-message "Not found."}
             (ex-data exception))))))

;; Batch measure definitions to avoid N+1 queries.
(deftest table-schema-bulk-loads-measure-definitions-test
  (let [measure-select-count     (atom 0)
        metadata-provider-count (atom 0)
        measures                 [{:id 1 :name "Total Revenue"}
                                  {:id 2 :name "Average Revenue"}]]
    (with-redefs [lib-be/application-database-metadata-provider (fn [_database-id]
                                                                  (swap! metadata-provider-count inc)
                                                                  :metadata-provider)
                  schema.common/aggregation-result-column-with-metadata-provider (constantly nil)
                  t2/select (fn [columns & _args]
                              (when (= columns [:model/Measure :id :definition])
                                (swap! measure-select-count inc)
                                [{:id 1 :definition [:aggregation 1]}
                                 {:id 2 :definition [:aggregation 2]}]))]
      (schema.table/table-schema (assoc orders-table :measures measures))
      (is (= 1 @measure-select-count))
      (is (= 1 @metadata-provider-count)))))
