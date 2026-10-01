(ns metabase.typed-schemas.javascript-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.typed-schemas.javascript :as javascript]
   [metabase.util.malli.registry :as mr]))

(defn- render-lines
  "Renders a one-statement module and returns its lines, without the trailing
  newline, so goldens read naturally as vectors of lines."
  [statement]
  (str/split-lines (javascript/render-js [:module statement])))

(deftest literal-expressions-test
  (are [expr rendered] (= [(str "const x = " rendered " as const;")]
                          (render-lines [:const "x" expr]))
    [:lit 42]           "42"
    [:lit "hi"]         "\"hi\""
    [:lit true]         "true"
    [:lit nil]          "null"
    [:ref "tables"]     "tables"
    [:arr]              "[ ]"
    [:obj]              "{ }"))

(deftest reference-paths-quote-non-identifier-segments-test
  (are [segments rendered] (= [(str "const x = " rendered " as const;")]
                              (render-lines (into [:const "x"] [(into [:ref] segments)])))
    ["tables" "orders" "fields"] "tables.orders.fields"
    ["tables" "50thPercentile"]  "tables[\"50thPercentile\"]"
    [:tables :orders]            "tables.orders"))

(deftest arrays-of-literals-render-inline-test
  (is (= ["const x = [ 1, 2, 3 ] as const;"]
         (render-lines [:const "x" [:arr [:lit 1] [:lit 2] [:lit 3]]]))))

(deftest arrays-of-objects-render-multiline-with-metadata-test
  (is (= ["const x = ["
          "  {"
          "    name: \"total\""
          "    /* metadata: {"
          "      \"displayName\": \"Total\""
          "    } */"
          "  },"
          "  {"
          "    name: \"tax\""
          "  }"
          "] as const;"]
         (render-lines
          [:const "x" [:arr
                       [:item {:metadata {"displayName" "Total"}}
                        [:obj ["name" [:lit "total"]]]]
                       [:obj ["name" [:lit "tax"]]]]]))))

(deftest objects-render-metadata-inside-and-quote-non-identifier-keys-test
  (is (= ["const x = {"
          "  orders: {"
          "    type: \"table\","
          "    \"has-totals\": true"
          "    /* metadata: {"
          "      \"entityId\": \"abc123\","
          "      \"description\": \"All orders\""
          "    } */"
          "  }"
          "} as const;"]
         (render-lines
          [:const "x" [:obj
                       ["orders" {:metadata (array-map "entityId" "abc123"
                                                       "description" "All orders")}
                        [:obj ["type" [:lit "table"]]
                         ["has-totals" [:lit true]]]]]]))))

(deftest metadata-renders-in-an-otherwise-empty-object-test
  (is (= ["const x = {"
          "  orders: {"
          "    /* metadata: {"
          "      \"id\": 1"
          "    } */"
          "  }"
          "} as const;"]
         (render-lines
          [:const "x" [:obj ["orders" {:metadata {"id" 1}} [:obj]]]]))))

(deftest metadata-nests-objects-and-keeps-arrays-inline-test
  (is (= ["const x = {"
          "  orders: {"
          "    id: 1"
          "    /* metadata: {"
          "      \"filters\": [\"Status is paid\", \"Total is greater than 10\"],"
          "      \"sourceTable\": {"
          "        \"databaseName\": \"Sample\","
          "        \"tableName\": \"ORDERS\""
          "      }"
          "    } */"
          "  }"
          "} as const;"]
         (render-lines
          [:const "x" [:obj ["orders" {:metadata (array-map "filters" ["Status is paid" "Total is greater than 10"]
                                                            "sourceTable" (array-map "databaseName" "Sample"
                                                                                     "tableName" "ORDERS"))}
                             [:obj ["id" [:lit 1]]]]]]))))

(deftest metadata-cannot-end-its-comment-early-test
  (testing "`*/` inside a value is written as `*\\/`, which JSON reads back as `*/`"
    (let [rendered (javascript/render-js
                    [:module [:const "x" [:obj ["orders" {:metadata {"description" "Paid orders /* see note */"}}
                                                [:obj ["id" [:lit 1]]]]]]])]
      (is (str/includes? rendered "\"description\": \"Paid orders /* see note *\\/\""))
      (is (= 1 (count (re-seq #"\*/" rendered)))))))

(deftest call-expressions-render-inline-test
  (is (= ["const x = {"
          "  orders: pickFields(tables.orders.fields, [ \"total\" ], { sourceFieldId: 42 })"
          "} as const;"]
         (render-lines
          [:const "x" [:obj
                       ["orders" [:call "pickFields"
                                  [:ref "tables" "orders" "fields"]
                                  [:arr [:lit "total"]]
                                  [:obj ["sourceFieldId" [:lit 42]]]]]]]))))

(deftest modules-join-statements-with-blank-lines-test
  (is (= (str "function helper() {}\n"
              "\n"
              "const schema = { } as const;\n"
              "\n"
              "export default schema;\n")
         (javascript/render-js
          [:module
           [:raw "function helper() {}"]
           [:const "schema" [:obj]]
           [:export-default [:ref "schema"]]]))))

(deftest module-schema-accepts-the-grammar-test
  (is (mr/validate javascript/Module
                   [:module
                    [:raw "function helper() {}"]
                    [:const "tables"
                     [:obj ["orders" {:metadata {"entityId" "abc"}}
                            [:obj ["ids" [:arr [:lit 1] [:item {:metadata {"name" "c"}} [:obj]]]]
                             ["fields" [:call "pickFields" [:ref "tables" "orders"]]]]]]]
                    [:export-default [:ref "schema"]]])))

(deftest module-schema-rejects-unknown-nodes-test
  (are [module] (not (mr/validate javascript/Module module))
    [:module [:const "x" [:string "not-a-node"]]]
    [:module [:const "x" [:obj ["key" {:metadataz {"typo" 1}} [:lit 1]]]]]
    ;; Comments were replaced by metadata blocks.
    [:module [:const "x" [:obj ["key" {:comments ["Entity ID: abc"]} [:obj]]]]]
    [:const "x" [:lit 1]]))
