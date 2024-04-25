(ns metabase.actions.execution-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.execution :as actions.execution]
   [metabase.models.action :as action]
   [metabase.query-processor.middleware.process-userland-query-test :as process-userland-query-test]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest fetch-values-save-execution-info-test
  (testing "fetch values for implicit action will save an execution info"
    (mt/test-helpers-set-global-values!
      (mt/with-actions-enabled
        (let [dataset-query (mt/mbql-query venues {:fields [$id $name]})
              query (assoc
                     dataset-query
                     :parameters [{:target [:dimension
                                            (-> dataset-query
                                                :query
                                                :fields
                                                first)]
                                   :type "id"
                                   :value [1]}]
                     :constraints nil
                     :middleware nil
                     :cache-strategy nil)]
          (mt/with-actions [_                   {:type :model :dataset_query dataset-query}
                            {:keys [action-id]} {:type :implicit :kind "row/update"}]
            (process-userland-query-test/with-query-execution [qe query]
              (is (= {"id" 1 "name" "Red Medicine"}
                     (actions.execution/fetch-values (action/select-action :id action-id) {"id" 1})))
              (is (=? {:action_id action-id}
                      (qe))))))))))
