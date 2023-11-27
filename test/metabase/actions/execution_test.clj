(ns metabase.actions.execution-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.execution :as actions.execution]
   [metabase.models.action :as action]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest fetch-values-save-execution-info-test
  (testing "fetch values for implicit action will save an execution info"
    (mt/with-ensure-with-temp-no-transaction!
      (mt/with-actions-enabled
        (mt/with-actions [_                   {:dataset true :dataset_query (mt/mbql-query venues {:fields [$id $name]})}
                          {:keys [action-id]} {:type :implicit :kind "row/update"}]
          (is (= {"id" 1 "name" "Red Medicine"}
                 (actions.execution/fetch-values (action/select-action :id action-id) {"id" 1})))
          ;; the query execution is saved async, so we need to sleep a bit
          (Thread/sleep 200)
          (is (true? (t2/exists? :model/QueryExecution :action_id action-id :context :action))))))))
