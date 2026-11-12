(ns metabase-enterprise.data-apps.generate.schema-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.generate.schema :as generate.schema]))

(defn- table
  [id table-key field-keys]
  {:type   "table"
   :key    table-key
   :id     id
   :name   table-key
   :fields (into (sorted-map)
                 (map-indexed (fn [i field-key]
                                (let [field-id (+ (* 100 id) i)]
                                  [field-key {:type    "column"
                                              :key     field-key
                                              :id      field-id
                                              :name    field-key
                                              :slug    field-key
                                              :jsType  "number"
                                              :fieldId field-id
                                              :tableId id}])))
                 field-keys)})

(defn- metric
  "A metric on `table`, with a dimension for each of its fields."
  [id metric-key {table-id :id, :keys [fields]}]
  {:type       "metric"
   :key        metric-key
   :id         id
   :name       metric-key
   :columns    [{:type "column" :name "count" :jsType "number"}]
   :dimensions (into (sorted-map)
                     (for [[field-key {:keys [fieldId]}] fields]
                       [field-key {:type    "column"
                                   :key     field-key
                                   :id      (str fieldId)
                                   :name    field-key
                                   :jsType  "number"
                                   :fieldId fieldId
                                   :tableId table-id}]))})

(defn- typescript
  [items]
  (generate.schema/render-typescript
   (generate.schema/create-schema items {:generated-at "2026-11-03T00:00:00Z"
                                         :instance-url "http://localhost:3000"})))

(defn- exported-entities
  "Returns export name -> `[type id]` of each table and metric that `ts` exports."
  [ts]
  (into {}
        (for [[_ export-name entity-type id] (re-seq #"(?m)^export const (\S+) = \{\n  type: \"(\w+)\",\n  id: (\d+),$" ts)]
          [export-name [entity-type (parse-long id)]])))

(deftest tables-and-metrics-are-exported-by-name-test
  (let [orders (table 1 "orders" ["createdAt" "total"])
        people (table 2 "people" ["name"])
        ts     (typescript {:tables  [orders people]
                            :metrics [(metric 7 "revenue" orders)]})]
    (testing "an app can import a single table or metric, so the bundler leaves out the ones it doesn't import"
      (is (str/includes? ts "\nexport const orders = {\n"))
      (is (str/includes? ts "\nexport const people = {\n"))
      (is (str/includes? ts "\nexport const revenue = {\n")))
    (testing "a metric's dimensions are a call the bundler may drop, given the table itself rather than a property of it"
      (is (str/includes? ts "orders: /* @__PURE__ */ pickFields(orders, [ \"createdAt\", \"total\" ])"))
      (is (not (str/includes? ts "pickFields(orders.fields"))))
    (testing "an app importing `schema` reads its tables and metrics under the same keys as before"
      (is (str/includes? ts (str "\n} as const;\n\n"
                                 "export const schema = {\n"
                                 "  schemaVersion: 3,\n"
                                 "  generatedAt: \"2026-11-03T00:00:00Z\",\n"
                                 "  metabase: {\n"
                                 "    instanceUrl: \"http://localhost:3000\"\n"
                                 "  },\n"
                                 "  tables: {\n"
                                 "    orders,\n"
                                 "    people\n"
                                 "  },\n"
                                 "  metrics: {\n"
                                 "    revenue\n"
                                 "  }\n"
                                 "} as const;\n"))))
    (testing "tables are declared before the metrics that read them"
      (is (< (str/index-of ts "export const orders")
             (str/index-of ts "export const revenue")
             (str/index-of ts "export const schema"))))))

(deftest export-names-are-unique-identifiers-test
  (let [ts (typescript {:tables  [(table 1 "orders" ["total"])
                                  (table 2 "default" ["total"])
                                  (table 3 "2024Sales" ["total"])
                                  (table 4 "schema" ["total"])
                                  (table 5 "注文" ["total"])
                                  (table 6 "orders(old)" ["total"])
                                  (table 9 "orders[old]" ["total"])]
                        :metrics [(metric 7 "orders" (table 1 "orders" ["total"]))
                                  (metric 8 "pickFields" (table 1 "orders" ["total"]))]})]
    (doseq [[entity-key export-name] [["orders"      "orders"]
                                      ["default"     "tableDefault_2"]
                                      ["2024Sales"   "table2024Sales_3"]
                                      ["schema"      "tableSchema_4"]
                                      ["注文"          "table_5"]
                                      ["orders(old)" "tableOrdersold_6"]
                                      ["orders[old]" "tableOrdersold_9"]]]
      (testing (str "table " entity-key)
        (is (str/includes? ts (str "\nexport const " export-name " = {\n")))
        (is (re-find (re-pattern (str "\n    "
                                      (if (= entity-key export-name)
                                        export-name
                                        (str "\"?\\Q" entity-key "\\E\"?: " export-name))
                                      "[,\n]"))
                     ts))))
    (testing "a metric whose key a table already uses is exported under another name"
      (is (str/includes? ts "\nexport const metricOrders_7 = {\n"))
      (is (str/includes? ts "\n    orders: metricOrders_7")))
    (testing "a metric can't take the name of the module's own helper"
      (is (str/includes? ts "\nexport const metricPickFields_8 = {\n"))
      (is (str/includes? ts "\n    pickFields: metricPickFields_8")))))

(deftest export-names-are-javascript-identifiers-test
  (let [orders   (table 1 "a\u2E2Fb" ["total"])
        exported (exported-entities (typescript {:tables  [orders]
                                                 :metrics [(metric 7 "a\u2E2Fc" orders)]}))]
    (testing "U+2E2F, a letter to Java but never part of a JavaScript identifier, is left out of export names"
      (is (= #{["table" 1] ["metric" 7]} (set (vals exported))))
      (is (= [] (filter #(str/includes? % "\u2E2F") (keys exported)))))))

(deftest export-names-keep-their-entity-test
  (letfn [(moved-names [before after]
            (let [before (exported-entities (typescript before))
                  after  (exported-entities (typescript after))]
              {:before (select-keys before (keys after))
               :after  (select-keys after (keys before))}))]
    (testing "removing a table doesn't give its export name to a table whose key differs only in punctuation"
      (let [{:keys [before after]} (moved-names {:tables [(table 1 "customer'sOrders" ["total"])
                                                          (table 2 "customers'Orders" ["total"])]}
                                                {:tables [(table 2 "customers'Orders" ["total"])]})]
        (is (= before after))))
    (testing "adding a table doesn't take the export name of a table already exported under it"
      (let [{:keys [before after]} (moved-names {:tables [(table 1 "table2024" ["total"])]}
                                                {:tables [(table 2 "2024" ["total"])
                                                          (table 1 "table2024" ["total"])]})]
        (is (= before after))))
    (testing "removing a table doesn't give its export name to a table whose fallback name it was"
      (let [{:keys [before after]} (moved-names {:tables [(table 1 "table2024" ["total"])
                                                          (table 2 "2024" ["total"])]}
                                                {:tables [(table 2 "2024" ["total"])]})]
        (is (= before after))))))
