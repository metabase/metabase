(ns metabase.pubsub.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.pubsub.backend :as ps.backend]
   [metabase.pubsub.test-util :as pst]))

(set! *warn-on-reflection* true)

(deftest ^:parallel publish-and-subscribe-test
  (pst/with-memory-pubsub [recent]
    (let [received (atom [])]
      (ps.backend/subscribe! :pubsub.backend/memory :topic/test "sub-1"
                             (fn [{:keys [messages]}]
                               (swap! received into messages)))
      (ps.backend/publish! :pubsub.backend/memory :topic/test ["hello"])
      (ps.backend/publish! :pubsub.backend/memory :topic/test ["world"])
      (Thread/sleep 200)

      (testing "Subscriber receives published messages"
        (is (= ["hello" "world"] @received)))

      (testing "Published messages are tracked"
        (is (= 2 (count @(:published-messages recent)))))

      (testing "Received messages are tracked"
        (is (= 2 (count @(:received-messages recent)))))

      (ps.backend/unsubscribe! :pubsub.backend/memory :topic/test "sub-1"))))

(deftest ^:parallel batch-publish-test
  (pst/with-memory-pubsub [_recent]
    (let [received (atom [])]
      (ps.backend/subscribe! :pubsub.backend/memory :topic/batch "sub-1"
                             (fn [{:keys [messages]}]
                               (swap! received into messages)))
      (ps.backend/publish! :pubsub.backend/memory :topic/batch ["msg-1" "msg-2" "msg-3"])
      (Thread/sleep 200)

      (testing "Batch of messages received in one row"
        (is (= ["msg-1" "msg-2" "msg-3"] @received)))

      (ps.backend/unsubscribe! :pubsub.backend/memory :topic/batch "sub-1"))))

(deftest ^:parallel fan-out-test
  (pst/with-memory-pubsub [recent]
    (let [received-1 (atom [])
          received-2 (atom [])]
      (ps.backend/subscribe! :pubsub.backend/memory :topic/fan-out "sub-1"
                             (fn [{:keys [messages]}]
                               (swap! received-1 into messages)))
      (ps.backend/subscribe! :pubsub.backend/memory :topic/fan-out "sub-2"
                             (fn [{:keys [messages]}]
                               (swap! received-2 into messages)))

      (ps.backend/publish! :pubsub.backend/memory :topic/fan-out ["broadcast"])
      (Thread/sleep 200)

      (testing "Both subscribers receive the message"
        (is (= ["broadcast"] @received-1))
        (is (= ["broadcast"] @received-2)))

      (testing "Received messages tracked for each subscriber"
        (is (= 2 (count @(:received-messages recent)))))

      (ps.backend/unsubscribe! :pubsub.backend/memory :topic/fan-out "sub-1")
      (ps.backend/unsubscribe! :pubsub.backend/memory :topic/fan-out "sub-2"))))

(deftest ^:parallel subscribe-only-sees-new-messages-test
  (pst/with-memory-pubsub [_recent]
    (ps.backend/publish! :pubsub.backend/memory :topic/late-join ["before-subscribe"])
    (let [received (atom [])]
      (ps.backend/subscribe! :pubsub.backend/memory :topic/late-join "late-sub"
                             (fn [{:keys [messages]}]
                               (swap! received into messages)))

      (ps.backend/publish! :pubsub.backend/memory :topic/late-join ["after-subscribe"])
      (Thread/sleep 200)

      (testing "Subscriber only sees messages published after subscribing"
        (is (= ["after-subscribe"] @received)))

      (ps.backend/unsubscribe! :pubsub.backend/memory :topic/late-join "late-sub"))))

(deftest ^:parallel unsubscribe-stops-delivery-test
  (pst/with-memory-pubsub [_recent]
    (let [received (atom [])]
      (ps.backend/subscribe! :pubsub.backend/memory :topic/unsub "sub-1"
                             (fn [{:keys [messages]}]
                               (swap! received into messages)))

      (ps.backend/publish! :pubsub.backend/memory :topic/unsub ["before"])
      (Thread/sleep 200)
      (is (= ["before"] @received))

      (ps.backend/unsubscribe! :pubsub.backend/memory :topic/unsub "sub-1")

      (ps.backend/publish! :pubsub.backend/memory :topic/unsub ["after"])
      (Thread/sleep 200)

      (testing "No messages received after unsubscribe"
        (is (= ["before"] @received))))))

(deftest ^:parallel error-handling-test
  (pst/with-memory-pubsub [recent]
    (let [received (atom [])]
      (ps.backend/subscribe! :pubsub.backend/memory :topic/errors "error-sub"
                             (fn [{:keys [messages]}]
                               (when (= ["error!"] messages)
                                 (throw (ex-info "Test error" {})))
                               (swap! received into messages)))

      (ps.backend/publish! :pubsub.backend/memory :topic/errors ["good"])
      (ps.backend/publish! :pubsub.backend/memory :topic/errors ["error!"])
      (ps.backend/publish! :pubsub.backend/memory :topic/errors ["also-good"])
      (Thread/sleep 200)

      (testing "Good messages are received"
        (is (= ["good" "also-good"] @received)))

      (testing "Errors are tracked"
        (is (= 1 (count @(:errors recent)))))

      (ps.backend/unsubscribe! :pubsub.backend/memory :topic/errors "error-sub"))))
