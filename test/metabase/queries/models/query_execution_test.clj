(ns metabase.queries.models.query-execution-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.queries.models.query-execution :as query-execution]
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

(deftest insert-stores-action-contexts-test
  (testing "the action contexts are accepted"
    (doseq [context [:action :action-execute :public-action-execute]]
      (testing context
        (mt/with-model-cleanup [:model/QueryExecution]
          (let [id (t2/insert-returning-pk! :model/QueryExecution (query-execution-row context))]
            (is (= context (t2/select-one-fn :context :model/QueryExecution :id id)))))))))

(deftest create-query-executions!-rows-with-different-columns-test
  (testing "QueryExecutions given different sets of columns are all stored, and their ids come back in order"
    (mt/with-model-cleanup [:model/QueryExecution]
      (let [ids (query-execution/create-query-executions! [(query-execution-row :ad-hoc)
                                                           (assoc (query-execution-row :ad-hoc) :error "boom")
                                                           (query-execution-row :question)])]
        (is (= 3 (count ids)))
        (is (=? [{:context :ad-hoc :error nil}
                 {:context :ad-hoc :error "boom"}
                 {:context :question :error nil}]
                (map #(t2/select-one :model/QueryExecution :id %) ids)))))))
