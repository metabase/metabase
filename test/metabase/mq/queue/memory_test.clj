(ns metabase.mq.queue.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.listener :as listener]
   [metabase.mq.memory :as memory]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.test-util :as mq.tu]))

(set! *warn-on-reflection* true)

(defn- depth-for [layer channel-name]
  (some #(when (= channel-name (:channel %)) (:count %)) (memory/depths layer)))

(deftest drop-orphaned-removes-listener-less-messages-test
  (testing "drop-orphaned! removes only messages whose queue is not in the live set"
    (let [layer (memory/make-layer)]
      (memory/publish! layer :queue/live "a")
      (memory/publish! layer :queue/orphan "b")
      (memory/publish! layer :queue/live "c")
      (is (= 1 (memory/drop-orphaned! layer #{:queue/live})) "one orphaned message dropped")
      (is (= 2 (depth-for layer "live")) "live-queue messages retained")
      (is (nil? (depth-for layer "orphan")) "orphaned-queue messages gone"))))

(deftest recover-stale-drops-orphaned-messages-test
  (testing "the memory backend's periodic recovery sweep drops messages for queues with no listener"
    (binding [listener/*listeners* (atom {})
              q.registry/*queues*  (atom {})]
      (let [layer   (memory/make-layer)
            backend (q.memory/make-backend layer)]
        (mq.tu/listen! :queue/has-listener (fn [_]))
        (memory/publish! layer :queue/has-listener "keep")
        (memory/publish! layer :queue/no-listener "drop")
        (q.backend/recover-stale! backend 1000 5)
        (is (= 1 (depth-for layer "has-listener")) "messages with a listener are kept")
        (is (nil? (depth-for layer "no-listener")) "orphaned messages are dropped")))))

(deftest publish-test
  (mq.tu/with-test-mq [ctx]
    (let [queue-name (keyword "queue" (str "publish-test-" (gensym)))
          received   (atom [])]
      (mq.tu/listen! queue-name (fn [msg] (swap! received conj msg)))
      (testing "Publish lazily creates channel and delivers messages"
        (mq/with-queue queue-name [q]
          (mq/put q "test-message")
          (mq/put q "test-message2"))
        (mq.tu/flush! ctx)
        (is (= ["test-message" "test-message2"] @received))))))

(deftest exclusive-memory-test
  (mq.tu/with-test-mq [ctx]
    (let [queue-name :queue/exclusive-test
          received   (atom [])]
      (q.registry/register-queue! queue-name {:transactional :try :exclusive true})
      (mq.tu/listen! queue-name (fn [msg] (swap! received conj msg)))
      (testing "Exclusive queue processes all messages"
        (mq/with-queue queue-name [q]
          (mq/put q "msg1")
          (mq/put q "msg2")
          (mq/put q "msg3")
          (mq/put q "msg4")
          (mq/put q "msg5"))
        (mq.tu/flush! ctx)
        (is (= ["msg1" "msg2" "msg3" "msg4" "msg5"] @received))))))
