(ns metabase.agent-lib.test-util
  (:require
   [metabase.agent-lib.representations :as repr]))

(set! *warn-on-reflection* true)

(def structural-validation-cases
  "Cases pair each validator with an invalid query and its expected message."
  [[repr/validate-external-query
    {:lib/type "mbql/query"
     :database "Sample"
     :stages [{:lib/type "mbql.stage/mbql"
               :source-table ["Sample" "PUBLIC" "ORDERS"]
               :filters {:op ">"}}]}
    "External query has an invalid structure."]
   [repr/validate-query
    {"lib/type" "mbql/query"
     "database" "Sample"
     "stages" [{"lib/type" "mbql.stage/mbql"
                "source-table" ["Sample" "PUBLIC" "ORDERS"]
                "filters" {"op" ">"}}]}
    "Representations query has an invalid structure."]])
