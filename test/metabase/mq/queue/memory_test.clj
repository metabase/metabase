(ns metabase.mq.queue.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.memory :as q.memory])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(defmacro ^:private with-memory-queue
  [& body]
  `(binding [q.backend/*backend*              :queue.backend/memory
             q.impl/*listeners*               (atom {})
             q.impl/*accumulators*            (atom {})
             q.memory/*queues*                (atom {})
             q.memory/*bundle-registry*       (atom {})
             q.memory/*exclusive-processing*  (atom #{})
             q.memory/*watcher*               (atom nil)]
     (try
       ~@body
       (finally
         (q.backend/shutdown! :queue.backend/memory)))))

(deftest publish-test
  (with-memory-queue
    (let [queue-name (keyword "queue" (str "publish-test-" (gensym)))]
      (testing "Publish lazily creates queue and adds messages"
        (q.backend/publish! :queue.backend/memory queue-name ["test-message"])
        (is (= 1 (q.backend/queue-length :queue.backend/memory queue-name)))

        (q.backend/publish! :queue.backend/memory queue-name ["test-message2"])
        (is (= 2 (q.backend/queue-length :queue.backend/memory queue-name))))

      (testing "Publish to new queue lazily creates it"
        (q.backend/publish! :queue.backend/memory :queue/new-queue ["test-message"])
        (is (= 1 (q.backend/queue-length :queue.backend/memory :queue/new-queue)))))))

(deftest queue-length-test
  (with-memory-queue
    (testing "Queue length on non-existent queue returns 0"
      (is (= 0 (q.backend/queue-length :queue.backend/memory :queue/non-existent-queue))))

    (let [queue-name (keyword "queue" (str "length-test-" (gensym)))]
      (testing "Queue length returns correct count"
        (is (= 0 (q.backend/queue-length :queue.backend/memory queue-name)))

        (q.backend/publish! :queue.backend/memory queue-name ["msg1"])
        (q.backend/publish! :queue.backend/memory queue-name ["msg2"])
        (is (= 2 (q.backend/queue-length :queue.backend/memory queue-name)))))))

(deftest exclusive-memory-test
  (with-memory-queue
    (let [queue-name    :queue/exclusive-test
          concurrency   (atom 0)
          max-seen      (atom 0)
          done-latch    (CountDownLatch. 5)]
      (testing "Exclusive queue allows only one message at a time"
        (mq/listen! queue-name
                    {:exclusive true}
                    (fn [_msg]
                      (let [c (swap! concurrency inc)]
                        (swap! max-seen max c)
                        (Thread/sleep 50)
                        (swap! concurrency dec)
                        (.countDown done-latch))))
        (q.backend/start! :queue.backend/memory)
        (q.backend/publish! :queue.backend/memory queue-name ["msg1"])
        (q.backend/publish! :queue.backend/memory queue-name ["msg2"])
        (q.backend/publish! :queue.backend/memory queue-name ["msg3"])
        (q.backend/publish! :queue.backend/memory queue-name ["msg4"])
        (q.backend/publish! :queue.backend/memory queue-name ["msg5"])
        (is (.await done-latch 10 TimeUnit/SECONDS) "All messages should be processed within timeout")
        (is (= 1 @max-seen) "Only one message should be processed at a time")))))
