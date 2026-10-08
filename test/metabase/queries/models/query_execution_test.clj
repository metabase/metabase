(ns metabase.queries.models.query-execution-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- query-execution-row [context]
  {:hash         (byte-array 32)
   :started_at   (t/zoned-date-time)
   :running_time 0
   :result_rows  0
   :native       false
   :executor_id  (mt/user->id :rasta)
   :context      context})

(deftest insert-validates-context-test
  (testing "the action contexts are accepted"
    (doseq [context [:action :action-execute :public-action-execute]]
      (testing context
        (mt/with-model-cleanup [:model/QueryExecution]
          (let [id (t2/insert-returning-pk! :model/QueryExecution (query-execution-row context))]
            (is (= context (t2/select-one-fn :context :model/QueryExecution :id id))))))))
  (testing "an unknown context is still rejected"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid query execution context"
         (t2/insert! :model/QueryExecution (query-execution-row :not-a-real-context))))))
