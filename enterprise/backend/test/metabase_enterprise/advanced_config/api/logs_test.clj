(ns ^:mb/once metabase-enterprise.advanced-config.api.logs-test
  "Tests for /api/ee/logs endpoints"
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.advanced-config.api.logs :as ee.api.logs]
   [metabase.models.query-execution :refer [QueryExecution]]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]))

(def ^:private now #t "2023-02-28T10:10:10.101010Z")

(def ^:private query-execution-defaults
  {:hash         (qp.util/query-hash {})
   :result_rows  0
   :running_time 0
   :native       true
   :started_at   now
   :context      :ad-hoc})

(deftest fetch-logs-test
  (testing "GET /api/logs/query_execution/:yyyy-mm"
    (let [test-user :crowberto
          user-id   (mt/user->id test-user)]
      ;; QueryExecution is an unbounded mega table and query it could result in a full table scan :( (See: #29103)
      ;; Run the test in an empty database to make querying less intense.
      (mt/with-empty-h2-app-db
        (mt/with-temp [QueryExecution qe-a (merge query-execution-defaults {}
                                                  {:executor_id user-id
                                                   :started_at  (t/minus now (t/days 2))})
                       QueryExecution qe-b (merge query-execution-defaults {}
                                                  {:executor_id user-id
                                                   :started_at  (t/minus now (t/days 32))})]
          (mt/with-premium-features #{:audit-app}
            (testing "Query Executions within `:yyyy-mm` are returned."
              (is (= [(select-keys qe-a [:started_at :id])]
                     ;; we're calling the function directly instead of calling the API
                     ;; because we want the test to run against the empty h2 DB we bound above
                     ;; Until we figure out how to completely re-bind a database for API calls
                     ;; this should be enough
                     (->> (ee.api.logs/query-execution-logs 2023 2)
                          (filter #(#{user-id} (:executor_id %)))
                          (filter #((set (map :id [qe-a qe-b])) (:id %)))
                          (map #(select-keys % [:started_at :id]))))))))))

    (testing "permission tests"
      (testing "require admins"
        (mt/with-premium-features #{:audit-app}
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "ee/logs/query_execution/2023-02")))
          (is (= []
                 (mt/user-http-request :crowberto :get 200 "ee/logs/query_execution/2023-02")))))
      (testing "only works when `:audit-app` feature is available."
        (mt/with-premium-features #{}
          (is (= "Audit app is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                 (mt/user-http-request :crowberto :get 402 "ee/logs/query_execution/2023-02"))))))))
