(ns metabase.query-processor.pipeline-test
  (:require
   [clojure.core.async :as a]
   [clojure.core.async.impl.protocols :as a.impl.protocols]
   [clojure.test :refer :all]
   [metabase.query-processor.pipeline :as qp.pipeline]))

(deftest ^:parallel do-with-own-canceled-chan-test
  (let [outer-chan (a/promise-chan)]
    (binding [qp.pipeline/*canceled-chan* outer-chan]
      (testing "the inner query runs with a channel of its own, and closing it leaves the outer one open"
        (is (true? (qp.pipeline/do-with-own-canceled-chan
                    (fn []
                      (let [own-chan qp.pipeline/*canceled-chan*]
                        ;; As a query does when it finishes.
                        (a/close! own-chan)
                        (not= outer-chan own-chan))))))
        (is (false? (a.impl.protocols/closed? outer-chan))))
      (testing "canceling the outer query cancels the inner one"
        (is (= ::canceled
               (qp.pipeline/do-with-own-canceled-chan
                (fn []
                  (a/>!! outer-chan ::canceled)
                  (first (a/alts!! [qp.pipeline/*canceled-chan* (a/timeout 5000)]))))))))
    (testing "without an outer channel, none is bound"
      (is (nil? (qp.pipeline/do-with-own-canceled-chan (fn [] qp.pipeline/*canceled-chan*)))))
    (testing "a channel passed in cancels the query in place of the bound one"
      (let [request-chan (a/promise-chan)]
        (is (= ::canceled
               (qp.pipeline/do-with-own-canceled-chan
                request-chan
                (fn []
                  (a/>!! request-chan ::canceled)
                  (first (a/alts!! [qp.pipeline/*canceled-chan* (a/timeout 5000)]))))))))))
