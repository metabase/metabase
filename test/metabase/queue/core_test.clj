(ns metabase.queue.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.queue.core :as m.queue]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(deftest e2e-test
  (doseq [backend [:queue.backend/appdb :queue.backend/memory]]
    (testing (str "Testing backend " backend)
      (binding [m.queue/*backend* backend]
        (let [heard-batches (atom [])
              queue-name (keyword (gensym "queue/core-e2e-test-"))]
          (m.queue/listen! queue-name (fn [payload _args] (swap! heard-batches conj payload)))
          (testing "When adding messages, they are not persisted during the with-queue block"
            (m.queue/with-queue queue-name [q]
              (is (= 0 (count q)))
              (is (= 0 (m.queue/queue-length queue-name)))
              (is (= [] @heard-batches))

              (m.queue/put q "test1")
              (is (= 1 (count q)))
              (is (= 0 (m.queue/queue-length queue-name)))
              (is (= [] @heard-batches))

              (m.queue/put q "test2")
              (is (= 2 (count q)))
              (is (= 0 (m.queue/queue-length queue-name)))
              (is (= [] @heard-batches)))

            (testing "After the block ends, the messages are heard"
              (Thread/sleep 500)                            ;; wait for message to get processed
              (is (= [["test1" "test2"]] @heard-batches)))
            (m.queue/stop-listening! queue-name)))))))

;(deftest e2e-test
;  (let [counter (atom 0)
;        sending-threads 5
;        num-messages 1000
;        thread-messages (quot num-messages sending-threads)
;        queue-name (keyword "queue" (str (gensym "e2e-queue-")))
;        _ (m.queue/listen! queue-name (fn [payload _args] #p (count #p payload)))
;
;        start-time (u/start-timer)]
;    (log/info (str "Testing with " sending-threads " threads and " num-messages " messages"))
;    (let [futures (doall
;                    (for [_ (range sending-threads)]
;                      (future
;                        (dotimes [n thread-messages]
;                          (m.queue/with-queue queue-name [q]
;                            (m.queue/put q (str "test" n)))))))]
;      (run! deref futures))
;    (log/info (str "Sent " num-messages " messages in " (u/since-ms start-time) "ms"))
;    (let [start (System/currentTimeMillis)] (while (and (not= num-messages @counter) (< (- (System/currentTimeMillis) start) 5000)) (Thread/sleep 50)))
;    (log/info (str "Received " @counter " messages in " (u/since-ms start-time) "ms"))
;    (m.queue/stop-listening! queue-name)
;
;    (is (= num-messages @counter))))
