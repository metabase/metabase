(ns metabase-enterprise.data-apps.generate.schema.javascript-test
  (:require
   [clojure.test :refer :all]
   [malli.error :as me]
   [metabase-enterprise.data-apps.generate.schema.javascript :as schemas.javascript]
   [metabase.util.malli.registry :as mr]))

(deftest metadata-with-nested-values-renders-on-one-line-test
  (testing "an entry's metadata is the one line before its properties, so a reader can grep for it"
    (is (= (str "const x = {\n"
                "  revenue: {\n"
                "    /* metadata: { \"description\": \"Paid totals\", \"filters\": [ \"Status is paid\", \"Total is greater than 10\" ], \"sourceTable\": { \"databaseName\": \"Sample\", \"tableName\": \"ORDERS\" } } */\n"
                "    type: \"metric\"\n"
                "  }\n"
                "} as const;\n")
           (schemas.javascript/render-js
            [:module [:const "x" [:obj ["revenue"
                                        {:metadata (array-map "description" "Paid totals"
                                                              "filters"     ["Status is paid" "Total is greater than 10"]
                                                              "sourceTable" (array-map :databaseName "Sample"
                                                                                       :tableName    "ORDERS"))}
                                        [:obj ["type" [:lit "metric"]]]]]]])))))

(deftest exported-const-test
  (testing "an exported const carries its metadata block inside its object"
    (is (= (str "export const orders = {\n"
                "  /* metadata: { \"tableName\": \"ORDERS\" } */\n"
                "  type: \"table\"\n"
                "} as const;\n")
           (schemas.javascript/render-js
            [:module [:const "orders" {:export   true
                                       :metadata {"tableName" "ORDERS"}}
                      [:obj ["type" [:lit "table"]]]]])))))

(deftest pure-call-test
  (testing "a call marked pure is annotated, so a bundler drops it when its result is unused"
    (is (= (str "const x = {\n"
                "  a: /* @__PURE__ */ pick(orders, [ \"id\" ]),\n"
                "  b: pick(orders)\n"
                "} as const;\n")
           (schemas.javascript/render-js
            [:module [:const "x" [:obj
                                  ["a" [:call "pick" {:pure true} [:ref "orders"] [:arr [:lit "id"]]]]
                                  ["b" [:call "pick" [:ref "orders"]]]]]])))))

(deftest shorthand-entry-test
  (testing "an entry whose value is a reference to its own key prints as the key alone"
    (is (= (str "const x = {\n"
                "  orders,\n"
                "  people: tablePeople_2,\n"
                "  fields: orders.fields,\n"
                "  picked: pick({ orders, people: tablePeople_2 })\n"
                "} as const;\n")
           (schemas.javascript/render-js
            [:module [:const "x" [:obj
                                  ["orders" [:ref "orders"]]
                                  ["people" [:ref "tablePeople_2"]]
                                  ["fields" [:ref "orders" :fields]]
                                  ["picked" [:call "pick" [:obj
                                                           ["orders" [:ref "orders"]]
                                                           ["people" [:ref "tablePeople_2"]]]]]]]])))))

(deftest ^:parallel module-schema-validates-printed-asts-test
  (testing "every AST the printer renders validates against Module"
    (doseq [ast [[:module [:const "x" [:obj ["revenue"
                                             {:metadata (array-map "description" "Paid totals"
                                                                   "filters"     ["Status is paid" "Total is greater than 10"]
                                                                   "sourceTable" (array-map :databaseName "Sample"
                                                                                            :tableName    "ORDERS"))}
                                             [:obj ["type" [:lit "metric"]]]]]]]
                 [:module [:const "orders" {:export   true
                                            :metadata {"tableName" "ORDERS"}}
                           [:obj ["type" [:lit "table"]]]]]
                 [:module [:const "x" [:obj
                                       ["a" [:call "pick" {:pure true} [:ref "orders"] [:arr [:lit "id"]]]]
                                       ["b" [:call "pick" [:ref "orders"]]]]]]]]
      (is (nil? (me/humanize (mr/explain schemas.javascript/Module ast)))
          (pr-str ast)))))
