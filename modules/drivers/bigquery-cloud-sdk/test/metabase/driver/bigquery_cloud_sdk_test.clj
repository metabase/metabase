(ns metabase.driver.bigquery-cloud-sdk-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.query-processor :as qp]
   [metabase.test :as mt])
  (:import
   (com.google.cloud.bigquery BigQuery)))

(set! *warn-on-reflection* true)

(deftest not-retry-cancellation-exception-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [fake-execute-called (atom false)
          orig-fn        @#'bigquery/execute-bigquery]
      (testing "Should not retry query on cancellation"
        (with-redefs [bigquery/execute-bigquery (fn [^BigQuery client ^String sql parameters _ _]
                                                  ;; We only want to simulate exception on the query that we're testing and not on possible db setup queries
                                                  (if (and (re-find #"notRetryCancellationExceptionTest" sql) (not @fake-execute-called))
                                                    (do (reset! fake-execute-called true)
                                                        ;; Simulate a cancellation happening
                                                        (throw (ex-info "Query cancelled" {::bigquery/cancelled? true})))
                                                    (orig-fn client sql parameters nil nil)))]
          (try
            (qp/process-query {:native {:query "SELECT CURRENT_TIMESTAMP() AS notRetryCancellationExceptionTest"} :database (mt/id)
                               :type     :native})
            ;; If no exception is thrown, then the test should fail
            (is false "Query should have failed")
            (catch clojure.lang.ExceptionInfo e
              ;; Verify exception as expected
              (is (= "Query cancelled" (.getMessage e)))
              ;; make sure that the fake exception was thrown
              (is (true? @fake-execute-called)))))))))

(deftest query-cancel-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "BigQuery queries can be canceled successfully"
      (mt/with-open-channels [canceled-chan (a/promise-chan)]
        (binding [bigquery/*page-size*     1000 ; set a relatively small pageSize
                  bigquery/*page-callback* (fn []
                                             (println "*page-callback* called, sending cancel message")
                                             (a/>!! canceled-chan ::cancel))]
          (try
            ;; there's a race. Some data might be processed, and if so we get the partial result
            (mt/dataset test-data
              (println "Running query")
              (let [rows      (mt/rows (mt/process-query (mt/query orders) {:canceled-chan canceled-chan}))
                    row-count (count rows)]
                (println "Loaded %d rows before BigQuery query was canceled" row-count)
                (testing "Somewhere between 0 and the size of the orders table rows were loaded before cancellation"
                  (is (< 0 row-count 10000)))))
            (catch clojure.lang.ExceptionInfo e
              (is (= (ex-message e) "Query cancelled")))))))))
