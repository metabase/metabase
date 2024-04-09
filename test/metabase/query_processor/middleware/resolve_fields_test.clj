(ns metabase.query-processor.middleware.resolve-fields-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.middleware.resolve-fields :as qp.resolve-fields]))

(deftest ^:parallel field-ids-test
  (testing "Field IDs in metadata should get picked up correctly"
    (is (= #{1}
           (#'qp.resolve-fields/field-ids
            {:lib/type :mbql/query
             :database 1
             :stages   [{:lib/type           :mbql.stage/mbql
                         :lib/stage-metadata {:columns [{:lib/type :metadata/column, :id 1}
                                                        {:lib/type :metadata/column, :id 0}]}
                         :source-table       1}]})))))
