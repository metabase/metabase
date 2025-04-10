(ns metabase.queue.queue-test
  (:require
   [clojure.test :refer :all]
   [metabase.queue.queue :as m.queue]))

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
  (let [queue-name :queue/test-queue]
    (m.queue/clear-queue! queue-name)
    (m.queue/with-queue queue-name [queue]
      (m.queue/put queue "test1")
      (m.queue/put queue "test2")
      (m.queue/put queue "test3")

      (testing "When nothing has been flushed the to queue, the handler should not be called"
        (is (nil? (m.queue/poll! queue-name identity)))))

    (testing "After queue flushes, the handler should be called with the messages"
      (is (= 3 (m.queue/queue-length queue-name)))
      (is (= ["test1" "test2" "test3"] (m.queue/poll! queue-name identity))))

    (testing "After polling the queue should be empty"
      (is (= 0 (m.queue/queue-length queue-name)))
      (is (not (m.queue/poll! queue-name identity))))

    (testing "If the handler throws an exception, the message should not be deleted from the queue"
      (m.queue/with-queue queue-name [queue]
        (m.queue/put queue "test4"))

      (try
        (do
          (m.queue/poll! queue-name (fn [_] (throw (Exception. "Test exception"))))
          (is (not "Exception should have been thrown")))
        (catch Exception _
          (is (= 1 (m.queue/queue-length queue-name)))))
      (m.queue/poll! queue-name (fn [messages] (is (= ["test4"] messages)))))))

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
        threads 20
        num-messages 1000
        thread-messages (quot num-messages threads)]
    (letfn [(handler [_payload] (swap! counter inc))]
      (time
       (let [futures (doall
                      (for [_ (range threads)]
                        (future
                          (dotimes [n thread-messages]
                            (m.queue/with-queue :queue/queue1 [queue]
                              (m.queue/put queue (str "test" n)))
                            (m.queue/poll! :queue/queue1 handler)))))]
         (run! deref futures)
         (is (= num-messages @counter)))))))
