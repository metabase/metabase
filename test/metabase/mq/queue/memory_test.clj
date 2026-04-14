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
  "Binds `qbe-sym` to a fresh `MemoryQueueBackend` backed by an isolated layer."
  [[qbe-sym] & body]
  `(let [layer# (memory/make-layer)
         ~qbe-sym (q.memory/make-backend layer#)]
     (binding [q.backend/*backend*  ~qbe-sym
               listener/*listeners* (atom {})]
       ~@body)))

(defn- deliver-pending!
  "Drains all pending memory channels for `qbe`'s layer and delivers messages
  synchronously on the current thread. For queue channels, also registers batches so
  ACK/NACK works."
  [qbe]
  (let [layer (:layer qbe)]
    (doseq [channel-name (concat (listener/queue-names) (listener/topic-names))]
      (when-let [messages (#'memory/drain! layer channel-name)]
        (if (= "queue" (namespace channel-name))
          (let [batch-id (str (random-uuid))]
            (#'memory/register-batch! layer batch-id messages)
            (mq.impl/deliver! channel-name messages batch-id qbe))
          (mq.impl/deliver! channel-name messages nil nil))))))

(deftest publish-test
  (with-memory-queue [qbe]
    (let [queue-name (keyword "queue" (str "publish-test-" (gensym)))]
      (testing "Publish lazily creates channel and adds messages"
        (q.backend/publish! qbe queue-name ["test-message"])
        (q.backend/publish! qbe queue-name ["test-message2"]))

      (testing "Publish to new queue lazily creates it"
        (q.backend/publish! qbe :queue/new-queue ["test-message"])))))

(deftest exclusive-memory-test
  (with-memory-queue [qbe]
    (let [queue-name :queue/exclusive-test
          call-count (atom 0)]
      (testing "Exclusive queue processes all messages"
        (mq/listen! queue-name
                    {:exclusive true}
                    (fn [_msg]
                      (swap! call-count inc)))
        (q.backend/publish! qbe queue-name ["msg1"])
        (q.backend/publish! qbe queue-name ["msg2"])
        (q.backend/publish! qbe queue-name ["msg3"])
        (q.backend/publish! qbe queue-name ["msg4"])
        (q.backend/publish! qbe queue-name ["msg5"])
        ;; Deliver synchronously — each drain picks up all pending messages
        (deliver-pending! qbe)
        (is (= 5 @call-count) "All messages should be processed")))))
