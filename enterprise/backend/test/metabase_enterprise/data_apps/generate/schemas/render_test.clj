(ns metabase-enterprise.data-apps.generate.schemas.render-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.generate.schemas :as schemas]
   [metabase-enterprise.data-apps.generate.schemas.javascript :as schemas.javascript]
   [metabase-enterprise.data-apps.generate.schemas.render :as schemas.render]
   [metabase.util.malli.registry :as mr]))

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
   :filters        ["Status is paid" "Created At is in the previous 30 days"]
   :mappedTableIds [10 20]
   :dimensions     {"paymentMethod" payment-method-dimension
                    "franchiseName" franchise-name-dimension}})

(def ^:private compacting-schema
  {:schemaVersion 2
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

(deftest typescript-renderer-emits-metadata-blocks-and-runtime-data-test
  (let [body (schemas/render-typescript compacting-schema)]
    (testing "context for agents is a metadata block, never a line comment"
      (is (not (re-find #"(?m)^\s*//" body)))
      (testing "an entry opens with its block, so a reader meets the context before the data"
        (is (re-find #"(?s)revenue: \{\n\s*/\* metadata: \{.*?\} \*/\n\s*type: \"metric\"" body))
        (is (str/includes? body "\"description\": \"Total order revenue\""))
        (is (str/includes? body (str "/* metadata: { \"displayName\": \"Payment Method\", "
                                     "\"semanticType\": \"type/Category\" } */\n        type: \"column\""))))
      (testing "a block with a nested value prints one array item per line"
        (is (re-find #"(?s)\"filters\": \[\n\s*\"Status is paid\",\n\s*\"Created At is in the previous 30 days\"\n\s*\]" body))))
    (testing "data for the Lib.createTestQuery DSL stays runtime"
      (is (str/includes? body "revenue: {\n    /* metadata:"))
      (is (str/includes? body "paymentMethod: {\n        /* metadata:"))
      (is (str/includes? body "databaseId: 1"))
      (is (str/includes? body "sourceTableId: 10"))
      (is (str/includes? body "mappedTableIds: [ 10, 20 ]")))
    (testing "metadata-only keys never become runtime fields"
      (is (not (str/includes? body "displayName: \"Payment Method\"")))
      (is (not (str/includes? body "filters:"))))))

(deftest typescript-renderer-omits-what-a-metadata-block-has-nothing-to-say-test
  (let [body (schemas/render-typescript
              {:schemaVersion 2
               :tables        {"orders" {:type        "table"
                                         :id          10
                                         :name        "Orders"
                                         :description "   "
                                         :fields      {}}}
               :metrics       {"revenue" {:type        "metric"
                                          :id          31
                                          :sourceTable {:databaseName "Sample Database"
                                                        :schemaName   nil
                                                        :tableName    "ORDERS"}}
                               "profit"  {:type        "metric"
                                          :id          32
                                          :sourceTable {:databaseName "Sample Database"
                                                        :schemaName   ""
                                                        :tableName    "PRODUCTS"}}}})]
    (testing "a table in a database without schemas has no schema key, whether the schema is nil or blank"
      (is (= 2 (count (re-seq #"\"sourceTable\": \{\n\s*\"databaseName\": \"Sample Database\",\n\s*\"tableName\": \"(ORDERS|PRODUCTS)\"\n\s*\}" body))))
      (is (not (str/includes? body "null")))
      (is (not (str/includes? body "schemaName"))))
    (testing "a blank description is not written"
      (is (not (str/includes? body "description"))))))

(deftest typescript-renderer-compacts-metric-dimensions-test
  (let [body (schemas/render-typescript compacting-schema)]
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
  (are [schema] (mr/validate schemas.javascript/Module (schemas.render/schema->ast schema))
    compacting-schema
    raw-dimensions-schema))

(deftest schema->ast-compacts-metric-dimensions-test
  (let [ast        (schemas.render/schema->ast compacting-schema)
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

(deftest schema->ast-splits-runtime-keys-from-metadata-test
  (let [ast    (schemas.render/schema->ast compacting-schema)
        fields (-> (module-const ast "tables")
                   (obj-entry "orders")
                   (obj-entry :fields))
        [entry-key options field-node] (-> fields rest first)]
    (testing "metadata-only policy keys become the entry's metadata"
      (is (= "paymentMethod" entry-key))
      (is (= {:metadata {"displayName"  "Payment Method"
                         "semanticType" "type/Category"}}
             options)))
    (testing "runtime policy keys become object entries"
      (is (= [:lit "payment_method"] (obj-entry field-node :name)))
      (is (= [:lit "string"] (obj-entry field-node :jsType)))
      (is (nil? (obj-entry field-node :displayName))))))

(deftest typescript-renderer-omits-pick-fields-helper-for-raw-dimensions-test
  (let [body (schemas/render-typescript raw-dimensions-schema)]
    ;; Dimensions that cannot be resolved to table fields stay as raw fields, so
    ;; the rendered module should not include the pickFields helper.
    (is (not (str/includes? body "function pickFields")))
    (is (not (str/includes? body "pickFields(")))
    (is (str/includes? body "fields: {\n        createdAt: {"))))
