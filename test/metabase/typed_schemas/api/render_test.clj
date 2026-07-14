(ns metabase.typed-schemas.api.render-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.typed-schemas.api.render :as typed-schemas.api.render]))

(def ^:private orders-question
  {:type        "card"
   :description "Saved orders"})

(def ^:private orders-table
  {:type   "table"
   :id     10
   :fields {"paymentMethod" {:type         "column"
                             :name         "payment_method"
                             :displayName  "Payment Method"
                             :semanticType "type/Category"
                             :jsType       "string"
                             :fieldId      3970
                             :tableId      10}}})

(def ^:private franchises-table
  {:type   "table"
   :id     20
   :fields {"name" {:type        "column"
                    :name        "name"
                    :displayName "Name"
                    :jsType      "string"
                    :fieldId     500
                    :tableId     20}}})

(def ^:private payment-method-dimension
  {:name         "payment_method"
   :displayName  "Payment Method"
   :semanticType "type/Category"
   :fieldId      3970
   :tableId      10
   :metricId     5})

(def ^:private franchise-name-dimension
  {:name          "name"
   :fieldId       500
   :tableId       20
   :sourceFieldId 42
   :metricId      5})

(def ^:private revenue-metric
  {:type           "metric"
   :databaseId     1
   :sourceTableId  10
   :description    "Total order revenue"
   :mappedTableIds [10 20]
   :dimensions     {"paymentMethod" payment-method-dimension
                    "franchiseName" franchise-name-dimension}})

(def ^:private compacting-schema
  {:schemaVersion 2
   :questions     {"ordersQuestion" orders-question}
   :tables        {"orders"     orders-table
                   "franchises" franchises-table}
   :metrics       {"revenue" revenue-metric}})

(def ^:private raw-dimensions-schema
  {:schemaVersion 2
   :metrics       {"modelRevenue" {:type       "metric"
                                   :id         6
                                   :name       "Model Revenue"
                                   :dimensions {"createdAt" {:type     "column"
                                                             :name     "created_at"
                                                             :baseType "type/DateTime"
                                                             :jsType   "Date"
                                                             :metricId 6}}}}})

(deftest typescript-renderer-compacts-metric-dimensions-test
  (let [body (typed-schemas.api.render/render-typescript compacting-schema)]
    (is (str/includes? body (str "/" "/ Description: Saved orders")))
    (is (str/includes? body (str "/" "/ Description: Total order revenue")))
    (is (str/includes? body (str "/" "/ Display name: Payment Method")))
    (is (str/includes? body (str "/" "/ Semantic type: type/Category")))
    (is (str/includes? body "ordersQuestion: {\n    type: \"card\""))
    (is (str/includes? body "paymentMethod: {\n        type: \"column\""))
    (is (str/includes? body "databaseId: 1"))
    (is (str/includes? body "sourceTableId: 10"))
    (is (str/includes? body "mappedTableIds: [ 10, 20 ]"))
    (is (str/includes? body "function pickFields"))
    (is (str/includes? body "const field = fields[key] as { tableId?: number };"))
    (is (str/includes? body "const { tableId, ...joinedField } = field;"))
    (is (str/includes? body "orders: pickFields(tables.orders.fields, [ \"paymentMethod\" ])"))
    (is (str/includes? body "franchises: pickFields(tables.franchises.fields, [ \"name\" ], { sourceFieldId: 42 })"))
    (is (= 1 (count (re-seq #"sourceFieldId: 42" body))))
    (is (not (str/includes? body "displayName: \"Payment Method\"")))
    (is (not (str/includes? body "metricId: 5")))))

(deftest typescript-renderer-omits-pick-fields-helper-for-raw-dimensions-test
  (let [body (typed-schemas.api.render/render-typescript raw-dimensions-schema)]
    (is (not (str/includes? body "function pickFields")))
    (is (not (str/includes? body "pickFields(")))
    (is (str/includes? body "fields: {\n        createdAt: {"))
    (is (not (str/includes? body "metricId: 6")))))
