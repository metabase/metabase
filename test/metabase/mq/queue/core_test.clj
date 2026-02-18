(ns metabase.mq.queue.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.queue.core :as m.queue]
   [metabase.mq.queue.test-util :as qt])
  (:import (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest ^:parallel e2e-test
  (qt/with-memory-queue [recent]
    (let [heard-messages (atom [])
          queue-name (keyword "queue" (str "core-e2e-test-" (gensym)))]
      (m.queue/listen! queue-name (fn [{:keys [message]}]
                                    (swap! heard-messages conj message)
                                    (when (= "error!" message)
                                      (throw (ex-info "Message Error" {:message message})))))

      (testing "The messages are heard and processed"
        (m.queue/with-queue queue-name [q]
          (m.queue/put q "test message 1")
          (m.queue/put q "test message 2"))
        (Thread/sleep 200)

        (is (= ["test message 1" "test message 2"] @heard-messages))
        (is (= 2 (count @(:successful-callbacks recent))))
        (is (= 0 (count @(:failed-callbacks recent)))))

      (testing "The error messages are heard and retried up to max failures"
        (m.queue/with-queue queue-name [q]
          (m.queue/put q "error!"))
        (Thread/sleep 1000)

        (is (= (into ["test message 1" "test message 2"] (repeat 5 "error!")) @heard-messages))
        (is (= 2 (count @(:successful-callbacks recent))))
        (is (= 5 (count @(:failed-callbacks recent)))))

      (m.queue/stop-listening! queue-name)
      (is (= 1 (count @(:close-queue-callbacks recent)))))))

(deftest ^:parallel publish-to-undefined-queue-test
  (qt/with-memory-queue [_recent]
    (testing "with-queue on an undefined queue throws"
      (is (thrown-with-msg? ExceptionInfo #"Queue not defined"
                            (m.queue/with-queue :queue/nonexistent [q]
                              (m.queue/put q "msg")))))))

(deftest ^:parallel with-queue-success-test
  (qt/with-memory-queue [_recent]
    (let [queue-name (keyword "queue" (str "wq-success-" (gensym)))]
      (m.queue/listen! queue-name (fn [_msg] nil))

      (testing "with-queue publishes buffered messages on success"
        (let [result (m.queue/with-queue queue-name [q]
                       (m.queue/put q "a")
                       (m.queue/put q "b")
                       :done)]
          (is (= :done result))
          (Thread/sleep 200)
          (is (= 0 (m.queue/queue-length queue-name)))))

      (m.queue/stop-listening! queue-name))))

(deftest ^:parallel with-queue-exception-discards-test
  (qt/with-memory-queue [_recent]
    (let [queue-name (keyword "queue" (str "wq-error-" (gensym)))]
      (m.queue/listen! queue-name (fn [_] nil))

      (testing "with-queue discards buffered messages on exception"
        (is (thrown? Exception
                     (m.queue/with-queue queue-name [q]
                       (m.queue/put q "should-be-discarded")
                       (throw (ex-info "boom" {})))))
        (is (= 0 (m.queue/queue-length queue-name)))))))

(deftest ^:parallel with-queue-undefined-queue-test
  (qt/with-memory-queue [_recent]
    (testing "with-queue on undefined queue throws before body executes"
      (is (thrown-with-msg? ExceptionInfo #"Queue not defined"
                            (m.queue/with-queue :queue/nonexistent [q]
                              (m.queue/put q "msg")))))))

(deftest ^:parallel double-listen-throws-test
  (qt/with-memory-queue [_recent]
    (let [queue-name (keyword "queue" (str "double-listen-" (gensym)))]
      (m.queue/listen! queue-name (fn [_] nil))

      (testing "Registering a second handler on the same queue throws"
        (is (thrown-with-msg? ExceptionInfo #"Queue handler already defined"
                              (m.queue/listen! queue-name (fn [_] nil)))))

      (m.queue/stop-listening! queue-name))))

(deftest ^:parallel fifo-ordering-test
  (qt/with-memory-queue [_recent]
    (let [queue-name (keyword "queue" (str "fifo-" (gensym)))
          received   (atom [])]
      (m.queue/listen! queue-name (fn [{:keys [message]}]
                                    (swap! received conj message)))

      (doseq [i (range 10)]
        (m.queue/with-queue queue-name [q]
          (m.queue/put q i)))
      (Thread/sleep 500)

      (testing "All messages are delivered"
        (is (= (set (range 10)) (set @received))))

      (m.queue/stop-listening! queue-name))))
