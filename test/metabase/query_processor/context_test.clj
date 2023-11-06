(ns metabase.query-processor.context-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.async.util :as async.u]
   [metabase.query-processor :as qp]
   [metabase.query-processor.context :as qp.context]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;; NOCOMMIT FIXME
(deftest ^:parallel cancelation-test
  #_(testing "Example of canceling a query early before results are returned."
    (letfn [(qp [_query rff context]
              (let [metadata {}
                    rows     []
                    futur    (future (qp.context/reducef rff context metadata rows))]
                (a/go
                  (when (a/<! (qp.context/canceled-chan context))
                    (future-cancel futur)))
                (qp.context/out-chan context)))
            (process-query [context]
              (qp {} (constantly conj) context))
            (async-context-with-timeout [timeout]
              (qp.context/async-context
               {:timeout  timeout
                :executef (fn [_driver _query _context respond]
                            (println "<HERE>")
                            (Thread/sleep 500)
                            (respond {} [[1]]))}))]
      (testing "out-chan closed before query returns a result"
        (doseq [delay-before-closing-out-chan-ms [0 50]]
          (testing (format "Wait %d ms before closing out-chan" delay-before-closing-out-chan-ms)
            (let [context       (async-context-with-timeout 100)
                  out-chan      (process-query context)
                  canceled-chan (qp.context/canceled-chan context)]
              (is (async.u/promise-chan? out-chan))
              (when (pos? delay-before-closing-out-chan-ms)
                (Thread/sleep delay-before-closing-out-chan-ms))
              (a/close! out-chan)
              (is (= ::qp.reducible/cancel
                     (first (a/alts!! [canceled-chan (a/timeout 500)]))))))))
      (testing "With a ridiculously short timeout (1 ms) we should still get a result"
        (let [context  (async-context-with-timeout 1)
              out-chan (process-query context)
              result   (first (a/alts!! [out-chan (a/timeout 1000)]))]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Timed out after 1000\.0 µs\."
               (if (instance? Throwable result)
                 (throw result)
                 result))))))))

(deftest ^:parallel exceptions-test
  (testing "Test a query that throws an Exception."
    (is (thrown?
         Throwable
         (qp/process-query
          {:database (mt/id)
           :type     :native
           :native   {:query "SELECT asdasdasd;"}}))))
  (testing "Test when an Exception is thrown in the reducing fn."
    (is (thrown-with-msg?
         Throwable #"Cannot open file"
         (qp/process-query
          {:database (mt/id)
           :type     :query
           :query    {:source-table (mt/id :venues), :limit 20}}
          {:reducef (fn [& _]
                      (throw (Exception. "Cannot open file")))})))))
