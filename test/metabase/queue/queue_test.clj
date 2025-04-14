(ns metabase.queue.queue-test
  (:require
   [clojure.test :refer :all]
   [metabase.queue.queue :as m.queue]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.queue :as u.queue]))

(set! *warn-on-reflection* true)

(deftest queue-length
  (let [queue-name :queue/test-queue
        other-queue :queue/test-other]

    (m.queue/clear-queue! queue-name)
    (m.queue/with-queue other-queue [queue]
      ;; messages on other queue shouldn't impact the counts
      (m.queue/put queue "other message"))

    (testing "When the queue is empty, the length should be 0"
      (is (= 0 (m.queue/queue-length queue-name))))

    (testing "Length is the message length, not the number of rows"
      (m.queue/with-queue queue-name [queue]
        (m.queue/put queue "test1"))

      (is (= 1 (m.queue/queue-length queue-name)))

      (m.queue/with-queue queue-name [queue]
        (m.queue/put queue "test1")
        (m.queue/put queue "test2"))

      (is (= 3 (m.queue/queue-length queue-name))))))

(deftest poll
  (let [queue-name :queue/test-queue
        listener (m.queue/->BatchedPersistentQueue queue-name)]
    (m.queue/clear-queue! queue-name)
    (m.queue/with-queue queue-name [queue]
      (m.queue/put queue "test1")
      (m.queue/put queue "test2")
      (m.queue/put queue "test3")

      (testing "When nothing has been flushed the to queue, the handler should not be called"
        (is (= [nil 0] (u.queue/process-batch! listener identity)))))

    (testing "After queue flushes, the handler should be called with the messages"
      (is (= 3 (m.queue/queue-length queue-name)))
      (is (= [["test1" "test2" "test3"] 3] (u.queue/process-batch! listener identity))))

    (testing "After polling the queue should be empty"
      (is (= 0 (m.queue/queue-length queue-name)))
      (is (= [nil 0] (u.queue/process-batch! listener identity))))

    (testing "If the handler throws an exception, the message should not be deleted from the queue"
      (m.queue/with-queue queue-name [queue]
        (m.queue/put queue "test4"))

      (try
        (do
          (u.queue/process-batch! listener (fn [_] (throw (Exception. "Test exception"))))
          (is (not "Exception should have been thrown")))
        (catch Exception _
          (is (= 1 (m.queue/queue-length queue-name)))))
      (u.queue/process-batch! listener (fn [messages] (is (= ["test4"] messages)))))))

(deftest with-queue
  (let [queue-name :queue/test-queue]
    (m.queue/clear-queue! queue-name)
    (testing "When adding messages, they are persisted after the block ends"
      (m.queue/with-queue queue-name [my-queue]
        (is (= 0 (count my-queue)))
        (is (= 0 (m.queue/queue-length queue-name)))

        (m.queue/put my-queue "test1")
        (is (= 1 (count my-queue)))
        (is (= 0 (m.queue/queue-length queue-name)))

        (m.queue/put my-queue "test2")
        (is (= 2 (count my-queue)))
        (is (= 0 (m.queue/queue-length queue-name))))

      (is (= 2 (m.queue/queue-length queue-name))))))

(deftest e2e-test
  (let [counter (atom 0)
        sending-threads 5
        listener-count 1
        num-messages 1000
        thread-messages (quot num-messages sending-threads)
        queue-name (gensym "e2e-queue")
        listener-names (map (fn [_] (str "e2e-listener-" (random-uuid))) (range listener-count))
        _ (doseq [listener-name listener-names] (u.queue/listen! listener-name
                                                                 (m.queue/->BatchedPersistentQueue queue-name)
                                                                 (fn [_payload] _payload (swap! counter inc))
                                                                 {}) listener-names)
        start-time (u/start-timer)]
    (log/info (str "Testing with " sending-threads " threads and " listener-count " listeners and "  num-messages " messages"))
    (let [futures (doall
                   (for [_ (range sending-threads)]
                     (future
                       (dotimes [n thread-messages]
                         (m.queue/with-queue queue-name [q]
                           (m.queue/put q (str "test" n)))))))]
      (run! deref futures))
    (log/info (str "Sent " num-messages " messages in " (u/since-ms start-time) "ms"))
    (let [start (System/currentTimeMillis)] (while (and (not= num-messages @counter) (< (- (System/currentTimeMillis) start) 50000)) (Thread/sleep 50)))
    (log/info (str "Received " @counter " messages in " (u/since-ms start-time) "ms"))
    (for [listener-name listener-names]
      (u.queue/stop-listening! listener-name))
    (is (= num-messages @counter))))
