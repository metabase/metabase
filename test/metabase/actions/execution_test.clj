(ns metabase.actions.execution-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.execution :as actions.execution]
   [metabase.actions.models :as action]
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
                     :parameters [{:id     "metabase.actions.execution/prefetch-parameters-pk"
                                   :target [:dimension
                                            (-> dataset-query
                                                :query
                                                :fields
                                                first)]
                                   :type   :number/=
                                   :value  [1]}]
                     :constraints nil
                     :middleware nil
                     :cache-strategy nil)]
          (mt/with-actions [_                   {:type :model :dataset_query dataset-query}
                            {:keys [action-id]} {:type :implicit :kind "row/update"}]
            (process-userland-query-test/with-query-execution! [qe query]
              (is (= {"id" 1 "name" "Red Medicine"}
                     (actions.execution/fetch-values (action/select-action :id action-id) {"id" 1})))
              (is (=? {:action_id action-id}
                      (qe))))))))))

(deftest implicit-action-prefetch-parameter-type-test
  (testing "implicit action prefetch uses explicit parameter type instead of :id (QUE2-326)"
    (mt/test-helpers-set-global-values!
      (mt/with-actions-enabled
        (mt/with-actions [_                   {:type :model :dataset_query (mt/mbql-query venues {:fields [$id $name]})}
                          {:keys [action-id]} {:type :implicit :kind "row/update"}]
          (let [action                        (action/select-action :id action-id)
                build-implicit-query          #'actions.execution/build-implicit-query
                {:keys [prefetch-parameters]} (build-implicit-query action :model.row/update {"id" 1})]
            (testing "numeric PK → :number/="
              (is (= :number/=
                     (:type (first prefetch-parameters)))))))))))
