(ns metabase.query-processor.pipeline-test
  (:require
   [clojure.core.async :as a]
   [clojure.core.async.impl.protocols :as a.impl.protocols]
   [clojure.test :refer :all]
   [metabase.query-processor.pipeline :as qp.pipeline]))

(defn- received
  "The value `chan` delivers within 5 seconds, or nil."
  [chan]
  (first (a/alts!! [chan (a/timeout 5000)])))

(defn- poll-only-chan
  "A channel holding `value` for [[a/poll!]], whose takes that may wait, as a go block's do, never complete.
  It stands for a canceled channel that the background forward has not read yet."
  [value]
  (let [ready (doto (a/promise-chan) (a/>!! value))
        never (a/promise-chan)]
    (reify a.impl.protocols/ReadPort
      (take! [_ handler]
        (a.impl.protocols/take! (if (a.impl.protocols/blockable? handler) never ready) handler)))))

(deftest ^:parallel do-with-own-canceled-chan-test
  (let [outer-chan (a/promise-chan)]
    (binding [qp.pipeline/*canceled-chan* outer-chan]
      (testing "the inner query runs with a channel of its own, and closing it leaves the outer one open"
        ;; Closing the channel is what a query does when it finishes.
        (let [own-chan (qp.pipeline/do-with-own-canceled-chan #(doto qp.pipeline/*canceled-chan* a/close!))]
          (is (some? own-chan))
          (is (not= outer-chan own-chan))
          (is (false? (a.impl.protocols/closed? outer-chan)))))
      (testing "the inner channel is closed once the inner query returns or throws"
        (is (a.impl.protocols/closed? (qp.pipeline/do-with-own-canceled-chan (fn [] qp.pipeline/*canceled-chan*))))
        (let [own-chan (atom nil)]
          (is (thrown? clojure.lang.ExceptionInfo
                       (qp.pipeline/do-with-own-canceled-chan
                        (fn []
                          (reset! own-chan qp.pipeline/*canceled-chan*)
                          (throw (ex-info "boom" {}))))))
          (is (a.impl.protocols/closed? @own-chan))))
      (testing "canceling the outer query cancels the inner one"
        (is (= ::canceled
               (qp.pipeline/do-with-own-canceled-chan
                (fn []
                  (a/>!! outer-chan ::canceled)
                  (received qp.pipeline/*canceled-chan*)))))))
    (testing "an outer query canceled already is seen by the inner one before it starts"
      (is (= ::canceled
             (qp.pipeline/do-with-own-canceled-chan
              (poll-only-chan ::canceled)
              (fn [] (a/poll! qp.pipeline/*canceled-chan*))))))
    (testing "without an outer channel, none is bound"
      (is (nil? (qp.pipeline/do-with-own-canceled-chan (fn [] qp.pipeline/*canceled-chan*)))))
    (testing "a channel passed in cancels the query in place of the bound one"
      (let [request-chan (a/promise-chan)]
        (is (= ::canceled
               (qp.pipeline/do-with-own-canceled-chan
                request-chan
                (fn []
                  (a/>!! request-chan ::canceled)
                  (received qp.pipeline/*canceled-chan*)))))))))
