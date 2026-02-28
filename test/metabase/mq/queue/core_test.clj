(ns metabase.mq.queue.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.queue.test-util :as qt])
  (:import (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest ^:parallel e2e-test
  (qt/with-memory-queue
    (let [heard-messages (atom [])
          queue-name (keyword "queue" (str "core-e2e-test-" (gensym)))]
      (mq/listen! queue-name (fn [{:keys [message]}]
                               (swap! heard-messages conj message)
                               (when (= "error!" message)
                                 (throw (ex-info "Message Error" {:message message})))))

      (testing "The messages are heard and processed"
        (mq/with-queue queue-name [q]
          (mq/put q "test message 1")
          (mq/put q "test message 2"))
        (Thread/sleep 200)

        (is (= ["test message 1" "test message 2"] @heard-messages)))

      (testing "The error messages are heard and retried up to max failures"
        (mq/with-queue queue-name [q]
          (mq/put q "error!"))
        (Thread/sleep 1000)

        (is (= (into ["test message 1" "test message 2"] (repeat 5 "error!")) @heard-messages)))

      (mq/stop-listening! queue-name))))

(deftest ^:parallel publish-to-undefined-queue-test
  (qt/with-memory-queue
    (testing "with-queue on an undefined queue throws"
      (is (thrown-with-msg? ExceptionInfo #"Queue not defined"
                            (mq/with-queue :queue/nonexistent [q]
                              (mq/put q "msg")))))))

(deftest ^:parallel with-queue-success-test
  (qt/with-memory-queue
    (let [queue-name (keyword "queue" (str "wq-success-" (gensym)))]
      (mq/listen! queue-name (fn [_msg] nil))

      (testing "with-queue publishes buffered messages on success"
        (let [result (mq/with-queue queue-name [q]
                       (mq/put q "a")
                       (mq/put q "b")
                       :done)]
          (is (= :done result))
          (Thread/sleep 200)
          (is (= 0 (mq/queue-length queue-name)))))

      (mq/stop-listening! queue-name))))

(deftest ^:parallel with-queue-exception-discards-test
  (qt/with-memory-queue
    (let [queue-name (keyword "queue" (str "wq-error-" (gensym)))]
      (mq/listen! queue-name (fn [_] nil))

      (testing "with-queue discards buffered messages on exception"
        (is (thrown? Exception
                     (mq/with-queue queue-name [q]
                       (mq/put q "should-be-discarded")
                       (throw (ex-info "boom" {})))))
        (is (= 0 (mq/queue-length queue-name)))))))

(deftest ^:parallel with-queue-undefined-queue-test
  (qt/with-memory-queue
    (testing "with-queue on undefined queue throws before body executes"
      (is (thrown-with-msg? ExceptionInfo #"Queue not defined"
                            (mq/with-queue :queue/nonexistent [q]
                              (mq/put q "msg")))))))

(deftest ^:parallel double-listen-throws-test
  (qt/with-memory-queue
    (let [queue-name (keyword "queue" (str "double-listen-" (gensym)))]
      (mq/listen! queue-name (fn [_] nil))

      (testing "Registering a second handler on the same queue throws"
        (is (thrown-with-msg? ExceptionInfo #"Queue handler already defined"
                              (mq/listen! queue-name (fn [_] nil)))))

      (mq/stop-listening! queue-name))))

(deftest ^:parallel fifo-ordering-test
  (qt/with-memory-queue
    (let [queue-name (keyword "queue" (str "fifo-" (gensym)))
          received   (atom [])]
      (mq/listen! queue-name (fn [{:keys [message]}]
                               (swap! received conj message)))

      (doseq [i (range 10)]
        (mq/with-queue queue-name [q]
          (mq/put q i)))
      (Thread/sleep 500)

      (testing "All messages are delivered"
        (is (= (set (range 10)) (set @received))))

      (mq/stop-listening! queue-name))))
