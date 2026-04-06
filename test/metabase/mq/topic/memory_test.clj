(ns metabase.mq.topic.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.memory :as memory]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.topic.backend :as topic.backend])
  (:import (clojure.lang ExceptionInfo)
           (java.util.concurrent CyclicBarrier)))

(set! *warn-on-reflection* true)

(defmacro ^:private with-memory-topics
  "Sets up an isolated memory topic environment. Does NOT start the background poll thread —
  tests call `deliver-pending!` to drive delivery synchronously."
  [& body]
  `(binding [topic.backend/*backend*              :topic.backend/memory
             listener/*listeners*                  (atom {})
             publish-buffer/*publish-buffer-ms*    0
             publish-buffer/*publish-buffer*       (atom {})
             memory/*channels*                     (atom {})]
     ~@body))

(defn- deliver-pending!
  "Drains all pending memory channels and delivers messages synchronously on the current thread."
  []
  (doseq [channel-name (concat (listener/queue-names) (listener/topic-names))]
    (when-let [messages (#'memory/drain! channel-name)]
      (mq.impl/deliver! channel-name messages nil nil))))

(deftest publish-and-subscribe-test
  (with-memory-topics
    (let [received (atom [])]
      (mq/listen! :topic/test {}
                  (fn [message]
                    (swap! received conj message)))
      (mq/with-topic :topic/test [t]
        (mq/put t "hello"))
      (mq/with-topic :topic/test [t]
        (mq/put t "world"))
      (deliver-pending!)

      (testing "Subscriber receives published messages"
        (is (= ["hello" "world"] @received)))

      (mq/unlisten! :topic/test))))

(deftest batch-publish-test
  (with-memory-topics
    (let [received (atom [])]
      (mq/listen! :topic/batch {}
                  (fn [message]
                    (swap! received conj message)))
      (mq/with-topic :topic/batch [t]
        (mq/put t "msg-1")
        (mq/put t "msg-2")
        (mq/put t "msg-3"))
      (deliver-pending!)

      (testing "Batch of messages received in one row"
        (is (= ["msg-1" "msg-2" "msg-3"] @received)))

      (mq/unlisten! :topic/batch))))

(deftest unsubscribe-stops-delivery-test
  (with-memory-topics
    (let [received (atom [])]
      (mq/listen! :topic/unsub {}
                  (fn [message]
                    (swap! received conj message)))

      (mq/with-topic :topic/unsub [t]
        (mq/put t "before"))
      (deliver-pending!)
      (is (= ["before"] @received))

      (mq/unlisten! :topic/unsub)

      (mq/with-topic :topic/unsub [t]
        (mq/put t "after"))
      (deliver-pending!)

      (testing "No messages received after unsubscribe"
        (is (= ["before"] @received))))))

(deftest error-handling-test
  (with-memory-topics
    (let [received (atom [])]
      (mq/listen! :topic/errors {}
                  (fn [message]
                    (when (= "error!" message)
                      (throw (ex-info "Test error" {})))
                    (swap! received conj message)))

      (mq/with-topic :topic/errors [t]
        (mq/put t "good"))
      (mq/with-topic :topic/errors [t]
        (mq/put t "error!"))
      (mq/with-topic :topic/errors [t]
        (mq/put t "also-good"))
      (deliver-pending!)

      (testing "Good messages are received"
        (is (= ["good" "also-good"] @received)))

      (mq/unlisten! :topic/errors))))

(deftest double-subscribe-throws-test
  (with-memory-topics
    (mq/listen! :topic/double {} (fn [_] nil))
    (testing "Subscribing twice to the same topic throws"
      (is (thrown-with-msg? ExceptionInfo #"Listener already registered"
                            (mq/listen! :topic/double {} (fn [_] nil)))))
    (mq/unlisten! :topic/double)))

(deftest concurrent-publish-ordering-test
  (testing "Concurrent publishes are all delivered"
    (with-memory-topics
      (let [received (atom [])
            n        20
            barrier  (CyclicBarrier. n)]
        (mq/listen! :topic/concurrent-order {}
                    (fn [message]
                      (swap! received conj message)))
        ;; Publish concurrently from n threads
        (let [threads (mapv (fn [i]
                              (let [f (bound-fn []
                                        (.await barrier)
                                        (mq/with-topic :topic/concurrent-order [t]
                                          (mq/put t (str "msg-" i))))]
                                (Thread. ^Runnable f)))
                            (range n))]
          (run! (fn [^Thread t] (.start t)) threads)
          (run! (fn [^Thread t] (.join t 5000)) threads))
        (deliver-pending!)
        (testing "All messages delivered exactly once"
          (is (= n (count @received))))
        (testing "No duplicate messages"
          (is (= (count @received) (count (distinct @received)))))
        (mq/unlisten! :topic/concurrent-order)))))

(deftest topic-isolation-test
  (with-memory-topics
    (let [received-a (atom [])
          received-b (atom [])]
      (mq/listen! :topic/isolated-a {}
                  (fn [message]
                    (swap! received-a conj message)))
      (mq/listen! :topic/isolated-b {}
                  (fn [message]
                    (swap! received-b conj message)))

      (mq/with-topic :topic/isolated-a [t]
        (mq/put t "for-a"))
      (mq/with-topic :topic/isolated-b [t]
        (mq/put t "for-b"))
      (deliver-pending!)

      (testing "Messages on topic A don't appear on topic B"
        (is (= ["for-a"] @received-a))
        (is (= ["for-b"] @received-b)))

      (mq/unlisten! :topic/isolated-a)
      (mq/unlisten! :topic/isolated-b))))
