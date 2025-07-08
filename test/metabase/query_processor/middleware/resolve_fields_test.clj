(ns metabase.query-processor.middleware.resolve-fields-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.middleware.resolve-fields :as qp.resolve-fields]
   [metabase.util.malli.fn :as mu.fn]))

(deftest ^:parallel field-ids-test
  (testing "Field IDs in metadata should get picked up correctly"
    (binding [mu.fn/*enforce* false]
      (is (= #{1}
             (#'qp.resolve-fields/field-ids
              {:lib/type :mbql/query
               :database 1
               :stages   [{:lib/type           :mbql.stage/mbql
                           :lib/stage-metadata {:lib/type :metadata/results
                                                :columns  [{:lib/type :metadata/column, :id 1}
                                                           {:lib/type :metadata/column, :id 0}]}
                           :source-table       1}]}))))))
