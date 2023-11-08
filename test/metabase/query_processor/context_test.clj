(ns metabase.query-processor.context-test
  "There are additional related tests in [[metabase.query-processor.middleware.process-userland-query-test]]."
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.async.util :as async.u]
   [metabase.query-processor :as qp]
   [metabase.query-processor.context :as qp.context]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;; (deftest ^:parallel async-cancelation-test
;;   (mt/with-open-channels [canceled-chan (a/promise-chan)]
;;     (future
;;       (let [status   (atom ::not-started)
;;             query    {}
;;             metadata {}
;;             rows     []
;;             context  (qp.context/async-context)
;;             qp       (qp.context/runf)
;;             out-chan (process-userland-query
;;                       {}
;;                       (qp.context/async-context
;;                        {:canceled-chan canceled-chan
;;                         :reducef       (fn [_rff context _metadata rows]
;;                                          (reset! status ::started)
;;                                          (Thread/sleep 1000)
;;                                          (reset! status ::done)
;;                                          (qp.context/reducedf rows context))}))]
;;         (is (async.u/promise-chan? out-chan))
;;         (is (not= ::done
;;                   @status))
;;         (Thread/sleep 100)
;;         (a/close! out-chan)))
;;     (testing "canceled-chan should get get a :cancel message"
;;       (let [[val port] (a/alts!! [canceled-chan (a/timeout 500)])]
;;         (is (= 'canceled-chan
;;                (if (= port canceled-chan) 'canceled-chan 'timeout))
;;             "port")
;;         (is (= ::qp.context/cancel
;;                val)
;;             "val")))))

(defn- process-query* [context]
  (qp.context/runf {} (constantly conj) context))

(defn- async-context-with-timeout [timeout]
  (qp.context/async-context
   {:timeout  timeout
    :executef (fn [_driver _query _context respond]
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
