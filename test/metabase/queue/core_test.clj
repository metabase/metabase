(ns metabase.queue.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.queue.core :as m.queue]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn mock-handler
  [batch _args]
  (map #(if (= "err" %)
          (throw (ex-info "Error in handler" {:message %}))
          (str % "-out")) batch))

(deftest with-queue
  (let [queue-name :queue/test-queue]
    (m.queue/create-queue! :queue.type/persistent queue-name mock-handler {})
    (m.queue/clear-queue! queue-name)
    (testing "When adding messages, they are not persisted during the block"
      (m.queue/with-queue queue-name [q]
        (is (= 0 (count q)))
        (is (= 0 (m.queue/queue-length queue-name)))

        (m.queue/put q "test1")
        (is (= 1 (count q)))
        (is (= 0 (m.queue/queue-length queue-name)))

        (m.queue/put q "test2")
        (is (= 2 (count q)))
        (is (= 0 (m.queue/queue-length queue-name)))))

    (testing "After the block ends, the messages are persisted"
      (is (= 2 (m.queue/queue-length queue-name))))
    (m.queue/close-queue! queue-name)))

(deftest e2e-test
  (let [counter (atom 0)
        sending-threads 5
        num-messages 1000
        thread-messages (quot num-messages sending-threads)
        queue-name (keyword "queue" (str (gensym "e2e-queue-")))
        _ (m.queue/create-queue! :queue.type/persistent queue-name (fn [payload _args] #p (count #p payload)) {:success (fn [_queue-name response]
                                                                                                                          #p (swap! counter (partial + response)))
                                                                                                               :error (fn [_queue-name e]
                                                                                                                        (log/error e "Error in handler"))})

        start-time (u/start-timer)]
    (log/info (str "Testing with " sending-threads " threads and " num-messages " messages"))
    (let [futures (doall
                   (for [_ (range sending-threads)]
                     (future
                       (dotimes [n thread-messages]
                         (m.queue/with-queue queue-name [q]
                           (m.queue/put q (str "test" n)))))))]
      (run! deref futures))
    (log/info (str "Sent " num-messages " messages in " (u/since-ms start-time) "ms"))
    (let [start (System/currentTimeMillis)] (while (and (not= num-messages @counter) (< (- (System/currentTimeMillis) start) 5000)) (Thread/sleep 50)))
    (log/info (str "Received " @counter " messages in " (u/since-ms start-time) "ms"))
    (m.queue/close-queue! queue-name)

    (is (= num-messages @counter))))

;(deftest queue-length
;  (let [queue-name :queue/test-queue
;        other-queue :queue/test-other]
;
;    (m.queue/clear-queue! queue-name)
;    (m.queue/with-queue other-queue [queue]
;      ;; messages on other queue shouldn't impact the counts
;      (m.queue/put queue "other message"))
;
;    (testing "When the queue is empty, the length should be 0"
;      (is (= 0 (q.backend/queue-length :queue.type/persistent queue-name))))
;
;    (testing "Length is the message length, not the number of rows"
;      (m.queue/with-queue queue-name [queue]
;        (m.queue/put queue "test1"))
;
;      (is (= 1 (q.persistent/queue-length queue-name)))
;
;      (m.queue/with-queue queue-name [queue]
;        (m.queue/put queue "test1")
;        (m.queue/put queue "test2"))
;
;      (is (= 3 (q.persistent/queue-length queue-name))))))
