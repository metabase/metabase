(ns metabase-enterprise.advanced-config.api.logs-test
  "Tests for /api/ee/logs endpoints"
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
    (let [test-user :crowberto
          user-id   (mt/user->id test-user)]
      (mt/with-temp* [QueryExecution [qe-a (merge query-execution-defaults
                                                  {:executor_id user-id
                                                   :started_at  (t/minus now (t/days 2))})]
                      QueryExecution [_qe-b (merge query-execution-defaults
                                                   {:executor_id user-id
                                                    :started_at  (t/minus now (t/days 32))})]]
        (is (= [(select-keys qe-a [:started_at :id])]
               (->> (mt/user-http-request test-user :get 200 "ee/logs/query_execution/30")
                    (filter #(#{user-id} (:executor_id %)))
                    (map #(select-keys % [:started_at :id]))))
            "Only Query Executions within `:days` are returned.")))))
