(ns metabase.api.logs-test
  "Tests for /api/logs endpoints"
  (:require
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.models.query-execution :refer [QueryExecution]]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]))

(def ^:private now (t/offset-date-time))

(def ^:private query-execution-defaults
  {:hash         (qp.util/query-hash {})
   :result_rows  0
   :running_time 0
   :native       true
   :started_at   now
   :context      :ad-hoc})

(deftest fetch-logs-test
  (testing "GET /api/logs/query_execution/:days"
    (mt/with-temp* [QueryExecution [qe-a (merge query-execution-defaults
                                                {:executor_id (mt/user->id :crowberto)
                                                 :started_at  (t/minus now (t/days 2))})]
                    QueryExecution [_qe-b (merge query-execution-defaults
                                                {:executor_id (mt/user->id :crowberto)
                                                 :started_at  (t/minus now (t/days 32))})]]
      (testing "Only Query Executions within `:days` are returned."
        (is (= [(select-keys qe-a [:started_at :id])]
               (->> (mt/user-http-request :crowberto :get 200 "logs/query_execution/30")
                    (filter #(#{(mt/user->id :crowberto)} (:executor_id %)))
                    (map #(select-keys % [:started_at :id])))))))))
