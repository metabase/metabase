(ns metabase.typed-schemas.api.schema.question-test
  (:require
   [clojure.test :refer :all]
   [metabase.typed-schemas.api.schema.question :as schema.question]))

(deftest question-schema-uses-card-source-discriminator-test
  (is (= {:type    "card"
          :key     "ordersQuestion"
          :id      41
          :name    "Orders question"
          :display "table"
          :columns [{:type "column", :name "count", :displayName "Count", :jsType "number"}]}
         (schema.question/question-schema
          {:id             41
           :name           "Orders question"
           :display        "table"
           :result-columns [{:name "count", :display_name "Count", :type :number}]}))))
