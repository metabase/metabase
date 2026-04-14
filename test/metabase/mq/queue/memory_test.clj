(ns metabase.mq.queue.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.memory :as memory]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]))

(set! *warn-on-reflection* true)

(defmacro ^:private with-memory-queue
  [& body]
  `(binding [q.backend/*backend*        :queue.backend/memory
             listener/*listeners*        (atom {})
             memory/*channels*           (atom {})
             q.memory/*batch-registry*  (atom {})]
     ~@body))

(defn- deliver-pending!
  "Drains all pending memory channels and delivers messages synchronously on the current thread.
  For queue channels, also registers batchs so ACK/NACK works."
  []
  (doseq [channel-name (concat (listener/queue-names) (listener/topic-names))]
    (when-let [messages (#'memory/drain! channel-name)]
      (if (= "queue" (namespace channel-name))
        (let [batch-id (str (random-uuid))]
          (#'memory/register-batch! batch-id messages)
          (mq.impl/deliver! channel-name messages batch-id :queue.backend/memory))
        (mq.impl/deliver! channel-name messages nil nil)))))

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
    (let [queue-name :queue/exclusive-test
          call-count (atom 0)]
      (testing "Exclusive queue processes all messages"
        (mq/listen! queue-name
                    {:exclusive true}
                    (fn [_msg]
                      (swap! call-count inc)))
        (q.backend/publish! :queue.backend/memory queue-name ["msg1"])
        (q.backend/publish! :queue.backend/memory queue-name ["msg2"])
        (q.backend/publish! :queue.backend/memory queue-name ["msg3"])
        (q.backend/publish! :queue.backend/memory queue-name ["msg4"])
        (q.backend/publish! :queue.backend/memory queue-name ["msg5"])
        ;; Deliver synchronously — each drain picks up all pending messages
        (deliver-pending!)
        (is (= 5 @call-count) "All messages should be processed")))))
