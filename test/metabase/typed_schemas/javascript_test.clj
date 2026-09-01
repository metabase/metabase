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

(deftest arrays-of-objects-render-multiline-with-comments-test
  (is (= ["const x = ["
          "  // Display name: Total"
          "  {"
          "    name: \"total\""
          "  },"
          "  {"
          "    name: \"tax\""
          "  }"
          "] as const;"]
         (render-lines
          [:const "x" [:arr
                       [:item {:comments ["Display name: Total"]}
                        [:obj ["name" [:lit "total"]]]]
                       [:obj ["name" [:lit "tax"]]]]]))))

(deftest objects-render-comments-and-quote-non-identifier-keys-test
  (is (= ["const x = {"
          "  // Entity ID: abc123"
          "  // Description: All orders"
          "  orders: {"
          "    type: \"table\","
          "    \"has-totals\": true"
          "  }"
          "} as const;"]
         (render-lines
          [:const "x" [:obj
                       ["orders" {:comments ["Entity ID: abc123"
                                             "Description: All orders"]}
                        [:obj ["type" [:lit "table"]]
                         ["has-totals" [:lit true]]]]]]))))

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
                     [:obj ["orders" {:comments ["Entity ID: abc"]}
                            [:obj ["ids" [:arr [:lit 1] [:item {:comments ["c"]} [:obj]]]]
                             ["fields" [:call "pickFields" [:ref "tables" "orders"]]]]]]]
                    [:export-default [:ref "schema"]]])))

(deftest module-schema-rejects-unknown-nodes-test
  (are [module] (not (mr/validate javascript/Module module))
    [:module [:const "x" [:string "not-a-node"]]]
    [:module [:const "x" [:obj ["key" {:commentz ["typo"]} [:lit 1]]]]]
    [:const "x" [:lit 1]]))
