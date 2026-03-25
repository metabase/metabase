(ns metabase.mq.queue.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.listener :as listener]
   [metabase.mq.memory :as memory]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(defmacro ^:private with-memory-queue
  [& body]
  `(binding [q.backend/*backend*        :queue.backend/memory
             listener/*listeners*        (atom {})
             memory/*channels*           (atom {})
             q.memory/*bundle-registry*  (atom {})]
     (try
       ~@body
       (finally
         (q.backend/shutdown! :queue.backend/memory)))))

(deftest publish-test
  (with-memory-queue
    (let [queue-name (keyword "queue" (str "publish-test-" (gensym)))]
      (testing "Publish lazily creates channel and adds messages"
        (q.backend/publish! :queue.backend/memory queue-name ["test-message"])
        (q.backend/publish! :queue.backend/memory queue-name ["test-message2"]))

      (testing "Publish to new queue lazily creates it"
        (q.backend/publish! :queue.backend/memory :queue/new-queue ["test-message"])))))

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
