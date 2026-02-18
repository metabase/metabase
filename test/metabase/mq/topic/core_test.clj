(ns metabase.mq.topic.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.topic.test-util :as tpt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel e2e-publish-subscribe-test
  (tpt/with-memory-topics [recent]
    (let [received (atom [])]
      (mq/subscribe! :topic/e2e "test-handler"
                     (fn [{:keys [messages]}]
                       (swap! received into messages)))

      (testing "Messages are received by subscriber"
        (mq/publish! :topic/e2e ["message-1"])
        (mq/publish! :topic/e2e ["message-2"])
        (Thread/sleep 200)
        (is (= ["message-1" "message-2"] @received)))

      (testing "Published messages tracked"
        (is (= 2 (count @(:published-messages recent)))))

      (testing "Unsubscribe stops delivery"
        (mq/unsubscribe! :topic/e2e "test-handler")
        (mq/publish! :topic/e2e ["message-3"])
        (Thread/sleep 200)
        (is (= ["message-1" "message-2"] @received))))))

(deftest ^:parallel batch-publish-e2e-test
  (tpt/with-memory-topics [_recent]
    (let [received (atom [])]
      (mq/subscribe! :topic/batch "batch-handler"
                     (fn [{:keys [messages]}]
                       (swap! received into messages)))

      (mq/publish! :topic/batch ["a" "b" "c"])
      (Thread/sleep 200)

      (testing "Batch of messages delivered together"
        (is (= ["a" "b" "c"] @received)))

      (mq/unsubscribe! :topic/batch "batch-handler"))))

(deftest ^:parallel fan-out-e2e-test
  (tpt/with-memory-topics [_recent]
    (let [received-a (atom [])
          received-b (atom [])]
      (mq/subscribe! :topic/fan-out "handler-a"
                     (fn [{:keys [messages]}]
                       (swap! received-a into messages)))
      (mq/subscribe! :topic/fan-out "handler-b"
                     (fn [{:keys [messages]}]
                       (swap! received-b into messages)))

      (mq/publish! :topic/fan-out ["broadcast-msg"])
      (Thread/sleep 200)

      (testing "Both subscribers receive the broadcast"
        (is (= ["broadcast-msg"] @received-a))
        (is (= ["broadcast-msg"] @received-b)))

      (mq/unsubscribe! :topic/fan-out "handler-a")
      (mq/unsubscribe! :topic/fan-out "handler-b"))))

(deftest ^:parallel error-handling-e2e-test
  (tpt/with-memory-topics [recent]
    (let [received (atom [])]
      (mq/subscribe! :topic/errors "error-handler"
                     (fn [{:keys [messages]}]
                       (when (= ["fail"] messages)
                         (throw (ex-info "Handler error" {})))
                       (swap! received into messages)))

      (mq/publish! :topic/errors ["ok-1"])
      (mq/publish! :topic/errors ["fail"])
      (mq/publish! :topic/errors ["ok-2"])
      (Thread/sleep 200)

      (testing "Non-error messages are delivered"
        (is (= ["ok-1" "ok-2"] @received)))

      (testing "Errors are tracked"
        (is (= 1 (count @(:errors recent)))))

      (mq/unsubscribe! :topic/errors "error-handler"))))

(deftest ^:parallel late-subscriber-test
  (tpt/with-memory-topics [_recent]
    (mq/publish! :topic/late ["old-message"])

    (let [received (atom [])]
      (mq/subscribe! :topic/late "late-handler"
                     (fn [{:keys [messages]}]
                       (swap! received into messages)))

      (mq/publish! :topic/late ["new-message"])
      (Thread/sleep 200)

      (testing "Late subscriber only sees new messages"
        (is (= ["new-message"] @received)))

      (mq/unsubscribe! :topic/late "late-handler"))))
