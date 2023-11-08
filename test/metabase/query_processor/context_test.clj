(ns metabase.query-processor.context-test
  "There are additional related tests in [[metabase.query-processor.middleware.process-userland-query-test]]."
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.async.util :as async.u]
   [metabase.query-processor :as qp]
   [metabase.query-processor.context :as qp.context]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- process-query* [context]
  (qp.context/runf context {} (constantly conj)))

(defn- async-context-with-timeout [timeout]
  (qp.context/async-context
   {:timeout  timeout
    :executef (fn [_context _driver _query respond]
                (Thread/sleep 500)
                (respond {} [[1]]))}))

(deftest ^:parallel async-cancelation-test
  (testing "Example of canceling a query early before results are returned."
    (testing "out-chan closed before query returns a result"
      (doseq [^Long delay-before-closing-out-chan-ms [0 50]]
        (testing (format "Wait %d ms before closing out-chan" delay-before-closing-out-chan-ms)
          (let [context       (async-context-with-timeout 100)
                out-chan      (process-query* context)
                canceled-chan (qp.context/canceled-chan context)]
            (is (async.u/promise-chan? out-chan))
            (when (pos? delay-before-closing-out-chan-ms)
              (Thread/sleep delay-before-closing-out-chan-ms))
            (a/close! out-chan)
            (is (= ::qp.context/cancel
                   (first (a/alts!! [canceled-chan (a/timeout 500)]))))))))))

(deftest ^:parallel async-cancelation-test-2
  (testing "With a ridiculously short timeout (1 ms) we should still get a result"
    (let [context       (async-context-with-timeout 1)
          out-chan      (process-query* context)
          [result port] (a/alts!! [out-chan (a/timeout 1000)])
          result        (if (= port out-chan)
                          result
                          ::timed-out)]
      (is (async.u/promise-chan? out-chan))
      (is (instance? clojure.lang.ExceptionInfo result))
      (is (=? #"Timed out after 1000\.0 µs\."
              (ex-message result))))))

(deftest ^:parallel async-cancelation-test-3
  (testing "Make sure the future running on another thread gets canceled"
    (let [status   (atom ::not-started)
          context  (qp.context/async-context
                    {:timeout  1000
                     :executef (fn [_context _driver _query respond]
                                 (try
                                   (reset! status ::started)
                                   (Thread/sleep 500)
                                   (reset! status ::finished)
                                   (respond {} [[1]])
                                   (catch InterruptedException e
                                     (reset! status ::canceled)
                                     (throw e))))})
          out-chan (qp/process-query
                    (mt/mbql-query venues)
                    context)]
      (is (async.u/promise-chan? out-chan))
      (letfn [(await-status [expected-status]
                (loop [remaining-ms 200]
                  (if (or (= @status expected-status)
                          (not (pos? remaining-ms)))
                    @status
                    (do
                      (Thread/sleep 5)
                      (recur (- remaining-ms 5))))))]

        (is (= ::started
               (await-status ::started)))
        (a/close! out-chan)
        (is (= ::canceled
               (await-status ::canceled)))))))

(deftest ^:parallel exceptions-test
  (testing "Test a query that throws an Exception."
    (is (thrown?
         Throwable
         (qp/process-query
          {:database (mt/id)
           :type     :native
           :native   {:query "SELECT asdasdasd;"}})))))

(deftest ^:parallel exceptions-test-2
  (testing "Test when an Exception is thrown in the reducing fn."
    (is (thrown-with-msg?
         Throwable
         #"Cannot open file"
         (qp/process-query
          {:database (mt/id)
           :type     :query
           :query    {:source-table (mt/id :venues), :limit 20}}
          (qp.context/sync-context
           {:reducef (fn [& _]
                       (throw (Exception. "Cannot open file")))}))))))
