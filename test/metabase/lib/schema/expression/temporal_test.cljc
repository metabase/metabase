(ns metabase.lib.schema.expression.temporal-test
  (:require
   [clojure.test :refer [deftest is]]
   [malli.core :as mc]))

(deftest ^:parallel temporal-extract-test
  (is (not (mc/explain
            :mbql.clause/temporal-extract
            [:temporal-extract
             {:lib/uuid "202ec127-f7b9-49ce-b785-cd7b96996660"}
             [:field {:temporal-unit :default, :lib/uuid "cde9c9d4-c399-4808-8476-24b65842ba82"} 1]
             :year-of-era]))))
