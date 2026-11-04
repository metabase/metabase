(ns metabase-enterprise.data-apps.generate.schema.javascript-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.generate.schema.javascript :as schemas.javascript]))

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
