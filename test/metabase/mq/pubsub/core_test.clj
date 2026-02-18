(ns metabase.mq.pubsub.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.pubsub.core :as pubsub]
   [metabase.mq.pubsub.test-util :as pst]))

(set! *warn-on-reflection* true)

(deftest ^:parallel e2e-publish-subscribe-test
  (pst/with-memory-pubsub [recent]
    (let [received (atom [])]
      (pubsub/subscribe! :topic/e2e "test-handler"
                         (fn [{:keys [messages]}]
                           (swap! received into messages)))

      (testing "Messages are received by subscriber"
        (pubsub/publish! :topic/e2e ["message-1"])
        (pubsub/publish! :topic/e2e ["message-2"])
        (Thread/sleep 200)
        (is (= ["message-1" "message-2"] @received)))

      (testing "Published messages tracked"
        (is (= 2 (count @(:published-messages recent)))))

      (testing "Unsubscribe stops delivery"
        (pubsub/unsubscribe! :topic/e2e "test-handler")
        (pubsub/publish! :topic/e2e ["message-3"])
        (Thread/sleep 200)
        (is (= ["message-1" "message-2"] @received))))))

(deftest ^:parallel batch-publish-e2e-test
  (pst/with-memory-pubsub [_recent]
    (let [received (atom [])]
      (pubsub/subscribe! :topic/batch "batch-handler"
                         (fn [{:keys [messages]}]
                           (swap! received into messages)))

      (pubsub/publish! :topic/batch ["a" "b" "c"])
      (Thread/sleep 200)

      (testing "Batch of messages delivered together"
        (is (= ["a" "b" "c"] @received)))

      (pubsub/unsubscribe! :topic/batch "batch-handler"))))

(deftest ^:parallel fan-out-e2e-test
  (pst/with-memory-pubsub [_recent]
    (let [received-a (atom [])
          received-b (atom [])]
      (pubsub/subscribe! :topic/fan-out "handler-a"
                         (fn [{:keys [messages]}]
                           (swap! received-a into messages)))
      (pubsub/subscribe! :topic/fan-out "handler-b"
                         (fn [{:keys [messages]}]
                           (swap! received-b into messages)))

      (pubsub/publish! :topic/fan-out ["broadcast-msg"])
      (Thread/sleep 200)

      (testing "Both subscribers receive the broadcast"
        (is (= ["broadcast-msg"] @received-a))
        (is (= ["broadcast-msg"] @received-b)))

      (pubsub/unsubscribe! :topic/fan-out "handler-a")
      (pubsub/unsubscribe! :topic/fan-out "handler-b"))))

(deftest ^:parallel error-handling-e2e-test
  (pst/with-memory-pubsub [recent]
    (let [received (atom [])]
      (pubsub/subscribe! :topic/errors "error-handler"
                         (fn [{:keys [messages]}]
                           (when (= ["fail"] messages)
                             (throw (ex-info "Handler error" {})))
                           (swap! received into messages)))

      (pubsub/publish! :topic/errors ["ok-1"])
      (pubsub/publish! :topic/errors ["fail"])
      (pubsub/publish! :topic/errors ["ok-2"])
      (Thread/sleep 200)

      (testing "Non-error messages are delivered"
        (is (= ["ok-1" "ok-2"] @received)))

      (testing "Errors are tracked"
        (is (= 1 (count @(:errors recent)))))

      (pubsub/unsubscribe! :topic/errors "error-handler"))))

(deftest ^:parallel late-subscriber-test
  (pst/with-memory-pubsub [_recent]
    (pubsub/publish! :topic/late ["old-message"])

    (let [received (atom [])]
      (pubsub/subscribe! :topic/late "late-handler"
                         (fn [{:keys [messages]}]
                           (swap! received into messages)))

      (pubsub/publish! :topic/late ["new-message"])
      (Thread/sleep 200)

      (testing "Late subscriber only sees new messages"
        (is (= ["new-message"] @received)))

      (pubsub/unsubscribe! :topic/late "late-handler"))))
