(ns metabase.typed-schemas.render-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.typed-schemas.core :as typed-schemas]
   [metabase.typed-schemas.javascript :as javascript]
   [metabase.typed-schemas.render :as render]
   [metabase.util.malli.registry :as mr]))

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
                                                             :jsType   "Date"}}}}})

(deftest typescript-renderer-emits-comments-and-runtime-metadata-test
  (let [body (typed-schemas/render-typescript compacting-schema)]
    ;; Emit comments to provide context for agents
    (is (str/includes? body "// Description: Saved orders"))
    (is (str/includes? body "// Description: Total order revenue"))
    (is (str/includes? body "// Display name: Payment Method"))
    (is (str/includes? body "// Semantic type: type/Category"))
    ;; Emit metadata needed for the Lib.createTestQuery DSL
    (is (str/includes? body "ordersQuestion: {\n    type: \"card\""))
    (is (str/includes? body "paymentMethod: {\n        type: \"column\""))
    (is (str/includes? body "databaseId: 1"))
    (is (str/includes? body "sourceTableId: 10"))
    (is (str/includes? body "mappedTableIds: [ 10, 20 ]"))
    ;; Comment-only metadata should not become runtime fields.
    (is (not (str/includes? body "displayName: \"Payment Method\"")))))

(deftest typescript-renderer-compacts-metric-dimensions-test
  (let [body (typed-schemas/render-typescript compacting-schema)]
    ;; Metric dimensions should compact into pickFields(...) references.
    (is (str/includes? body "function pickFields"))
    (is (str/includes? body "const field = fields[key] as { tableId?: number };"))
    (is (str/includes? body "const { tableId, ...joinedField } = field;"))
    (is (str/includes? body "orders: pickFields(tables.orders.fields, [ \"paymentMethod\" ])"))
    (is (str/includes? body "franchises: pickFields(tables.franchises.fields, [ \"name\" ], { sourceFieldId: 42 })"))
    ;; Source field id should be preserved.
    (is (= 1 (count (re-seq #"sourceFieldId: 42" body))))
    ;; `metricId` is only used to identify dimensions while compacting them.
    ;; The generated TypeScript module should not contain metric id.
    (is (not (str/includes? body "metricId: 5")))))

(defn- module-const
  "Returns the expression bound to `const-name` in a module AST."
  [ast const-name]
  (some (fn [statement]
          (when (and (= :const (first statement))
                     (= const-name (second statement)))
            (nth statement 2)))
        (rest ast)))

(defn- obj-entry
  "Returns the expression stored under `entry-key` in an `[:obj ...]` node."
  [obj-node entry-key]
  (some (fn [entry]
          (when (= entry-key (first entry))
            (last entry)))
        (rest obj-node)))

(deftest schema->ast-produces-valid-modules-test
  (are [schema] (mr/validate javascript/Module (render/schema->ast schema))
    compacting-schema
    raw-dimensions-schema))

(deftest schema->ast-compacts-metric-dimensions-test
  (let [ast        (render/schema->ast compacting-schema)
        dimensions (-> (module-const ast "metrics")
                       (obj-entry "revenue")
                       (obj-entry :dimensions))]
    (is (= [:call "pickFields"
            [:ref "tables" "orders" "fields"]
            [:arr [:lit "paymentMethod"]]]
           (obj-entry dimensions "orders")))
    (is (= [:call "pickFields"
            [:ref "tables" "franchises" "fields"]
            [:arr [:lit "name"]]
            [:obj ["sourceFieldId" [:lit 42]]]]
           (obj-entry dimensions "franchises")))))

(deftest schema->ast-splits-runtime-keys-from-comments-test
  (let [ast    (render/schema->ast compacting-schema)
        fields (-> (module-const ast "tables")
                   (obj-entry "orders")
                   (obj-entry :fields))
        [entry-key options field-node] (-> fields rest first)]
    (testing "comment-only policy keys become entry comments"
      (is (= "paymentMethod" entry-key))
      (is (= {:comments ["Display name: Payment Method"
                         "Semantic type: type/Category"]}
             options)))
    (testing "runtime policy keys become object entries"
      (is (= [:lit "payment_method"] (obj-entry field-node :name)))
      (is (= [:lit "string"] (obj-entry field-node :jsType)))
      (is (nil? (obj-entry field-node :displayName))))))

(deftest typescript-renderer-omits-pick-fields-helper-for-raw-dimensions-test
  (let [body (typed-schemas/render-typescript raw-dimensions-schema)]
    ;; Dimensions that cannot be resolved to table fields stay as raw fields, so
    ;; the rendered module should not include the pickFields helper.
    (is (not (str/includes? body "function pickFields")))
    (is (not (str/includes? body "pickFields(")))
    (is (str/includes? body "fields: {\n        createdAt: {"))))
