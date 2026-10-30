(ns metabase.agent-lib.test-util
  (:require
   [metabase.agent-lib.representations :as repr]))

(set! *warn-on-reflection* true)

(defn structural-validation-error
  "The error that [[repr/validate-query]] throws for a query whose `filters` is a map instead of a list."
  []
  (try
    (repr/validate-query {"lib/type" "mbql/query"
                          "database" "Sample"
                          "stages" [{"lib/type" "mbql.stage/mbql"
                                     "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                     "filters" {"op" ">"}}]})
    (catch clojure.lang.ExceptionInfo e
      e)))
