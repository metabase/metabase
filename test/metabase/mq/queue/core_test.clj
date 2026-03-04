(ns metabase.mq.queue.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.test-util :as mq.tu])
  (:import (clojure.lang ExceptionInfo)
           (java.util.concurrent CyclicBarrier)))

(set! *warn-on-reflection* true)

(deftest ^:parallel e2e-test
  (let [heard-messages (atom [])]
    (mq.tu/with-sync-mq {:queue/test (fn [message]
                                       (swap! heard-messages conj message))}
      (testing "The messages are heard and processed"
        (mq/with-queue :queue/test [q]
          (mq/put q "test message 1")
          (mq/put q "test message 2"))
        (is (= ["test message 1" "test message 2"] @heard-messages))))))

(deftest ^:parallel publish-to-unlistened-queue-test
  (mq.tu/with-sync-mq
    (testing "with-queue on a queue with no listener still succeeds (messages buffer)"
      (mq/with-queue :queue/nonexistent [q]
        (mq/put q "msg"))
      (is (= 1 (q.impl/queue-length :queue/nonexistent))))))

(deftest ^:parallel with-queue-success-test
  (mq.tu/with-sync-mq {:queue/test (fn [_msg] nil)}
    (testing "with-queue publishes buffered messages on success"
      (let [result (mq/with-queue :queue/test [q]
                     (mq/put q "a")
                     (mq/put q "b")
                     :done)]
        (is (= :done result))
        (is (= 0 (q.impl/queue-length :queue/test)))))))

(deftest ^:parallel with-queue-exception-discards-test
  (mq.tu/with-sync-mq {:queue/test (fn [_] nil)}
    (testing "with-queue discards buffered messages on exception"
      (is (thrown? Exception
                   (mq/with-queue :queue/test [q]
                     (mq/put q "should-be-discarded")
                     (throw (ex-info "boom" {})))))
      (is (= 0 (q.impl/queue-length :queue/test))))))

(deftest ^:parallel with-queue-no-listener-test
  (mq.tu/with-sync-mq
    (testing "with-queue on queue with no listener buffers messages"
      (mq/with-queue :queue/nonexistent [q]
        (mq/put q "msg"))
      (is (= 1 (q.impl/queue-length :queue/nonexistent))))))

(deftest double-listen-throws-test
  (mq.tu/with-sync-mq {:queue/test (fn [_] nil)}
    (testing "Registering a second listener on the same queue throws"
      (is (thrown-with-msg? ExceptionInfo #"Queue listener already defined"
                            (mq/listen! :queue/test (fn [_] nil)))))))

(deftest concurrent-listen-throws-test
  (mq.tu/with-sync-mq
    (let [queue-name :queue/test
          n          10
          barrier    (CyclicBarrier. n)
          results    (atom [])]
      (testing "Concurrent listen! calls: exactly one succeeds, rest throw"
        (let [threads (mapv (fn [_]
                              (let [f (bound-fn []
                                        (.await barrier)
                                        (try
                                          (mq/listen! queue-name (fn [_] nil))
                                          (swap! results conj :ok)
                                          (catch ExceptionInfo _
                                            (swap! results conj :error))))]
                                (Thread. ^Runnable f)))
                            (range n))]
          (run! (fn [^Thread t] (.start t)) threads)
          (run! (fn [^Thread t] (.join t 5000)) threads)
          (is (= 1 (count (filter #{:ok} @results))))
          (is (= (dec n) (count (filter #{:error} @results))))))
      (mq/unlisten! queue-name))))

(deftest ^:parallel fifo-ordering-test
  (let [received (atom [])]
    (mq.tu/with-sync-mq {:queue/test (fn [message]
                                       (swap! received conj message))}
      (doseq [i (range 10)]
        (mq/with-queue :queue/test [q]
          (mq/put q i)))
      (testing "All messages are delivered in order"
        (is (= (range 10) @received))))))
