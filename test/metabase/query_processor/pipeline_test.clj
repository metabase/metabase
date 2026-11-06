(ns metabase.query-processor.pipeline-test
  (:require
   [clojure.core.async :as a]
   ;; Public core.async can neither tell whether a channel is closed nor hold back a go block's take.
   [clojure.core.async.impl.protocols :as a.impl.protocols]
   [clojure.test :refer :all]
   [metabase.query-processor.pipeline :as qp.pipeline]))

(defn- received
  "The value `chan` delivers within 5 seconds, or nil."
  [chan]
  (first (a/alts!! [chan (a/timeout 5000)])))

(defn- poll-only-chan!
  "A channel that gives `value` to [[a/poll!]] but never to a go block waiting on it.
  It stands in for an outer channel canceled before [[qp.pipeline/do-with-own-canceled-chan]] forwards its value."
  [value]
  (let [ready (doto (a/promise-chan) (a/>!! value))
        never (a/promise-chan)]
    (reify a.impl.protocols/ReadPort
      (take! [_ handler]
        (a.impl.protocols/take! (if (a.impl.protocols/blockable? handler) never ready) handler)))))

(deftest ^:parallel do-with-own-canceled-chan-own-channel-test
  (testing "the inner query runs with a channel of its own, and closing it leaves the outer query cancelable"
    (let [outer-chan (a/promise-chan)]
      (binding [qp.pipeline/*canceled-chan* outer-chan]
        ;; Closing the channel is what a query does when it finishes.
        (is (not= outer-chan (qp.pipeline/do-with-own-canceled-chan #(doto qp.pipeline/*canceled-chan* a/close!))))
        (a/>!! outer-chan ::canceled)
        (is (= ::canceled (a/poll! outer-chan)))))))

(deftest ^:parallel do-with-own-canceled-chan-closes-own-channel-test
  (testing "the inner channel is closed once the inner query returns or throws"
    (let [outer-chan (a/promise-chan)
          own-chan   (atom nil)]
      (is (a.impl.protocols/closed?
           (qp.pipeline/do-with-own-canceled-chan outer-chan (fn [] qp.pipeline/*canceled-chan*))))
      (is (thrown? clojure.lang.ExceptionInfo
                   (qp.pipeline/do-with-own-canceled-chan
                    outer-chan
                    (fn []
                      (reset! own-chan qp.pipeline/*canceled-chan*)
                      (throw (ex-info "boom" {}))))))
      (is (a.impl.protocols/closed? @own-chan)))))

(deftest ^:parallel do-with-own-canceled-chan-forwards-cancel-test
  (testing "canceling the outer query cancels the inner one"
    (let [outer-chan (a/promise-chan)]
      (binding [qp.pipeline/*canceled-chan* outer-chan]
        (is (= ::canceled
               (qp.pipeline/do-with-own-canceled-chan
                (fn []
                  (a/>!! outer-chan ::canceled)
                  (received qp.pipeline/*canceled-chan*)))))))))

(deftest ^:parallel do-with-own-canceled-chan-without-outer-channel-test
  (testing "without an outer channel, none is bound"
    (is (nil? (qp.pipeline/do-with-own-canceled-chan (fn [] qp.pipeline/*canceled-chan*))))))

(deftest ^:parallel do-with-own-canceled-chan-channel-passed-in-test
  (testing "a channel passed in cancels the query in place of the bound one"
    (let [request-chan (a/promise-chan)]
      (binding [qp.pipeline/*canceled-chan* (a/promise-chan)]
        (is (= ::canceled
               (qp.pipeline/do-with-own-canceled-chan
                request-chan
                (fn []
                  (a/>!! request-chan ::canceled)
                  (received qp.pipeline/*canceled-chan*)))))))))

(deftest do-with-own-canceled-chan-already-canceled-test
  (testing "the inner query sees a cancel that arrived before it started"
    (is (= ::canceled
           (qp.pipeline/do-with-own-canceled-chan
            (poll-only-chan! ::canceled)
            (fn [] (a/poll! qp.pipeline/*canceled-chan*)))))))
