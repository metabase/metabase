(ns metabase.util.queue-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.queue :as queue]
   [metabase.util.queue.protocols :as proto])
  (:import (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

(def ^:private timeout-ms 5000)

(deftest ^:synchronized take-batch-test
  (let [q           (#'queue/delay-queue)
        n           5
        first-delay 300
        extra-delay 200
        buffer      50
        msg-delay   #(+ first-delay (* extra-delay %))]
    (dotimes [i n]
      (#'queue/-put-with-delay! q (msg-delay i) i))
    ;; queue an outlier
    (#'queue/-put-with-delay! q (msg-delay 10) 10)
    (let [started-roughly (u/start-timer)
          since-start     #(u/since-ms started-roughly)
          time-until-nth  #(max 0 (+ buffer (- (msg-delay %) (since-start))))
          take-batch-wait-ms (time-until-nth 10)]
      (testing "Polling for a short initial time will return before any messages are ready, regardless the max-next-ms"
        (is (nil? (#'queue/take-batch! q 10 100 5000))))
      (testing "With a long max-first-ms and max-next-ms, we limit by the max-batch-messages"
        (is (= [0 1 2] (#'queue/take-batch! q take-batch-wait-ms 3 (time-until-nth 3)))))
      (testing "Some time later we can read an additional batch of messages without any polling delay"
        (Thread/sleep ^long (time-until-nth n))
        ;; Wait until all items have matured
        (is (= [3 4] (#'queue/take-batch! q 0 5 0))))
      (testing "But the outlier is not yet ready"
        (is (nil? (#'queue/take-batch! q 0 5 0))))
      (testing "Eventually the outlier is ready"
        (is (= [10] (#'queue/take-batch! q take-batch-wait-ms 5 50))))
      (testing "Afterwards the queue is empty"
        (is (nil? (#'queue/take-batch! q take-batch-wait-ms 5 0)))))))

(deftest non-delayed-take-batch-test
  (testing "take-batch works with any blocking queue"
    (let [q (LinkedBlockingQueue.)
          n 5]
      (dotimes [i n]
        (.offer q i))
      (is (= [0 1 2] (#'queue/take-batch! q 500 3 10)))
      (is (= [3 4] (#'queue/take-batch! q 500 3 10))))))

(defn with-stopped-queue-fn [queue f]
  (try
    (proto/-stop queue)
    ;; give the queue some time to finish processing
    (when-not (proto/-await-termination queue 1500)
      (throw (ex-info "Queue did not terminate" {})))
    (f)
    (finally
      (proto/-start queue))))

(defmacro with-stopped-queue [queue & body]
  `(with-stopped-queue-fn ~queue (fn [] ~@body)))

(defn with-queue-fn [queue body-fn]
  (try
    (proto/-start queue)
    (body-fn)
    (finally
      (proto/-stop! queue))))

(defmacro with-queue [queue & body]
  `(with-queue-fn ~queue (fn [] ~@body)))

(deftest listener-handler-test
  (testing "Standard behavior with a handler"
    (let [listener-name "test-listener"
          items-handled (atom 0)
          last-batch (atom nil)
          queue (queue/create-delay-queue-listener listener-name
                                                   (fn [batch] (swap! items-handled + (count batch)) (reset! last-batch batch))
                                                   {:max-next-ms 5
                                                    :register? false})]
      (with-queue queue
        (queue/put-with-delay! queue 0 "a")
        (with-stopped-queue queue
          (is (= 1 @items-handled))
          (is (= ["a"] @last-batch)))
        (queue/put-with-delay! queue 0 "b")
        (queue/put-with-delay! queue 0 "c")
        (queue/put-with-delay! queue 0 "d")
        (with-stopped-queue queue
          (is (= 4 @items-handled))
          (is (some #{"d"} @last-batch)))))))

(deftest result-listener-test
  (testing "When result and error handlers are defined, they are called correctly"
    (let [listener-name "test-result-listener"
          result-count  (atom 0)
          error-count   (atom 0)
          last-error    (atom nil)
          queue         (queue/create-delay-queue-listener listener-name
                                                           (fn [batch]
                                                             (if (some #{"err"} batch)
                                                               (throw (ex-info "Test Error" {:batch batch}))
                                                               (count batch)))
                                                           {:success-handler (fn [_ql result duration name]
                                                                               (is (= listener-name name))
                                                                               (is (< 0 duration))
                                                                               (swap! result-count + result))
                                                            :error-handler   (fn [_ql e _] (swap! error-count inc) (reset! last-error e))
                                                            :max-next-ms     5
                                                            :register?       false})]
      (with-queue queue
        (queue/put-with-delay! queue 0 "a")
        (with-stopped-queue queue
          (is (= 0 @error-count))
          (is (= 1 @result-count)))
        (queue/put-with-delay! queue 0 "err")
        (with-stopped-queue queue
          (is (= 1 @error-count))
          (is (= 1 @result-count))
          (is (= "Test Error" (.getMessage ^Exception @last-error))))))))

(deftest multithreaded-listener-test
  (testing "Test behavior with a multithreaded listener"
    (let [listener-name "test-multithreaded-listenerr"
          batches-handled (atom 0)
          handlers-used (atom #{})
          queue (queue/create-delay-queue-listener listener-name
                                                   (fn [batch] (is (<= (count batch) 10)) (count batch))
                                                   {:success-handler    (fn [_ result _ name] (swap! batches-handled + result) (swap! handlers-used conj name))
                                                    :pool-size          3
                                                    :max-batch-messages 10
                                                    :max-next-ms        5
                                                    :register?          false})]

      (with-queue queue
        (dotimes [i 100]
          (queue/put-with-delay! queue 100 i))
        (with-stopped-queue queue
          (is (= 100 @batches-handled))
          (is (contains? @handlers-used listener-name)))))))

(deftest can-put-to-unstarted-queues
  (let [batches (atom #{})
        queue (queue/create-delay-queue-listener (str (random-uuid))
                                                 (fn [batch] (swap! batches into (set batch)))
                                                 {:register? false})]
    ;; not using the `with-queue` helper here bc we don't want to start it
    (try
      (testing "Before starting, we can `put!` to the queue"
        (queue/put! queue :a)
        (queue/put! queue :b)
        (queue/put! queue :c)
        (testing "but nothing gets processed"
          (is (= #{} @batches)))
        (testing "once we start, we process the queued items"
          (proto/-start queue)
          (with-stopped-queue queue
            (is (= #{:a :b :c} @batches)))))
      (finally (proto/-stop queue)))))

(deftest slow-handlers-test
  (let [batches (atom #{})
        waiter (promise)
        queue (queue/create-delay-queue-listener (str (random-uuid))
                                                 (fn [batch]
                                                   (deref waiter)
                                                   (swap! batches into (set batch)))
                                                 {:register? false})]
    (with-queue queue
      (queue/put! queue :a)
      (queue/put-with-delay! queue 100 :b)
      ;; begin a graceful shutdown
      (proto/-stop queue)
      (deliver waiter :a-value)
      (with-stopped-queue queue
        (is (= #{:a :b} @batches))))))

(deftest can-forcibly-shutdown-test
  (let [batches (atom #{})
        waiter (promise)
        queue (queue/create-delay-queue-listener (str (random-uuid))
                                                 (fn [batch]
                                                   (deref waiter)
                                                   (swap! batches into (set batch)))
                                                 {:register? false})]
    (with-queue queue
      (queue/put! queue :a)
      (queue/put-with-delay! queue 100 :b)
      ;; force immediate shutdown
      (proto/-stop! queue)
      (deliver waiter :a-value)
      (with-stopped-queue queue
        (is (= #{} @batches))))))
